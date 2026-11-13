import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Book, BookNote } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getLocalBookFilename, INIT_BOOK_CONFIG } from '@/utils/book';
import type { BaseDir } from '@/types/system';
import { withReadingStatus } from '@/app/library/utils/libraryUtils';
import { parseAudiobook } from '@/libs/audiobook/metadata';
import { createAudiobookSession } from '@/libs/audiobook/session';
import { audioMimeType, blobFromFile, describeMediaError } from '@/libs/audiobook/source';
import { CoverColor, sampleCoverColor } from '@/libs/audiobook/palette';
import {
  AudioChapter,
  chapterIndexAt,
  clampPosition,
  clampSkip,
  clampSpeed,
  DEFAULT_SKIP_SECONDS,
  isUndoableJump,
  Jump,
  JumpKind,
  progressFromPosition,
  sleepDeadline,
  sleepSecondsLeft,
  SleepOption,
} from '@/libs/audiobook/player';

const CONFIG_SAVE_MS = 10_000;
const LIBRARY_SAVE_MS = 30_000;
const FINISHED_WITHIN_SECONDS = 5;
const AUDIO_LOCATION = 'audio:';
const SKIP_KEY = 'readest-audiobook-skip';

const readSkip = () => {
  const saved = Number(typeof localStorage === 'undefined' ? NaN : localStorage.getItem(SKIP_KEY));
  return Number.isFinite(saved) && saved > 0 ? clampSkip(saved) : DEFAULT_SKIP_SECONDS;
};

/** Where the book was left: the config's `audio:<seconds>`, else the book's synced progress. */
const savedPosition = (location: string | undefined, progress: [number, number] | undefined) => {
  if (location?.startsWith(AUDIO_LOCATION)) {
    const seconds = Number(location.slice(AUDIO_LOCATION.length));
    if (Number.isFinite(seconds)) return seconds;
  }
  return progress?.[0] ?? 0;
};

export const bookmarkSeconds = (note: Pick<BookNote, 'cfi'>) =>
  Number(note.cfi.slice(AUDIO_LOCATION.length));

const isAudioBookmark = (note: BookNote) =>
  note.type === 'bookmark' && note.cfi?.startsWith(AUDIO_LOCATION) && !note.deletedAt;

/**
 * Plays an audiobook: resolves its file, reads its chapters, resumes where this
 * profile left off, and saves progress and bookmarks (to the profile's own config
 * and library entry, so they sync like any book's). `audioProps` goes on <audio>.
 */
export const useAudiobook = (book: Book) => {
  const { envConfig, appService } = useEnv();
  const { settings } = useSettingsStore();
  const { updateBook } = useLibraryStore();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState('');
  const [coverUrl, setCoverUrl] = useState(book.coverImageUrl ?? '');
  const [color, setColor] = useState<CoverColor | null>(null);
  const [error, setError] = useState('');
  const [chapters, setChapters] = useState<AudioChapter[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [skipSeconds, setSkipState] = useState(readSkip);
  const [sleep, setSleepState] = useState<SleepOption>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [bookmarks, setBookmarks] = useState<BookNote[]>([]);
  const [jump, setJump] = useState<Jump | null>(null);
  const [now, setNow] = useState(Date.now());

  const resume = useRef(0);
  const latest = useRef({ position: 0, duration: 0 });
  const lastSaved = useRef({ config: 0, library: 0 });
  const chaptersRef = useRef<AudioChapter[]>([]);
  chaptersRef.current = chapters;
  const sourceRef = useRef<{ path: string; base: BaseDir } | null>(null);
  const blobUrlRef = useRef('');
  const triedBlob = useRef(false);
  const sessionRef = useRef<ReturnType<typeof createAudiobookSession> | null>(null);

  const persist = useCallback(
    async (withLibrary: boolean) => {
      if (!appService) return;
      const { position: at, duration: total } = latest.current;
      if (total <= 0) return;
      const progress = progressFromPosition(at, total);
      const stamp = Date.now();
      lastSaved.current.config = stamp;
      const config = await appService.loadBookConfig(book, settings);
      await appService.saveBookConfig(
        book,
        {
          ...INIT_BOOK_CONFIG,
          ...config,
          location: `${AUDIO_LOCATION}${progress[0]}`,
          progress,
          updatedAt: stamp,
        },
        settings,
      );
      if (!withLibrary) return;
      lastSaved.current.library = stamp;
      const stored = useLibraryStore.getState().getBookByHash(book.hash) ?? book;
      const finished = total - at <= FINISHED_WITHIN_SECONDS;
      const status = finished
        ? 'finished'
        : stored.readingStatus && stored.readingStatus !== 'unread'
          ? stored.readingStatus
          : 'reading';
      const next =
        status === stored.readingStatus
          ? { ...stored, updatedAt: stamp }
          : withReadingStatus(stored, status);
      await updateBook(envConfig, { ...next, progress });
    },
    [appService, book, envConfig, settings, updateBook],
  );

  // Find the file, its chapters and cover, and where this profile left off.
  useEffect(() => {
    let cancelled = false;
    let coverObjectUrl = '';
    void (async () => {
      if (!appService) return;
      try {
        // The copy Readest stored, or the original file for a book opened in place.
        const managed = getLocalBookFilename(book);
        let path = managed;
        let base: BaseDir = 'Books';
        if (!(await appService.exists(managed, 'Books'))) {
          if (!book.filePath) throw new Error('The audio file is not on this device.');
          path = book.filePath;
          base = 'None';
        }
        const file = await appService.openFile(path, base);
        const info = await parseAudiobook(file);
        (file as { close?: () => Promise<void> }).close?.();
        const mime = audioMimeType(book.format);
        const sourceFile = { path, base };
        sourceRef.current = sourceFile;
        // Android and desktop stream the file through an asset URL (it is never loaded into
        // memory). iOS cannot play media from that URL, so it gets a typed blob instead, and
        // any platform falls back to one if the asset URL does not play (see onError).
        let url: string;
        if (appService.appPlatform === 'tauri' && !appService.isIOSApp) {
          url = await appService.getImageURL(await appService.resolveFilePath(path, base));
        } else {
          const whole = await appService.openFile(path, base);
          url = URL.createObjectURL(
            appService.appPlatform === 'tauri'
              ? await blobFromFile(whole, mime)
              : new Blob([whole], { type: mime }),
          );
          blobUrlRef.current = url;
          (whole as { close?: () => Promise<void> }).close?.();
        }
        const config = await appService.loadBookConfig(book, settings);
        if (cancelled) return;
        // The embedded cover is same-origin, so its colors can be read.
        if (info.cover) {
          coverObjectUrl = URL.createObjectURL(info.cover);
          setCoverUrl(coverObjectUrl);
        }
        resume.current = savedPosition(config?.location, book.progress);
        setBookmarks((config?.booknotes ?? []).filter(isAudioBookmark));
        setChapters(info.chapters);
        setDuration(info.duration);
        latest.current.duration = info.duration;
        setSrc(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = '';
    };
    // The book's file does not change while the player is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.hash, appService]);

  useEffect(() => {
    if (!coverUrl) return;
    let cancelled = false;
    void sampleCoverColor(coverUrl).then((c) => !cancelled && setColor(c));
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  /** Move to `seconds`. A big jump can be taken back for ten seconds ("Back to"). */
  const seekTo = useCallback((seconds: number, kind: JumpKind = 'seek') => {
    const audio = audioRef.current;
    if (!audio) return;
    const total = latest.current.duration || audio.duration || 0;
    const from = audio.currentTime;
    const to = clampPosition(seconds, total);
    if (isUndoableJump(kind, from, to, chaptersRef.current)) {
      const at = Date.now();
      setJump({ id: at, from, at });
      setNow(at);
    }
    audio.currentTime = to;
    latest.current.position = to;
    setPosition(to);
  }, []);

  const skipBy = useCallback(
    (delta: number) => seekTo((audioRef.current?.currentTime ?? 0) + delta, 'skip'),
    [seekTo],
  );

  const undoJump = useCallback(() => {
    if (!jump) return;
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = jump.from;
      latest.current.position = jump.from;
      setPosition(jump.from);
    }
    setJump(null);
  }, [jump]);

  const play = useCallback(() => void audioRef.current?.play().catch(() => {}), []);
  const pause = useCallback(() => audioRef.current?.pause(), []);
  const toggle = useCallback(() => (audioRef.current?.paused ? play() : pause()), [pause, play]);

  const jumpChapter = useCallback(
    (direction: -1 | 1) => {
      const at = audioRef.current?.currentTime ?? 0;
      const list = chaptersRef.current;
      const index = chapterIndexAt(list, at);
      // Back restarts the chapter first, as most players do, then goes to the one before.
      const target =
        direction === 1
          ? list[index + 1]
          : at - (list[index]?.start ?? 0) > 3
            ? list[index]
            : list[index - 1];
      if (target) seekTo(target.start, 'chapter');
    },
    [seekTo],
  );

  const setSpeed = useCallback((value: number) => {
    const next = clampSpeed(value);
    setSpeedState(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, []);

  const setSkipSeconds = useCallback((seconds: number) => {
    const next = clampSkip(seconds);
    setSkipState(next);
    localStorage.setItem(SKIP_KEY, String(next));
  }, []);

  const setSleep = useCallback(
    (option: SleepOption) => {
      setSleepState(option);
      setNow(Date.now());
      const at = audioRef.current?.currentTime ?? 0;
      const chapter = chaptersRef.current[chapterIndexAt(chaptersRef.current, at)];
      setDeadline(sleepDeadline(option, Date.now(), at, chapter?.end ?? at, speed));
    },
    [speed],
  );

  const saveBookmarks = useCallback(
    async (next: BookNote[]) => {
      setBookmarks(next.filter(isAudioBookmark));
      if (!appService) return;
      const config = await appService.loadBookConfig(book, settings);
      const others = (config?.booknotes ?? []).filter((n) => !next.some((b) => b.id === n.id));
      await appService.saveBookConfig(
        book,
        {
          ...INIT_BOOK_CONFIG,
          ...config,
          booknotes: [...others, ...next],
          updatedAt: Date.now(),
        },
        settings,
      );
    },
    [appService, book, settings],
  );

  /** Save the current moment. */
  const addBookmark = useCallback(
    (label = '') => {
      const at = Math.floor(audioRef.current?.currentTime ?? latest.current.position);
      const chapter = chaptersRef.current[chapterIndexAt(chaptersRef.current, at)];
      const stamp = Date.now();
      const bookmark: BookNote = {
        id: uuidv4(),
        type: 'bookmark',
        cfi: `${AUDIO_LOCATION}${at}`,
        text: chapter?.title ?? '',
        note: label,
        createdAt: stamp,
        updatedAt: stamp,
      };
      return saveBookmarks([...bookmarks, bookmark]);
    },
    [bookmarks, saveBookmarks],
  );

  const removeBookmark = useCallback(
    (id: string) => {
      const stamp = Date.now();
      const next = bookmarks.map((b) =>
        b.id === id ? { ...b, deletedAt: stamp, updatedAt: stamp } : b,
      );
      return saveBookmarks(next);
    },
    [bookmarks, saveBookmarks],
  );

  const goToBookmark = useCallback(
    (bookmark: BookNote) => seekTo(bookmarkSeconds(bookmark), 'bookmark'),
    [seekTo],
  );

  // Sleep timer: pause when the deadline passes.
  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= deadline) {
        audioRef.current?.pause();
        setSleepState(null);
        setDeadline(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  // Let the "Back to" pill run out.
  useEffect(() => {
    if (!jump) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [jump]);

  // Lock screen, notification and headset controls.
  useEffect(() => {
    if (!src) return;
    const session = createAudiobookSession(
      {
        play,
        pause,
        previous: () => jumpChapter(-1),
        next: () => jumpChapter(1),
        seekBy: skipBy,
        seekTo: (seconds) => seekTo(seconds, 'skip'),
      },
      {
        bookHash: book.hash,
        title: book.title,
        author: book.author,
        artwork: coverUrl || undefined,
        skipSeconds,
      },
    );
    sessionRef.current = session;
    return () => {
      session.dispose();
      sessionRef.current = null;
    };
  }, [
    src,
    book.hash,
    book.title,
    book.author,
    coverUrl,
    skipSeconds,
    play,
    pause,
    skipBy,
    seekTo,
    jumpChapter,
  ]);

  useEffect(() => {
    sessionRef.current?.update({ playing, position, duration, speed });
  }, [playing, position, duration, speed]);

  // Keep progress safe when the page goes away.
  useEffect(() => {
    const flush = () => void persist(true);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [persist]);

  /** Props for the <audio> element. */
  const audioProps = {
    ref: audioRef,
    src: src || undefined,
    preload: 'metadata' as const,
    onLoadedMetadata: () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        latest.current.duration = audio.duration;
      }
      audio.playbackRate = speed;
      if (resume.current > 0) audio.currentTime = clampPosition(resume.current, audio.duration);
      resume.current = 0;
    },
    onTimeUpdate: () => {
      const audio = audioRef.current;
      if (!audio) return;
      setPosition(audio.currentTime);
      latest.current.position = audio.currentTime;
      const stamp = Date.now();
      if (!audio.paused && stamp - lastSaved.current.config >= CONFIG_SAVE_MS) {
        void persist(stamp - lastSaved.current.library >= LIBRARY_SAVE_MS);
      }
    },
    onPlay: () => setPlaying(true),
    onPause: () => {
      setPlaying(false);
      void persist(true);
    },
    onEnded: () => {
      setPlaying(false);
      latest.current.position = latest.current.duration;
      void persist(true);
    },
    onError: () => {
      const audio = audioRef.current;
      const source = sourceRef.current;
      // The asset URL did not play: read the file into a typed blob and try that once.
      if (appService && source && !triedBlob.current && !blobUrlRef.current) {
        triedBlob.current = true;
        void (async () => {
          try {
            const whole = await appService.openFile(source.path, source.base);
            const url = URL.createObjectURL(await blobFromFile(whole, audioMimeType(book.format)));
            blobUrlRef.current = url;
            (whole as { close?: () => Promise<void> }).close?.();
            resume.current = latest.current.position;
            setSrc(url);
          } catch {
            setError(describeMediaError(audio?.error?.code));
          }
        })();
        return;
      }
      setError(describeMediaError(audio?.error?.code));
    },
  };

  const chapterIndex = chapterIndexAt(chapters, position);

  return {
    audioProps,
    error,
    coverUrl,
    color,
    chapters,
    chapterIndex,
    chapter: chapters[chapterIndex],
    playing,
    position,
    duration,
    speed,
    skipSeconds,
    sleep,
    sleepLeft: sleepSecondsLeft(deadline, now),
    bookmarks,
    jump,
    now,
    toggle,
    seekTo,
    skipBack: () => skipBy(-skipSeconds),
    skipForward: () => skipBy(skipSeconds),
    previousChapter: () => jumpChapter(-1),
    nextChapter: () => jumpChapter(1),
    undoJump,
    setSpeed,
    setSkipSeconds,
    setSleep,
    addBookmark,
    removeBookmark,
    goToBookmark,
  };
};

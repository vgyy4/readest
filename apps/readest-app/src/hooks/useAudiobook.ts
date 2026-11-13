import { useCallback, useEffect, useRef, useState } from 'react';
import { Book } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getLocalBookFilename, INIT_BOOK_CONFIG } from '@/utils/book';
import type { BaseDir } from '@/types/system';
import { withReadingStatus } from '@/app/library/utils/libraryUtils';
import { parseAudiobook } from '@/libs/audiobook/metadata';
import { createAudiobookSession } from '@/libs/audiobook/session';
import {
  AudioChapter,
  chapterIndexAt,
  clampPosition,
  nextSpeed,
  progressFromPosition,
  SKIP_BACK_SECONDS,
  SKIP_FORWARD_SECONDS,
  sleepDeadline,
  sleepSecondsLeft,
  SleepOption,
} from '@/libs/audiobook/player';

const CONFIG_SAVE_MS = 10_000;
const LIBRARY_SAVE_MS = 30_000;
const FINISHED_WITHIN_SECONDS = 5;
const AUDIO_LOCATION = 'audio:';

/** Where the book was left: the config's `audio:<seconds>`, else the book's synced progress. */
const savedPosition = (location: string | undefined, progress: [number, number] | undefined) => {
  if (location?.startsWith(AUDIO_LOCATION)) {
    const seconds = Number(location.slice(AUDIO_LOCATION.length));
    if (Number.isFinite(seconds)) return seconds;
  }
  return progress?.[0] ?? 0;
};

/**
 * Plays an audiobook: resolves its file, reads its chapters, resumes where this
 * profile left off, and saves progress (to the profile's own config and library
 * entry, so it syncs like any book's). `audioRef` goes on the <audio> element.
 */
export const useAudiobook = (book: Book) => {
  const { envConfig, appService } = useEnv();
  const { settings } = useSettingsStore();
  const { updateBook } = useLibraryStore();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [chapters, setChapters] = useState<AudioChapter[]>([]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [sleep, setSleepState] = useState<SleepOption>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const resume = useRef(0);
  const latest = useRef({ position: 0, duration: 0 });
  const lastSaved = useRef({ config: 0, library: 0 });
  const chaptersRef = useRef<AudioChapter[]>([]);
  chaptersRef.current = chapters;
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

  // Find the file, its chapters, and where this profile left off.
  useEffect(() => {
    let cancelled = false;
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
        // Native: a streaming asset URL (the file is never loaded into memory).
        const url =
          appService.appPlatform === 'tauri'
            ? await appService.getImageURL(await appService.resolveFilePath(path, base))
            : URL.createObjectURL(file);
        const config = await appService.loadBookConfig(book, settings);
        if (cancelled) return;
        resume.current = savedPosition(config?.location, book.progress);
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
    };
    // The book's file does not change while the player is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.hash, appService]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const total = latest.current.duration || audio.duration || 0;
    audio.currentTime = clampPosition(seconds, total);
  }, []);

  const seekBy = useCallback(
    (delta: number) => seekTo((audioRef.current?.currentTime ?? 0) + delta),
    [seekTo],
  );

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
      if (target) seekTo(target.start);
    },
    [seekTo],
  );

  const setSpeed = useCallback((value: number) => {
    setSpeedState(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }, []);

  const cycleSpeed = useCallback(() => setSpeed(nextSpeed(speed)), [setSpeed, speed]);

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

  // Lock screen, notification and headset controls.
  useEffect(() => {
    if (!src) return;
    const session = createAudiobookSession(
      { play, pause, previous: () => jumpChapter(-1), next: () => jumpChapter(1), seekBy, seekTo },
      {
        bookHash: book.hash,
        title: book.title,
        author: book.author,
        artwork: book.coverImageUrl ?? undefined,
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
    book.coverImageUrl,
    play,
    pause,
    seekBy,
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
    onError: () => setError('This audio file could not be played.'),
  };

  const chapterIndex = chapterIndexAt(chapters, position);

  return {
    audioProps,
    error,
    chapters,
    chapterIndex,
    chapter: chapters[chapterIndex],
    playing,
    position,
    duration,
    speed,
    sleep,
    sleepLeft: sleepSecondsLeft(deadline, now),
    toggle,
    seekTo,
    skipBack: () => seekBy(-SKIP_BACK_SECONDS),
    skipForward: () => seekBy(SKIP_FORWARD_SECONDS),
    previousChapter: () => jumpChapter(-1),
    nextChapter: () => jumpChapter(1),
    cycleSpeed,
    setSleep,
  };
};

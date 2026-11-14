import type { AudioPart } from '@/libs/document';
import type { Book } from '@/types/book';
import { AUDIO_EXTS } from './formats';
import type { AudioChapter } from './player';

/**
 * A folder of audio files is one audiobook, as in the Voice app: each file is a chapter, the
 * files play in order, and nobody is asked anything. These are the rules, kept free of file
 * access so they are easy to test.
 */

const AUDIO_EXT_SET = new Set<string>(Object.values(AUDIO_EXTS));
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const normalize = (path: string) => path.replace(/\\/g, '/');
const extOf = (path: string) => normalize(path).split('/').pop()!.split('.').pop()!.toLowerCase();
const dirOf = (path: string) => normalize(path).split('/').slice(0, -1).join('/');
const baseOf = (path: string) =>
  normalize(path)
    .split('/')
    .pop()!
    .replace(/\.[^.]*$/, '');

export const isAudioPath = (path: string) => AUDIO_EXT_SET.has(extOf(path));
export const isImagePath = (path: string) => IMAGE_EXTS.has(extOf(path));

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** "Chapter 2" before "Chapter 10". */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

/**
 * Split a list of files to import into folders of audio (two or more audio files side by side)
 * and everything else. A folder holding a single audio file stays an ordinary book, so one m4b
 * in its own folder imports as it always did.
 */
export const groupAudioFolders = <T extends { path?: string }>(
  files: T[],
): { singles: T[]; folders: { dir: string; files: T[] }[] } => {
  const byDir = new Map<string, T[]>();
  for (const file of files) {
    if (!file.path || !isAudioPath(file.path)) continue;
    const dir = dirOf(file.path);
    byDir.set(dir, [...(byDir.get(dir) ?? []), file]);
  }
  const folders = [...byDir.entries()]
    // Several m4b files side by side are separate audiobooks (an m4b is usually a whole book).
    .filter(([, list]) => list.length >= 2 && !list.every((f) => extOf(f.path!) === 'm4b'))
    .map(([dir, list]) => ({ dir, files: list }));
  const grouped = new Set(folders.flatMap((f) => f.files));
  return { singles: files.filter((f) => !grouped.has(f)), folders };
};

export interface TaggedFile {
  path: string;
  track?: number;
  disc?: number;
}

/**
 * The order the files play in. Track numbers decide when every file has one and no two files
 * share a (disc, track); otherwise the file names do, numbers read as numbers.
 */
export const orderFolderFiles = <T extends TaggedFile>(files: T[]): T[] => {
  const keys = files.map((f) => `${f.disc ?? 1}:${f.track}`);
  const numbered =
    files.length > 0 &&
    files.every((f) => Number.isFinite(f.track) && (f.track as number) > 0) &&
    new Set(keys).size === files.length;
  return [...files].sort((a, b) =>
    numbered
      ? (a.disc ?? 1) - (b.disc ?? 1) || (a.track as number) - (b.track as number)
      : naturalCompare(normalize(a.path), normalize(b.path)),
  );
};

const COVER_NAMES = ['cover', 'folder', 'front', 'albumart', 'album', 'poster', 'artwork'];

/** The picture in the folder that is the book's cover, if there is one. */
export const pickFolderCover = (imagePaths: string[], folderName: string): string | undefined => {
  const images = imagePaths.filter(isImagePath).sort((a, b) => naturalCompare(a, b));
  const folder = folderName.trim().toLowerCase();
  const named = (test: (name: string) => boolean) =>
    images.find((p) => test(baseOf(p).trim().toLowerCase()));
  return (
    named((n) => COVER_NAMES.includes(n)) ??
    named(
      (n) =>
        !!folder && (n === folder || n.includes(folder) || (n.length >= 4 && folder.includes(n))),
    ) ??
    images[0]
  );
};

/** The parts of a book that is a folder of audio files; empty for any other book. */
export const audioPartsOf = (book: Pick<Book, 'metadata'>): AudioPart[] => {
  const parts = book.metadata?.audioParts;
  return Array.isArray(parts) && parts.length >= 2 ? parts : [];
};

/**
 * Where a part is kept, relative to the Books directory (and to the cloud's book folder). The
 * first part is the book's ordinary file; later parts sit beside it as `part-0002.mp3`.
 */
export const extraPartFilename = (hash: string, index: number, ext: string) =>
  `${hash}/part-${String(index + 1).padStart(4, '0')}.${ext}`;

export const totalDuration = (parts: AudioPart[]) => parts.reduce((s, p) => s + p.duration, 0);

/** Seconds from the start of the book at which part `index` begins. */
export const partStart = (parts: AudioPart[], index: number) =>
  parts.slice(0, index).reduce((s, p) => s + p.duration, 0);

/** The part a position in the whole book falls in, and how far into it. */
export const locatePart = (parts: AudioPart[], seconds: number) => {
  let start = 0;
  for (let index = 0; index < parts.length; index++) {
    const end = start + parts[index]!.duration;
    if (seconds < end || index === parts.length - 1) {
      return { index, offset: Math.min(Math.max(0, seconds - start), parts[index]!.duration) };
    }
    start = end;
  }
  return { index: 0, offset: 0 };
};

/** One chapter per part. */
export const partChapters = (parts: AudioPart[]): AudioChapter[] => {
  let start = 0;
  return parts.map((part, i) => {
    const chapter = { title: part.title || `Chapter ${i + 1}`, start, end: start + part.duration };
    start = chapter.end;
    return chapter;
  });
};

/**
 * A folder of audio becomes one book, so none of it may be imported while part of it is still
 * being copied in. Moves the finished audio files of any folder that still has a file arriving
 * back to `growing`, and remembers their sizes so the next look settles them together.
 */
export const holdUnsettledFolders = <T extends { fullPath: string; size: number }>(
  ready: T[],
  growing: T[],
  seen: Map<string, number>,
): { ready: T[]; growing: T[] } => {
  const waiting = new Set(
    growing.filter((e) => isAudioPath(e.fullPath)).map((e) => dirOf(e.fullPath)),
  );
  if (waiting.size === 0) return { ready, growing };
  const held = ready.filter((e) => isAudioPath(e.fullPath) && waiting.has(dirOf(e.fullPath)));
  for (const e of held) seen.set(e.fullPath, e.size);
  return {
    ready: ready.filter((e) => !held.includes(e)),
    growing: [...growing, ...held],
  };
};

/** Where a listener is in a book of several files, saved exactly: the file and the second in it. */
export const partLocation = (index: number, offset: number) =>
  `audio:p${index}:${Math.floor(Math.max(0, offset))}`;

/** The file and second a saved `audio:p<file>:<second>` location names, if it is one. */
export const parsePartLocation = (location: string | undefined) => {
  const match = /^audio:p(\d+):(\d+(?:\.\d+)?)$/.exec(location ?? '');
  return match ? { index: Number(match[1]), offset: Number(match[2]) } : null;
};

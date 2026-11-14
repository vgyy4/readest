import type { Book, BookConfig, BookLookupIndex } from '@/types/book';
import type { AudioPart } from '@/libs/document';
import type { FileSystem } from '@/types/system';
import { audioFormatOf } from '@/libs/audiobook/formats';
import {
  extraPartFilename,
  isAudioPath,
  orderFolderFiles,
  pickFolderCover,
} from '@/libs/audiobook/folder';
import { shrinkCover } from '@/libs/audiobook/cover';
import { parseAudiobook, type AudiobookInfo } from '@/libs/audiobook/metadata';
import { getCoverFilename, getDir, getLocalBookFilename, INIT_BOOK_CONFIG } from '@/utils/book';
import { ClosableFile } from '@/utils/file';
import { isContentURI, isValidURL } from '@/utils/misc';
import { md5, partialMD5 } from '@/utils/md5';
import { getBaseFilename, getFilename } from '@/utils/path';
import { computeCoverHash } from './bookService';

export interface ImportAudioFolderOptions {
  saveBookConfig: (book: Book, config: BookConfig) => Promise<void>;
  generateCoverImageUrl: (book: Book) => Promise<string>;
  lookupIndex?: BookLookupIndex;
}

interface Inspected {
  path: string;
  size: number;
  hash: string;
  info: AudiobookInfo;
}

const extOf = (path: string) => getFilename(path).split('.').pop()!.toLowerCase();

const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

const inspect = async (fs: FileSystem, path: string): Promise<Inspected> => {
  let file: File;
  try {
    file = await fs.openFile(path, 'None');
  } catch (error) {
    throw new Error(`Failed to open ${getFilename(path)}: ${(error as Error).message || error}`);
  }
  try {
    const info = await parseAudiobook(file);
    return { path, size: file.size, hash: await partialMD5(file), info };
  } catch (error) {
    throw new Error(`Failed to read ${getFilename(path)}: ${(error as Error).message || error}`);
  } finally {
    await (file as ClosableFile).close?.().catch?.(() => {});
  }
};

const copyInto = async (fs: FileSystem, from: string, to: string) => {
  if (await fs.exists(to, 'Books')) return;
  if (isContentURI(from)) {
    await fs.copyFile(from, 'None', to, 'Books');
    return;
  }
  try {
    await fs.copyFile(from, 'None', to, 'Books');
  } catch {
    const file = await fs.openFile(from, 'None');
    await fs.writeFile(to, 'Books', await file.arrayBuffer());
    await (file as ClosableFile).close?.().catch?.(() => {});
  }
};

/** The one picture beside the audio files that is the book's cover. */
const folderCover = async (fs: FileSystem, dir: string, folderName: string) => {
  try {
    const items = await fs.readDir(dir, 'None', ['jpg', 'jpeg', 'png', 'webp']);
    const beside = items.map((i) => i.path).filter((p) => !/[\\/]/.test(p));
    const picked = pickFolderCover(beside, folderName);
    return picked ? `${dir.replace(/[\\/]+$/, '')}/${picked}` : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Import a folder of audio files as ONE audiobook, the way the Voice app does: each file is a
 * chapter, they play in order, nothing is asked. The first file is stored as the book's file and
 * the rest beside it (`part-0002.mp3` ...), so the book syncs like any other; `metadata.audioParts`
 * lists them. Re-importing the same files finds the same book (its id comes from every file).
 */
export async function importAudioFolder(
  fs: FileSystem,
  dir: string,
  filePaths: string[],
  books: Book[],
  options: ImportAudioFolderOptions,
): Promise<Book | null> {
  const paths = filePaths.filter(isAudioPath);
  if (paths.length < 2) return null;
  const { saveBookConfig, generateCoverImageUrl, lookupIndex } = options;

  const inspected = await mapLimit(paths, 4, (path) => inspect(fs, path));
  const ordered = orderFolderFiles(
    inspected.map((i) => ({ ...i, track: i.info.track, disc: i.info.disc })),
  );
  const hash = md5(ordered.map((o) => o.hash).join(','));

  const folderName = getBaseFilename(getFilename(dir)) || getFilename(dir);
  const albums = new Set(ordered.map((o) => o.info.album ?? ''));
  const sharedAlbum = albums.size === 1 ? [...albums][0] : '';
  const title = sharedAlbum || folderName;
  const first = ordered[0]!;
  const author = ordered.find((o) => o.info.author)?.info.author ?? '';
  const sourcePaths = ordered.map((o) => o.path);

  const existing = lookupIndex ? lookupIndex.byHash.get(hash) : books.find((b) => b.hash === hash);
  if (existing) {
    existing.deletedAt = null;
    existing.createdAt = Date.now();
    existing.updatedAt = Date.now();
    existing.altFilePaths = [...new Set([...(existing.altFilePaths ?? []), ...sourcePaths])];
    return existing;
  }

  const parts: AudioPart[] = ordered.map((o) => ({
    title: o.info.trackTitle || getBaseFilename(o.path),
    ext: extOf(o.path),
    size: o.size,
    duration: o.info.duration,
  }));
  const format = audioFormatOf(first.path, undefined) ?? 'MP3';
  const language = first.info.language ?? 'en';
  const now = Date.now();
  const book: Book = {
    hash,
    format,
    title,
    sourceTitle: title,
    author,
    primaryLanguage: language,
    metadata: {
      title,
      author,
      language,
      ...(first.info.narrator ? { editor: first.info.narrator } : {}),
      audioParts: parts,
    },
    altFilePaths: sourcePaths,
    createdAt: now,
    updatedAt: now,
    uploadedAt: null,
    deletedAt: null,
    downloadedAt: now,
  };

  await fs.createDir(getDir(book), 'Books', true);
  await copyInto(fs, first.path, getLocalBookFilename(book));
  for (let i = 1; i < ordered.length; i++) {
    await copyInto(fs, ordered[i]!.path, extraPartFilename(hash, i, parts[i]!.ext));
  }

  if (!(await fs.exists(getCoverFilename(book), 'Books'))) {
    let cover: Blob | undefined;
    const picture = await folderCover(fs, dir, folderName);
    if (picture) {
      try {
        const image = await fs.openFile(picture, 'None');
        cover = new Blob([await image.arrayBuffer()], { type: image.type || 'image/jpeg' });
        await (image as ClosableFile).close?.().catch?.(() => {});
      } catch {
        cover = undefined;
      }
    }
    cover ??= ordered.find((o) => o.info.cover)?.info.cover;
    if (cover) {
      await fs.writeFile(
        getCoverFilename(book),
        'Books',
        await (await shrinkCover(cover)).arrayBuffer(),
      );
    }
  }
  book.coverHash = await computeCoverHash(fs, book);

  await saveBookConfig(book, INIT_BOOK_CONFIG);
  books.push(book);
  if (lookupIndex) lookupIndex.byHash.set(book.hash, book);
  book.coverImageUrl = await generateCoverImageUrl(book);
  return book;
}

/** Whether `path` is a plain on-disk path (not a URL), which a folder import needs. */
export const isFolderImportable = (path: string) => !isValidURL(path) && !isContentURI(path);

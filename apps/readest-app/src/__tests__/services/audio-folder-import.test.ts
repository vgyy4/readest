import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { FileSystem } from '@/types/system';

const tags = vi.hoisted(() => ({ byName: new Map<string, Record<string, unknown>>() }));

vi.mock('@/libs/audiobook/metadata', () => ({
  parseAudiobook: async (file: File) => {
    const t = tags.byName.get(file.name);
    if (!t) throw new Error('unreadable');
    return { title: t['album'] ?? file.name, author: '', duration: 0, chapters: [], ...t };
  },
}));
vi.mock('@/libs/audiobook/cover', () => ({ shrinkCover: async (b: Blob) => b }));
vi.mock('@/utils/md5', () => ({
  md5: (s: string) => `md5(${s})`,
  partialMD5: async (f: File) => `h-${f.name}`,
}));

import { importAudioFolder } from '@/services/audioFolderService';

const makeFs = (disk: Record<string, string>) => {
  const store = new Map<string, string>(Object.entries(disk).map(([p, c]) => [`None:${p}`, c]));
  const fs = {
    store,
    openFile: vi.fn(async (path: string, base: string) => {
      const content = store.get(`${base}:${path}`);
      if (content === undefined) throw new Error(`no ${path}`);
      return new File([content], path.split('/').pop()!, {
        type: path.endsWith('png') ? 'image/png' : '',
      });
    }),
    exists: vi.fn(async (path: string, base: string) => store.has(`${base}:${path}`)),
    createDir: vi.fn(async () => {}),
    copyFile: vi.fn(async (from: string, fb: string, to: string, tb: string) => {
      store.set(`${tb}:${to}`, store.get(`${fb}:${from}`)!);
    }),
    writeFile: vi.fn(async (path: string, base: string, content: ArrayBuffer | string) => {
      store.set(
        `${base}:${path}`,
        typeof content === 'string' ? content : `bytes:${content.byteLength}`,
      );
    }),
    readDir: vi.fn(async (dir: string) =>
      [...store.keys()]
        .filter((k) => k.startsWith(`None:${dir}/`))
        .map((k) => ({ path: k.slice(`None:${dir}/`.length), size: 1 })),
    ),
  };
  return fs;
};

const run = (fs: ReturnType<typeof makeFs>, paths: string[], books: Book[] = []) => {
  const saveBookConfig = vi.fn(async () => {});
  return importAudioFolder(
    fs as unknown as FileSystem,
    '/lib/The Return of the King',
    paths,
    books,
    {
      saveBookConfig,
      generateCoverImageUrl: async () => 'cover://x',
    },
  ).then((book) => ({ book, saveBookConfig, books }));
};

const dir = '/lib/The Return of the King';
const files = ['Book V - Chapter 02.mp3', 'Book V - Chapter 01.mp3', 'Prologue.mp3'];
const paths = files.map((f) => `${dir}/${f}`);

beforeEach(() => {
  tags.byName.clear();
  for (const [i, f] of files.entries()) {
    tags.byName.set(f, {
      album: 'The Return of the King',
      trackTitle: f.replace('.mp3', ''),
      author: 'J.R.R. Tolkien',
      duration: 100 + i,
      // Prologue is track 1, then chapters 1 and 2: names alone would put Prologue last.
      track: f === 'Prologue.mp3' ? 1 : f.endsWith('01.mp3') ? 2 : 3,
    });
  }
});

describe('importAudioFolder', () => {
  it('makes one book from the folder, in track order, with a chapter per file', async () => {
    const fs = makeFs(Object.fromEntries(paths.map((p) => [p, `audio:${p}`])));
    const { book, books, saveBookConfig } = await run(fs, paths);

    expect(book).not.toBeNull();
    expect(books).toHaveLength(1);
    expect(book!.title).toBe('The Return of the King');
    expect(book!.author).toBe('J.R.R. Tolkien');
    expect(book!.format).toBe('MP3');
    expect(book!.metadata!.audioParts!.map((p) => p.title)).toEqual([
      'Prologue',
      'Book V - Chapter 01',
      'Book V - Chapter 02',
    ]);
    expect(book!.metadata!.audioParts!.map((p) => p.duration)).toEqual([102, 101, 100]);
    expect(book!.altFilePaths).toEqual([
      `${dir}/Prologue.mp3`,
      `${dir}/Book V - Chapter 01.mp3`,
      `${dir}/Book V - Chapter 02.mp3`,
    ]);
    expect(book!.filePath).toBeUndefined();
    expect(saveBookConfig).toHaveBeenCalledTimes(1);
  });

  it('keeps the first part as the book file and the others beside it', async () => {
    const fs = makeFs(Object.fromEntries(paths.map((p) => [p, `audio:${p}`])));
    const { book } = await run(fs, paths);
    const h = book!.hash;
    expect(fs.store.get(`Books:${h}/The Return of the King.mp3`)).toBe(`audio:${dir}/Prologue.mp3`);
    expect(fs.store.get(`Books:${h}/part-0002.mp3`)).toBe(`audio:${dir}/Book V - Chapter 01.mp3`);
    expect(fs.store.get(`Books:${h}/part-0003.mp3`)).toBe(`audio:${dir}/Book V - Chapter 02.mp3`);
  });

  it('uses the picture beside the files as the cover', async () => {
    const fs = makeFs({
      ...Object.fromEntries(paths.map((p) => [p, `audio:${p}`])),
      [`${dir}/The Return of the King.png`]: 'PICTURE',
    });
    const { book } = await run(fs, paths);
    expect(fs.store.get(`Books:${book!.hash}/cover.png`)).toBe('bytes:7');
    expect(book!.coverImageUrl).toBe('cover://x');
  });

  it('falls back to the cover inside the first file that has one', async () => {
    tags.byName.get('Book V - Chapter 01.mp3')!['cover'] = new Blob(['EMBEDDED'], {
      type: 'image/jpeg',
    });
    const fs = makeFs(Object.fromEntries(paths.map((p) => [p, `audio:${p}`])));
    const { book } = await run(fs, paths);
    expect(fs.store.get(`Books:${book!.hash}/cover.png`)).toBe('bytes:8');
  });

  it('is named after the folder when the files disagree about the album, and ordered by name when tracks are missing', async () => {
    for (const t of tags.byName.values()) delete t['track'];
    tags.byName.get('Prologue.mp3')!['album'] = 'Something else';
    const fs = makeFs(Object.fromEntries(paths.map((p) => [p, `audio:${p}`])));
    const { book } = await run(fs, paths);
    expect(book!.title).toBe('The Return of the King');
    expect(book!.metadata!.audioParts!.map((p) => p.title)).toEqual([
      'Book V - Chapter 01',
      'Book V - Chapter 02',
      'Prologue',
    ]);
  });

  it('finds the same book when the folder is imported again, and brings it back if removed', async () => {
    const fs = makeFs(Object.fromEntries(paths.map((p) => [p, `audio:${p}`])));
    const first = await run(fs, paths);
    first.book!.deletedAt = 5;
    const again = await run(fs, [...paths].reverse(), first.books);
    expect(again.book).toBe(first.book);
    expect(first.books).toHaveLength(1);
    expect(again.book!.deletedAt).toBeNull();
    expect(again.saveBookConfig).not.toHaveBeenCalled();
  });

  it('is a different book when the files differ', async () => {
    const fs = makeFs(Object.fromEntries(paths.map((p) => [p, `audio:${p}`])));
    const first = await run(fs, paths);
    const second = await run(fs, paths.slice(0, 2), first.books);
    expect(second.book).not.toBe(first.book);
    expect(first.books).toHaveLength(2);
  });

  it('does nothing for fewer than two audio files, and says which file could not be read', async () => {
    const fs = makeFs({ [paths[0]!]: 'a' });
    expect((await run(fs, [paths[0]!])).book).toBeNull();
    const broken = makeFs({ [paths[0]!]: 'a', [`${dir}/Broken.mp3`]: 'b' });
    await expect(run(broken, [paths[0]!, `${dir}/Broken.mp3`])).rejects.toThrow(/Broken\.mp3/);
  });
});

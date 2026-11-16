import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteBook, downloadBook, uploadBook } from '@/services/cloudService';
import type { Book } from '@/types/book';
import type { AppService, FileSystem } from '@/types/system';

// An audiobook that is a folder of audio files: the first part is the book's ordinary file, the
// others sit beside it as part-0002.mp3 ... Every part must travel to and from the cloud.

vi.mock('@/utils/book', () => ({
  getDir: (book: Book) => book.hash,
  getLocalBookFilename: (book: Book) => `${book.hash}/${book.title}.mp3`,
  getRemoteBookFilename: (book: Book) => `${book.hash}/${book.hash}.mp3`,
  getCoverFilename: (book: Book) => `${book.hash}/cover.png`,
  getConfigFilename: (book: Book) => `${book.hash}/config.json`,
}));

// A test may hold downloads open to see which run together.
const downloadGate = vi.hoisted(() => ({
  wait: async (_o: {
    cfp: string;
    onProgress?: (p: { progress: number; total: number; transferSpeed: number }) => void;
  }) => {},
}));
const uploaded: string[] = [];
const downloaded: { cfp: string; dst: string }[] = [];
const deletedFromCloud: string[] = [];
vi.mock('@/libs/storage', () => ({
  downloadFile: vi.fn(
    async (o: {
      cfp: string;
      dst: string;
      onProgress?: (p: { progress: number; total: number; transferSpeed: number }) => void;
    }) => {
      downloaded.push({ cfp: o.cfp, dst: o.dst });
      await downloadGate.wait(o);
    },
  ),
  uploadFile: vi.fn(async (file: File) => {
    uploaded.push(file.name);
  }),
  deleteFile: vi.fn((cfp: string) => {
    deletedFromCloud.push(cfp);
  }),
  createProgressHandler: vi.fn().mockReturnValue(vi.fn()),
  batchGetDownloadUrls: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/utils/file', () => ({ ClosableFile: class {} }));
vi.mock('@/libs/profiles/sharedBooks', () => ({ isBookInOtherProfileLibrary: async () => false }));

const book = (over: Partial<Book> = {}): Book => ({
  hash: 'abc',
  format: 'MP3',
  title: 'Return',
  author: 'Tolkien',
  createdAt: 1,
  updatedAt: 1,
  uploadedAt: 5,
  downloadedAt: 1,
  metadata: {
    title: 'Return',
    author: 'Tolkien',
    language: 'en',
    audioParts: [
      { title: 'One', ext: 'mp3', size: 1, duration: 1 },
      { title: 'Two', ext: 'mp3', size: 1, duration: 1 },
      { title: 'Three', ext: 'm4a', size: 1, duration: 1 },
    ],
  },
  ...over,
});

const makeFs = (present: string[]) => {
  const files = new Set(present.map((p) => `Books:${p}`));
  const fs = {
    files,
    exists: vi.fn(async (p: string, base: string) => files.has(`${base}:${p}`)),
    openFile: vi.fn(
      async (lfp: string, _base: string, cfp?: string) => new File(['x'], cfp ?? lfp),
    ),
    readDir: vi.fn().mockResolvedValue([]),
    removeFile: vi.fn(async (p: string, base: string) => {
      files.delete(`${base}:${p}`);
    }),
    removeDir: vi.fn(),
    createDir: vi.fn(),
  };
  return fs;
};

const resolve = async (p: string) => `/data/Books/${p}`;

beforeEach(() => {
  uploaded.length = 0;
  downloaded.length = 0;
  deletedFromCloud.length = 0;
  vi.clearAllMocks();
});

describe('uploading a book made of several files', () => {
  test('sends the cover, the first part and every later part', async () => {
    const fs = makeFs([
      'abc/cover.png',
      'abc/Return.mp3',
      'abc/part-0002.mp3',
      'abc/part-0003.m4a',
    ]);
    await uploadBook(fs as unknown as FileSystem, resolve, book({ uploadedAt: null }));
    expect(uploaded).toEqual([
      'Readest/Books/abc/cover.png',
      'Readest/Books/abc/abc.mp3',
      'Readest/Books/abc/part-0002.mp3',
      'Readest/Books/abc/part-0003.m4a',
    ]);
  });

  test('fails, instead of marking the book uploaded, when a later part is missing', async () => {
    const fs = makeFs(['abc/cover.png', 'abc/Return.mp3', 'abc/part-0002.mp3']);
    await expect(
      uploadBook(fs as unknown as FileSystem, resolve, book({ uploadedAt: null })),
    ).rejects.toThrow(/not uploaded/);
  });

  test('a single-file book uploads exactly as before', async () => {
    const fs = makeFs(['abc/cover.png', 'abc/Return.mp3']);
    await uploadBook(
      fs as unknown as FileSystem,
      resolve,
      book({ uploadedAt: null, metadata: undefined }),
    );
    expect(uploaded).toEqual(['Readest/Books/abc/cover.png', 'Readest/Books/abc/abc.mp3']);
  });
});

describe('downloading a book made of several files', () => {
  const app = {} as AppService;

  test('fetches the parts that are not on the device, and no others', async () => {
    const fs = makeFs(['abc/cover.png', 'abc/Return.mp3', 'abc/part-0002.mp3']);
    const b = book({ downloadedAt: null });
    await downloadBook(app, fs as unknown as FileSystem, '/data/Books', b);
    expect(downloaded).toEqual([
      { cfp: 'Readest/Books/abc/part-0003.m4a', dst: '/data/Books/abc/part-0003.m4a' },
    ]);
    expect(b.downloadedAt).toBeGreaterThan(1);
  });

  test('a redownload fetches every part again', async () => {
    const fs = makeFs([
      'abc/cover.png',
      'abc/Return.mp3',
      'abc/part-0002.mp3',
      'abc/part-0003.m4a',
    ]);
    await downloadBook(app, fs as unknown as FileSystem, '/data/Books', book(), false, true);
    expect(downloaded.map((d) => d.cfp)).toEqual([
      'Readest/Books/abc/cover.png',
      'Readest/Books/abc/abc.mp3',
      'Readest/Books/abc/part-0002.mp3',
      'Readest/Books/abc/part-0003.m4a',
    ]);
  });

  test('fetching only the cover leaves the parts alone', async () => {
    const fs = makeFs(['abc/Return.mp3']);
    await downloadBook(app, fs as unknown as FileSystem, '/data/Books', book(), true);
    expect(downloaded.map((d) => d.cfp)).toEqual(['Readest/Books/abc/cover.png']);
  });
});

describe('deleting a book made of several files', () => {
  test('removing the local copy removes every part', async () => {
    const fs = makeFs([
      'abc/Return.mp3',
      'abc/part-0002.mp3',
      'abc/part-0003.m4a',
      'abc/cover.png',
    ]);
    await deleteBook(fs as unknown as FileSystem, book(), 'local');
    expect(fs.files.has('Books:abc/Return.mp3')).toBe(false);
    expect(fs.files.has('Books:abc/part-0002.mp3')).toBe(false);
    expect(fs.files.has('Books:abc/part-0003.m4a')).toBe(false);
    expect(fs.files.has('Books:abc/cover.png')).toBe(true);
  });

  test('removing the cloud copy removes every part there', async () => {
    const fs = makeFs([]);
    await deleteBook(fs as unknown as FileSystem, book(), 'cloud');
    expect(deletedFromCloud).toEqual([
      'Readest/Books/abc/abc.mp3',
      'Readest/Books/abc/cover.png',
      'Readest/Books/abc/part-0002.mp3',
      'Readest/Books/abc/part-0003.m4a',
    ]);
  });
});

describe('the files of a book download together', () => {
  const app = {} as AppService;
  const releases: Record<string, () => void> = {};
  const reports: Record<string, (done: number, total: number) => void> = {};
  beforeEach(() => {
    for (const key of Object.keys(releases)) delete releases[key];
    downloadGate.wait = (o) =>
      new Promise<void>((resolve) => {
        releases[o.cfp] = resolve;
        reports[o.cfp] = (done, total) =>
          o.onProgress?.({ progress: done, total, transferSpeed: 0 });
      });
  });
  afterEach(() => {
    downloadGate.wait = async () => {};
  });

  test('starts the cover and the first file together, the other parts as these end', async () => {
    const fs = makeFs([]);
    const done = downloadBook(
      app,
      fs as unknown as FileSystem,
      '/data/Books',
      book({ downloadedAt: null }),
    );
    await vi.waitFor(() => expect(downloaded).toHaveLength(2));
    expect(downloaded.map((d) => d.cfp)).toEqual([
      'Readest/Books/abc/cover.png',
      'Readest/Books/abc/abc.mp3',
    ]);
    releases['Readest/Books/abc/cover.png']!();
    await vi.waitFor(() => expect(downloaded).toHaveLength(3));
    releases['Readest/Books/abc/abc.mp3']!();
    await vi.waitFor(() => expect(downloaded).toHaveLength(4));
    releases['Readest/Books/abc/part-0002.mp3']!();
    releases['Readest/Books/abc/part-0003.m4a']!();
    await done;
  });

  test('reports one progress for all of them, by their sizes', async () => {
    const fs = makeFs(['abc/cover.png']);
    const seen: number[] = [];
    const b = book({
      downloadedAt: null,
      metadata: {
        title: 'Return',
        author: 'Tolkien',
        language: 'en',
        audioParts: [
          { title: 'One', ext: 'mp3', size: 100, duration: 1 },
          { title: 'Two', ext: 'mp3', size: 300, duration: 1 },
        ],
      },
    });
    const done = downloadBook(
      app,
      fs as unknown as FileSystem,
      '/data/Books',
      b,
      false,
      false,
      (p) => seen.push(p.progress),
    );
    await vi.waitFor(() => expect(downloaded).toHaveLength(2));
    reports['Readest/Books/abc/abc.mp3']!(50, 100);
    reports['Readest/Books/abc/part-0002.mp3']!(150, 300);
    // 200 of the 400 bytes: half, whichever file reported last.
    expect(seen.at(-1)).toBeCloseTo(50, 5);
    releases['Readest/Books/abc/abc.mp3']!();
    releases['Readest/Books/abc/part-0002.mp3']!();
    await done;
    expect(seen.at(-1)).toBeCloseTo(100, 5);
  });

  test('a part that fails fails the download, and the cover failing does not', async () => {
    const fs = makeFs(['abc/Return.mp3']);
    downloadGate.wait = async (o) => {
      if (o.cfp.endsWith('part-0002.mp3')) throw new Error('refused');
      if (o.cfp.endsWith('cover.png')) throw new Error('no cover');
    };
    await expect(
      downloadBook(app, fs as unknown as FileSystem, '/data/Books', book({ downloadedAt: null })),
    ).rejects.toThrow('refused');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { setActiveProfileId } from '@/libs/profiles/active';
import { restoreFromBackupZip, type ProgressConflict } from '@/services/backupService';
import type { AppService } from '@/types/system';
import type { Book } from '@/types/book';

// Restoring a backup next to a library that already has the books: nothing is duplicated, and a
// book the reader has already started keeps its place unless the reader says the backup's wins.

const KID = '22222222-2222-2222-2222-222222222222';
const HASH = 'a'.repeat(32);
const book = (over: Partial<Book> = {}): Book =>
  ({
    hash: HASH,
    metaHash: 'm1',
    format: 'EPUB',
    title: 'Dune',
    author: 'Herbert',
    createdAt: 1,
    updatedAt: 1,
    progress: [10, 100],
    ...over,
  }) as Book;

/** An app service whose files and library live in memory. */
const fakeApp = (library: Book[], files: Record<string, string> = {}) => {
  const state = { library, files: { ...files } as Record<string, string | ArrayBuffer> };
  const service = {
    loadLibraryBooks: async () => state.library,
    saveLibraryBooks: async (books: Book[]) => {
      state.library = books;
    },
    exists: async (path: string) => path in state.files,
    createDir: async () => {},
    readFile: async (path: string) => {
      if (!(path in state.files)) throw new Error('missing');
      return state.files[path];
    },
    writeFile: async (path: string, _base: string, content: string | ArrayBuffer) => {
      state.files[path] = content;
    },
    loadSettings: async () => ({}),
    saveSettings: async () => {},
    resolveFilePath: async (p: string) => p,
    importBook: async () => null,
  };
  return { service: service as unknown as AppService, state };
};

const zipOf = async (entries: Record<string, string>) => {
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  for (const [name, text] of Object.entries(entries)) await writer.add(name, new TextReader(text));
  return writer.close();
};

const config = (page: number, location: string, extra: object = {}) =>
  JSON.stringify({ progress: [page, 100], location, updatedAt: 1, ...extra });

afterEach(() => setActiveProfileId(null));

describe('restoring a backup of books that are already in the library', () => {
  it('does not add a second copy of a book it already has, by hash or by title and author', async () => {
    const { service, state } = fakeApp([book()]);
    const sameBookOtherHash = book({ hash: 'b'.repeat(32) });
    const zip = await zipOf({
      'library.json': JSON.stringify([book(), sameBookOtherHash]),
      [`${HASH}/Dune.epub`]: 'epub',
      [`${'b'.repeat(32)}/Dune.epub`]: 'epub2',
    });
    const result = await restoreFromBackupZip(service, zip);
    expect(state.library).toHaveLength(1);
    expect(result.booksAdded).toBe(0);
  });

  it('adds a book it does not have', async () => {
    const { service, state } = fakeApp([]);
    const zip = await zipOf({
      'library.json': JSON.stringify([book()]),
      [`${HASH}/Dune.epub`]: 'epub',
    });
    const result = await restoreFromBackupZip(service, zip);
    expect(state.library).toHaveLength(1);
    expect(result.booksAdded).toBe(1);
  });

  const setup = async (backupPage: number, currentPage: number) => {
    const { service, state } = fakeApp([book({ progress: [currentPage, 100] })], {
      [`${HASH}/config.json`]: config(currentPage, `cfi-${currentPage}`),
    });
    const zip = await zipOf({
      'library.json': JSON.stringify([book({ progress: [backupPage, 100] })]),
      [`${HASH}/config.json`]: config(backupPage, `cfi-${backupPage}`),
    });
    return { service, state, zip };
  };
  const saved = (state: { files: Record<string, string | ArrayBuffer> }) =>
    JSON.parse(state.files[`${HASH}/config.json`] as string);

  it('asks once, naming the books already started whose place differs', async () => {
    const { service, zip } = await setup(5, 50);
    let asked: ProgressConflict[] = [];
    await restoreFromBackupZip(service, zip, undefined, {
      chooseProgress: async (conflicts) => {
        asked = conflicts;
        return 'current';
      },
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ hash: HASH, title: 'Dune' });
  });

  it("keeps the reader's own place when they say so, even if the backup is further on", async () => {
    const { service, state, zip } = await setup(90, 50);
    await restoreFromBackupZip(service, zip, undefined, { chooseProgress: async () => 'current' });
    expect(saved(state)).toMatchObject({ progress: [50, 100], location: 'cfi-50' });
    expect(state.library[0]!.progress).toEqual([50, 100]);
  });

  it("puts the backup's place in when the reader says so, even if it is further back", async () => {
    const { service, state, zip } = await setup(5, 50);
    await restoreFromBackupZip(service, zip, undefined, { chooseProgress: async () => 'backup' });
    expect(saved(state)).toMatchObject({ progress: [5, 100], location: 'cfi-5' });
    expect(state.library[0]!.progress).toEqual([5, 100]);
    expect(state.library[0]!.updatedAt).toBeGreaterThan(1);
  });

  it('does not ask when the places are the same, or when only one side has started', async () => {
    let asks = 0;
    const choose = async () => {
      asks++;
      return 'current' as const;
    };
    const same = await setup(50, 50);
    await restoreFromBackupZip(same.service, same.zip, undefined, { chooseProgress: choose });
    const fresh = fakeApp([book({ progress: undefined })], {
      [`${HASH}/config.json`]: JSON.stringify({ updatedAt: 1 }),
    });
    const zip = await zipOf({
      'library.json': JSON.stringify([book({ progress: [30, 100] })]),
      [`${HASH}/config.json`]: config(30, 'cfi-30'),
    });
    await restoreFromBackupZip(fresh.service, zip, undefined, { chooseProgress: choose });
    expect(asks).toBe(0);
    // A book not started yet takes the backup's place without asking.
    expect(saved(fresh.state)).toMatchObject({ progress: [30, 100] });
  });

  it('merges the notes of both sides either way', async () => {
    const note = (id: string) => ({
      id,
      type: 'annotation',
      cfi: id,
      note: id,
      createdAt: 1,
      updatedAt: 1,
    });
    const { service, state } = fakeApp([book()], {
      [`${HASH}/config.json`]: config(50, 'cfi-50', { booknotes: [note('mine')] }),
    });
    const zip = await zipOf({
      'library.json': JSON.stringify([book()]),
      [`${HASH}/config.json`]: config(5, 'cfi-5', { booknotes: [note('theirs')] }),
    });
    await restoreFromBackupZip(service, zip, undefined, { chooseProgress: async () => 'backup' });
    expect(
      saved(state)
        .booknotes.map((n: { id: string }) => n.id)
        .sort(),
    ).toEqual(['mine', 'theirs']);
  });

  it("works on a profile's own progress file", async () => {
    setActiveProfileId(KID);
    const own = `${HASH}/config.${KID}.json`;
    const { service, state } = fakeApp([book({ progress: [50, 100] })], {
      [own]: config(50, 'cfi-50'),
      [`${HASH}/config.json`]: config(99, 'admin-99'),
    });
    const zip = await zipOf({
      [`library.${KID}.json`]: JSON.stringify([book({ progress: [5, 100] })]),
      [own]: config(5, 'cfi-5'),
      [`${HASH}/config.json`]: config(1, 'admin-1'),
    });
    await restoreFromBackupZip(service, zip, undefined, { chooseProgress: async () => 'backup' });
    expect(JSON.parse(state.files[own] as string)).toMatchObject({ location: 'cfi-5' });
    // The admin's progress file is never touched by a profile.
    expect(JSON.parse(state.files[`${HASH}/config.json`] as string)).toMatchObject({
      location: 'admin-99',
    });
  });
});

describe('fonts in a backup', () => {
  const font = {
    id: 'f1',
    name: 'Lora',
    path: 'bundle1/Lora.ttf',
    bundleDir: 'bundle1',
    family: 'Lora',
    contentId: 'cid1',
  };
  /** A device with one installed font, whose files and library are in memory. */
  const deviceWithFont = () => {
    const files: Record<string, ArrayBuffer | string> = {
      'bundle1/Lora.ttf': new TextEncoder().encode('FONTDATA').buffer as ArrayBuffer,
    };
    const created: string[] = [];
    const service = {
      loadLibraryBooks: async () => [],
      loadSettings: async () => ({
        customFonts: [font, { ...font, id: 'gone', path: 'x/y.ttf', deletedAt: 1 }],
      }),
      saveSettings: async () => {},
      resolveFilePath: async () => 'Books',
      readDirectory: async () => [],
      readFile: async (path: string) => {
        if (!(path in files)) throw new Error('missing');
        return files[path];
      },
      exists: async (path: string) => path in files,
      createDir: async (dir: string) => {
        created.push(dir);
      },
      writeFile: async (path: string, _base: string, content: ArrayBuffer) => {
        files[path] = content;
      },
      saveLibraryBooks: async () => {},
    };
    return { service: service as unknown as AppService, files, created };
  };

  it('carries the installed fonts, files and list, in the backup of any profile', async () => {
    for (const profile of [null, KID]) {
      setActiveProfileId(profile);
      const { service } = deviceWithFont();
      const { createBackupZip } = await import('@/services/backupService');
      const zip = new Blob([await createBackupZip(service)]);
      const { BlobReader, ZipReader } = await import('@zip.js/zip.js');
      const names = (await new ZipReader(new BlobReader(zip)).getEntries()).map((e) => e.filename);
      expect(names).toContain('Fonts/bundle1/Lora.ttf');
      expect(names).toContain('fonts.json');
      // A font that was deleted is not carried.
      expect(names).not.toContain('Fonts/x/y.ttf');
    }
  });

  it('puts the font files back and returns the fonts to register, keeping a file already there', async () => {
    const empty = fakeApp([]);
    const fresh = empty.service as unknown as Record<string, unknown>;
    const zip = await zipOf({
      'library.json': '[]',
      'fonts.json': JSON.stringify([{ ...font }, { ...font, path: '../evil.ttf', name: 'Evil' }]),
      'Fonts/bundle1/Lora.ttf': 'FONTDATA',
      'Fonts/../evil.ttf': 'bad',
    });
    void fresh;
    const result = await restoreFromBackupZip(empty.service, zip);
    expect(result.fonts.map((f) => f.name)).toEqual(['Lora']);
    expect(empty.state.files['bundle1/Lora.ttf']).toBeDefined();
    expect(empty.state.files['../evil.ttf']).toBeUndefined();
  });
});

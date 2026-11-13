import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { FileSystem } from '@/types/system';
import { setActiveProfileId } from '@/libs/profiles/active';
import { isBookInOtherProfileLibrary } from '@/libs/profiles/sharedBooks';

const KID = '22222222-2222-2222-2222-222222222222';
const book = { hash: 'abc' } as Book;

// A device whose library index files are the given name -> books.
const fsWith = (files: Record<string, Partial<Book>[]>) =>
  ({
    readFile: vi.fn(async (path: string) => {
      if (!(path in files)) throw new Error('missing');
      return JSON.stringify(files[path]);
    }),
    writeFile: vi.fn(),
  }) as unknown as FileSystem;

const remember = (ids: string[]) =>
  localStorage.setItem(
    'readest-profiles-cache',
    JSON.stringify({ hasPin: false, profiles: ids.map((id) => ({ id, name: id })) }),
  );

afterEach(() => {
  setActiveProfileId(null);
  localStorage.clear();
});

describe('isBookInOtherProfileLibrary', () => {
  it('is false when no other profile has the book', async () => {
    remember([KID]);
    const fs = fsWith({
      'library.json': [{ hash: 'abc' }],
      [`library.${KID}.json`]: [{ hash: 'zzz' }],
    });
    expect(await isBookInOtherProfileLibrary(fs, book)).toBe(false);
  });

  it("sees a profile's copy from the main profile", async () => {
    remember([KID]);
    const fs = fsWith({
      'library.json': [{ hash: 'abc' }],
      [`library.${KID}.json`]: [{ hash: 'abc' }],
    });
    expect(await isBookInOtherProfileLibrary(fs, book)).toBe(true);
  });

  it("sees the main profile's copy from inside a profile, and ignores its own", async () => {
    setActiveProfileId(KID);
    remember([KID]);
    const own = fsWith({ [`library.${KID}.json`]: [{ hash: 'abc' }], 'library.json': [] });
    expect(await isBookInOtherProfileLibrary(own, book)).toBe(false);
    const shared = fsWith({
      [`library.${KID}.json`]: [{ hash: 'abc' }],
      'library.json': [{ hash: 'abc' }],
    });
    expect(await isBookInOtherProfileLibrary(shared, book)).toBe(true);
  });

  it('does not count a book another profile already deleted', async () => {
    remember([KID]);
    const fs = fsWith({ [`library.${KID}.json`]: [{ hash: 'abc', deletedAt: 123 }] });
    expect(await isBookInOtherProfileLibrary(fs, book)).toBe(false);
  });
});

describe('deleting a book other profiles share', () => {
  const makeFs = (libraries: Record<string, Partial<Book>[]>) => {
    const fs = {
      readFile: vi.fn(async (path: string) => {
        if (!(path in libraries)) throw new Error('missing');
        return JSON.stringify(libraries[path]);
      }),
      writeFile: vi.fn(),
      exists: vi.fn(async () => true),
      removeFile: vi.fn(async () => {}),
      removeDir: vi.fn(async () => {}),
    };
    return fs as unknown as FileSystem & typeof fs;
  };

  it("keeps the shared files and removes only this profile's own progress on a purge", async () => {
    const { deleteBook } = await import('@/services/cloudService');
    remember([KID]);
    setActiveProfileId(KID);
    const fs = makeFs({ 'library.json': [{ hash: 'abc' }] });
    const b = { hash: 'abc', title: 'T', format: 'EPUB', uploadedAt: 5 } as Book;
    await deleteBook(fs, b, 'purge');
    expect(fs.removeDir).not.toHaveBeenCalled();
    expect(fs.removeFile).toHaveBeenCalledTimes(1);
    expect(fs.removeFile).toHaveBeenCalledWith(`abc/config.${KID}.json`, 'Books');
    expect(b.uploadedAt).toBe(5);
  });

  it('removes everything when no other profile has the book', async () => {
    const { deleteBook } = await import('@/services/cloudService');
    remember([KID]);
    const fs = makeFs({});
    const b = { hash: 'abc', title: 'T', format: 'EPUB' } as Book;
    await deleteBook(fs, b, 'purge');
    expect(fs.removeDir).toHaveBeenCalled();
  });
});

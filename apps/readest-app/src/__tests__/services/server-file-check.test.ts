import { describe, expect, it } from 'vitest';
import { booksToVerify, inBatches, findBooksMissingFromServer } from '@/services/serverFileCheck';
import type { Book } from '@/types/book';

const book = (hash: string, over: Partial<Book> = {}): Book => ({
  hash,
  format: 'EPUB',
  title: hash,
  author: 'A',
  createdAt: 1,
  updatedAt: 1,
  downloadedAt: 5,
  uploadedAt: 9,
  ...over,
});

describe('booksToVerify', () => {
  it('is the books marked uploaded that this device could upload again (it has the file)', () => {
    const list = [
      book('a'),
      book('cloud-only', { downloadedAt: null }),
      book('not-uploaded', { uploadedAt: null }),
      book('gone', { deletedAt: 3 }),
      book('feed', { url: 'feed://x/y' }),
    ];
    expect(booksToVerify(list).map((b) => b.hash)).toEqual(['a']);
  });
});

describe('inBatches', () => {
  it('splits a list into parts of at most n', () => {
    expect(inBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(inBatches([], 3)).toEqual([]);
  });
});

describe('findBooksMissingFromServer', () => {
  it('asks in batches and returns the books the server does not have', async () => {
    const list = Array.from({ length: 250 }, (_, i) => book(`h${i}`));
    const asked: string[][] = [];
    const missing = await findBooksMissingFromServer(list, async (hashes) => {
      asked.push(hashes);
      return hashes.filter((h) => h === 'h3' || h === 'h205');
    });
    expect(asked.map((a) => a.length)).toEqual([100, 100, 50]);
    expect(missing.map((b) => b.hash)).toEqual(['h3', 'h205']);
  });

  it('gives up quietly when the server cannot be asked, so nothing is marked wrongly', async () => {
    const missing = await findBooksMissingFromServer([book('a')], async () => {
      throw new Error('offline');
    });
    expect(missing).toEqual([]);
  });
});

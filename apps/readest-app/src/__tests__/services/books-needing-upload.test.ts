import { describe, expect, it } from 'vitest';
import { booksNeedingUpload } from '@/services/booksNeedingUpload';
import type { Book } from '@/types/book';

const book = (over: Partial<Book>): Book => ({
  hash: 'h',
  format: 'EPUB',
  title: 'T',
  author: 'A',
  createdAt: 1,
  updatedAt: 1,
  downloadedAt: 5,
  uploadedAt: null,
  ...over,
});

describe('booksNeedingUpload', () => {
  it('picks books and audiobooks that are on the device but not on the server', () => {
    const list = [
      book({ hash: 'a' }),
      book({ hash: 'b', format: 'M4B' }),
      book({ hash: 'c', format: 'MP3' }),
    ];
    expect(booksNeedingUpload(list).map((b) => b.hash)).toEqual(['a', 'b', 'c']);
  });

  it('skips what is already uploaded, removed, not on the device, or only a feed entry', () => {
    const list = [
      book({ hash: 'done', uploadedAt: 9 }),
      book({ hash: 'gone', deletedAt: 9 }),
      book({ hash: 'cloud-only', downloadedAt: null }),
      book({ hash: 'feed', url: 'feed://x/y' }),
      book({ hash: 'keep' }),
    ];
    expect(booksNeedingUpload(list).map((b) => b.hash)).toEqual(['keep']);
  });
});

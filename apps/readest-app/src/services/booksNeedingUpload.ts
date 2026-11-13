import type { Book } from '@/types/book';
import { isFeedBook } from '@/services/rss/feedBookUrl';

/**
 * Books and audiobooks that are on this device but not yet on the server: added while offline,
 * before uploads were automatic, or after an upload failed for good. Feed entries have no file.
 */
export const booksNeedingUpload = (library: Book[]): Book[] =>
  library.filter(
    (book) => !book.deletedAt && book.downloadedAt && !book.uploadedAt && !isFeedBook(book),
  );

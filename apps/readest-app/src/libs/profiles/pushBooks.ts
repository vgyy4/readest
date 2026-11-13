import { SyncClient } from '@/libs/sync';
import { useLibraryStore } from '@/store/libraryStore';

/**
 * Make sure the server has the library entries of `hashes` before they are shared. Giving a
 * book to a profile copies the admin's entry on the server, so a book that has not synced yet
 * (a new import, a failed earlier sync) used to be refused with "Book not found". Sends the
 * entries now and throws if they cannot be sent.
 */
export const ensureBooksOnServer = async (hashes: string[]) => {
  const wanted = new Set(hashes);
  const books = useLibraryStore
    .getState()
    .library.filter((book) => wanted.has(book.hash) && !book.deletedAt);
  if (books.length === 0) return;
  await new SyncClient().pushChanges({ books });
};

import type { Book } from '@/types/book';
import type { FileSystem } from '@/types/system';
import { safeLoadJSON } from '@/services/persistence';
import { getActiveProfileId } from './active';
import { getCachedProfiles } from './client';
import { libraryFilenameFor } from './files';

/**
 * Whether another profile on this device still has `book` in its library.
 * Profiles share one copy of a book's files (the book, its cover) by hash, so
 * removing the book from one profile must not delete files another still reads.
 */
export const isBookInOtherProfileLibrary = async (
  fs: FileSystem,
  book: Pick<Book, 'hash'>,
): Promise<boolean> => {
  const active = getActiveProfileId();
  const profileIds: (string | null)[] = [
    null,
    ...(getCachedProfiles()?.profiles ?? []).map((p) => p.id),
  ];
  for (const id of profileIds) {
    if (id === active) continue;
    const books = await safeLoadJSON<Pick<Book, 'hash' | 'deletedAt'>[]>(
      fs,
      libraryFilenameFor(id),
      'Books',
      [],
    );
    if (books.some((b) => b.hash === book.hash && !b.deletedAt)) return true;
  }
  return false;
};

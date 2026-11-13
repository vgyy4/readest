import type { Book } from '@/types/book';
import { getAPIBaseUrl } from '@/services/environment';
import { fetchWithAuth } from '@/utils/fetch';
import { isFeedBook } from '@/services/rss/feedBookUrl';

const BATCH = 100;

/**
 * Books this device holds the file of that are marked as uploaded: the ones it could upload
 * again if the server turns out not to have them.
 */
export const booksToVerify = (library: Book[]): Book[] =>
  library.filter(
    (book) => !book.deletedAt && book.downloadedAt && book.uploadedAt && !isFeedBook(book),
  );

export const inBatches = <T>(list: T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size));
  return batches;
};

/** Ask the server which of these book hashes it has no file for. */
export const askServerWhichAreMissing = async (hashes: string[]): Promise<string[]> => {
  const response = await fetchWithAuth(`${getAPIBaseUrl()}/storage/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookHashes: hashes }),
  });
  return ((await response.json()) as { missing: string[] }).missing;
};

/**
 * The books of `library` that the server has no file for. If the server cannot be asked
 * (offline, an older server without this check) nothing is reported, so nothing is changed.
 */
export const findBooksMissingFromServer = async (
  library: Book[],
  ask: (hashes: string[]) => Promise<string[]> = askServerWhichAreMissing,
): Promise<Book[]> => {
  const candidates = booksToVerify(library);
  const missing = new Set<string>();
  try {
    for (const batch of inBatches(candidates, BATCH)) {
      for (const hash of await ask(batch.map((b) => b.hash))) missing.add(hash);
    }
  } catch {
    return [];
  }
  return candidates.filter((book) => missing.has(book.hash));
};

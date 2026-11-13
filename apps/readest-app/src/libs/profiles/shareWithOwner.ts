import type { createSupabaseAdminClient } from '@/utils/supabase';
import { buildGrantRows } from './shared';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * A book a profile adds must also show up for the account's admin (the main profile sees every
 * book), and stay available to the profile that added it. The profile's own row already exists
 * (it was just synced), so what is missing is the owner's: copy it, without the profile's
 * reading state. The owner's library pulls by `updated_at`, so the copy is stamped now.
 *
 * Only books the owner has never had are copied. If the admin removed a book, a profile that
 * merely keeps syncing its progress must not bring it back. Books the owner already has are only
 * told when the profile's upload of the file has finished.
 */
export const shareNewBooksWithOwner = async (
  admin: Admin,
  ownerId: string,
  profileUserId: string,
  bookHashes: string[],
): Promise<number> => {
  const hashes = [...new Set(bookHashes)];
  if (hashes.length === 0) return 0;

  const { data: mine, error: mineError } = await admin
    .from('books')
    .select('*')
    .eq('user_id', profileUserId)
    .in('book_hash', hashes)
    .is('deleted_at', null);
  if (mineError) throw mineError;
  if (!mine?.length) return 0;

  const { data: theirs, error: theirsError } = await admin
    .from('books')
    .select('book_hash, uploaded_at, deleted_at')
    .eq('user_id', ownerId)
    .in(
      'book_hash',
      mine.map((b) => b.book_hash as string),
    );
  if (theirsError) throw theirsError;

  const ownerRows = new Map((theirs ?? []).map((b) => [b.book_hash as string, b]));
  const now = new Date().toISOString();

  // The file usually finishes uploading after the book was first synced, and the profile marks
  // only its own row. Pass the mark on, or the admin's copy would never offer a download.
  for (const book of mine) {
    const copy = ownerRows.get(book.book_hash as string);
    if (!copy || copy.deleted_at || copy.uploaded_at || !book.uploaded_at) continue;
    const { error } = await admin
      .from('books')
      .update({ uploaded_at: book.uploaded_at, updated_at: now })
      .eq('user_id', ownerId)
      .eq('book_hash', book.book_hash as string);
    if (error) throw error;
  }

  const fresh = mine.filter((b) => !ownerRows.has(b.book_hash as string));
  if (fresh.length === 0) return 0;

  const rows = buildGrantRows(fresh, ownerId).map((row) => ({ ...row, updated_at: now }));
  const { error } = await admin
    .from('books')
    .upsert(rows, { onConflict: 'user_id,book_hash', ignoreDuplicates: true });
  if (error) throw error;
  return fresh.length;
};

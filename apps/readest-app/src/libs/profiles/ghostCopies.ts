import type { createSupabaseAdminClient } from '@/utils/supabase';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const BATCH = 500;
const MIN_GAP_MS = 5 * 60 * 1000;

/**
 * Each profile has its own copy of a book (see shareWithOwner), so the admin removing a book has
 * never removed the profiles' copies. That is right while the server holds the file, which the
 * profiles may still read. But when the server has no file for the book (it was never uploaded,
 * or the storage was emptied) a profile's copy has nothing behind it: it could never be
 * downloaded. This takes those copies away too, so the book disappears everywhere the admin
 * removed it.
 *
 * A copy that has been read (it has progress) is left alone: the reading belongs to the profile,
 * and the file may be on that profile's device.
 *
 * Returns how many books lost their profile copies.
 */
export const removeGhostProfileCopies = async (
  admin: Admin,
  ownerId: string,
  exists: (fileKey: string) => Promise<boolean>,
): Promise<number> => {
  const { data: profiles } = await admin
    .from('profiles')
    .select('profile_user_id')
    .eq('owner_id', ownerId);
  const profileIds = (profiles ?? []).map((p) => p.profile_user_id as string);
  if (profileIds.length === 0) return 0;

  const { data: removed } = await admin
    .from('books')
    .select('book_hash')
    .eq('user_id', ownerId)
    .not('deleted_at', 'is', null)
    .limit(BATCH);
  const hashes = (removed ?? []).map((b) => b.book_hash as string);
  if (hashes.length === 0) return 0;

  const { data: copies } = await admin
    .from('books')
    .select('book_hash')
    .in('user_id', profileIds)
    .in('book_hash', hashes)
    .is('deleted_at', null)
    .is('progress', null);
  const candidates = [...new Set((copies ?? []).map((c) => c.book_hash as string))];
  if (candidates.length === 0) return 0;

  const { data: files } = await admin
    .from('files')
    .select('book_hash, file_key')
    .eq('user_id', ownerId)
    .in('book_hash', candidates)
    .is('deleted_at', null);
  const held = new Set<string>();
  await Promise.all(
    (files ?? [])
      .filter((f) => !String(f.file_key).endsWith('/cover.png'))
      .map(async (f) => {
        if (await exists(f.file_key as string)) held.add(f.book_hash as string);
      }),
  );
  const ghosts = candidates.filter((hash) => !held.has(hash));
  if (ghosts.length === 0) return 0;

  const now = new Date().toISOString();
  const { error } = await admin
    .from('books')
    .update({ deleted_at: now, updated_at: now })
    .in('user_id', profileIds)
    .in('book_hash', ghosts)
    .is('deleted_at', null)
    .is('progress', null);
  if (error) throw error;
  return ghosts.length;
};

const lastLook = new Map<string, number>();

/**
 * The cleanup, run along with syncing: at most once every few minutes per account, and never
 * failing the sync it rides on.
 */
export const maybeRemoveGhostProfileCopies = async (
  admin: Admin,
  ownerId: string,
  exists: (fileKey: string) => Promise<boolean>,
  now: () => number = Date.now,
): Promise<number> => {
  const at = now();
  if (at - (lastLook.get(ownerId) ?? 0) < MIN_GAP_MS) return 0;
  lastLook.set(ownerId, at);
  try {
    return await removeGhostProfileCopies(admin, ownerId, exists);
  } catch (error) {
    console.warn('Could not remove profile copies of books the server has no file for:', error);
    return 0;
  }
};

import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { PROFILE_HEADER } from '@/libs/profiles/shared';
import { validateUserAndToken } from '@/utils/access';
import { objectExists } from '@/utils/object';

const MAX_HASHES = 200;
const HASH = /^[0-9a-f]{32}$/i;

/**
 * Which of these books does the server really have a file for? A library can say a book is
 * uploaded while the storage holds nothing (the mark came from somewhere else, an upload that
 * never finished, a storage that was emptied), and then every other device's download fails.
 * Devices that still have the file ask here and upload it again.
 *
 * `{ bookHashes }` -> `{ present, missing }`. A profile asks about the account's storage, where
 * its books live. Needs no more than a signed-in session: it only says whether files exist.
 *
 * With `repair: true` the server also takes back the false claim: the "uploaded" mark of the
 * missing books is cleared for the account and every one of its profiles, so no device goes on
 * offering a download that cannot work, and a device that still has the file uploads it again. A
 * device without the file (which cannot repair anything itself) sets this off by trying to
 * download and being told the server has nothing.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, token, ownerId, isProfile } = await validateUserAndToken(
      req.headers['authorization'],
      req.headers[PROFILE_HEADER],
    );
    if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

    const hashes = req.body?.bookHashes;
    if (
      !Array.isArray(hashes) ||
      hashes.length > MAX_HASHES ||
      !hashes.every((h) => typeof h === 'string' && HASH.test(h))
    ) {
      return res.status(400).json({ error: 'bookHashes must be up to 200 book hashes' });
    }
    if (hashes.length === 0) return res.status(200).json({ present: [], missing: [] });

    const { data, error } = await createSupabaseAdminClient()
      .from('files')
      .select('book_hash, file_key')
      .eq('user_id', isProfile && ownerId ? ownerId : user.id)
      .in('book_hash', hashes)
      .is('deleted_at', null);
    if (error) throw error;

    // The book itself, not its cover: a book with only a cover on the server cannot be opened.
    const candidates = (data ?? []).filter((row) => !row.file_key.endsWith('/cover.png'));
    const checks = await Promise.all(
      candidates.map(async (row) => ({
        hash: row.book_hash as string,
        exists: await objectExists(row.file_key),
      })),
    );
    const present = new Set(checks.filter((c) => c.exists).map((c) => c.hash.toLowerCase()));
    const missing = hashes.filter((h) => !present.has(h.toLowerCase()));
    if (req.body?.repair === true && missing.length > 0) {
      const accountId = isProfile && ownerId ? ownerId : user.id;
      const admin = createSupabaseAdminClient();
      const { data: profiles } = await admin
        .from('profiles')
        .select('profile_user_id')
        .eq('owner_id', accountId);
      const userIds = [accountId, ...(profiles ?? []).map((p) => p.profile_user_id as string)];
      const { error: clearError } = await admin
        .from('books')
        .update({ uploaded_at: null, updated_at: new Date().toISOString() })
        .in('user_id', userIds)
        .in('book_hash', missing)
        .not('uploaded_at', 'is', null);
      if (clearError) throw clearError;
    }
    return res.status(200).json({
      present: hashes.filter((h) => present.has(h.toLowerCase())),
      missing,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

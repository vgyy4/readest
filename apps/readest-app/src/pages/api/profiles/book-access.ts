import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { requireMaster } from '@/libs/profiles/api';
import { buildGrantRows, planBookGrants } from '@/libs/profiles/shared';

/**
 * Which profiles can see one book: the admin's per-book view of the same grants
 * /api/profiles/books manages per profile. The admin's own copy never depends on a profile: when a
 * profile deletes a book it only drops its own entry, the admin keeps the book, and this view lists
 * that profile under `removedProfileIds` so the admin can see it no longer has it. A profile holds its own catalog entry
 * for each book it can see, so adding copies the admin's entry (no reading state)
 * and removing soft-deletes the profile's entry; the file itself is never copied.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  try {
    const master = await requireMaster(req, res);
    if (!master) return;
    const { ownerId, admin } = master;

    const bookHash = req.method === 'GET' ? req.query['bookHash'] : req.body?.bookHash;
    if (typeof bookHash !== 'string' || !bookHash) {
      return res.status(400).json({ error: 'Bad request' });
    }

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('profile_user_id')
      .eq('owner_id', ownerId);
    if (profilesError) throw profilesError;
    const owned = (profiles ?? []).map((p) => p.profile_user_id as string);

    const { data: entries, error: heldError } = owned.length
      ? await admin
          .from('books')
          .select('user_id, deleted_at')
          .in('user_id', owned)
          .eq('book_hash', bookHash)
      : { data: [], error: null };
    if (heldError) throw heldError;
    const current = (entries ?? []).filter((b) => !b.deleted_at).map((b) => b.user_id as string);
    // Had the book, and no longer does: the profile deleted it (or the admin took it away).
    const removed = (entries ?? [])
      .filter((b) => b.deleted_at && !current.includes(b.user_id as string))
      .map((b) => b.user_id as string);

    if (req.method === 'GET') {
      return res.status(200).json({ profileIds: current, removedProfileIds: removed });
    }
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

    const desired = req.body?.profileIds;
    if (!Array.isArray(desired) || !desired.every((id) => typeof id === 'string')) {
      return res.status(400).json({ error: 'profileIds must be an array of strings' });
    }
    const { add, remove } = planBookGrants(owned, current, desired);

    if (add.length > 0) {
      const { data: masterRow, error } = await admin
        .from('books')
        .select('*')
        .eq('user_id', ownerId)
        .eq('book_hash', bookHash)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!masterRow) return res.status(404).json({ error: 'Book not found' });
      const rows = add.flatMap((profileId) => buildGrantRows([masterRow], profileId));
      const { error: upsertError } = await admin
        .from('books')
        .upsert(rows, { onConflict: 'user_id,book_hash' });
      if (upsertError) throw upsertError;
    }
    if (remove.length > 0) {
      const { error } = await admin
        .from('books')
        .update({ deleted_at: new Date().toISOString() })
        .in('user_id', remove)
        .eq('book_hash', bookHash);
      if (error) throw error;
    }
    return res.status(200).json({ added: add.length, removed: remove.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

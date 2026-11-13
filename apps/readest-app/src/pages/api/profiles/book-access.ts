import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { requireMaster } from '@/libs/profiles/api';
import { buildGrantRows, planBookGrants } from '@/libs/profiles/shared';

/**
 * Which profiles can see one book: the admin's per-book view of the same grants
 * /api/profiles/books manages per profile. A profile holds its own catalog entry
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

    const { data: held, error: heldError } = owned.length
      ? await admin
          .from('books')
          .select('user_id')
          .in('user_id', owned)
          .eq('book_hash', bookHash)
          .is('deleted_at', null)
      : { data: [], error: null };
    if (heldError) throw heldError;
    const current = (held ?? []).map((b) => b.user_id as string);

    if (req.method === 'GET') return res.status(200).json({ profileIds: current });
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

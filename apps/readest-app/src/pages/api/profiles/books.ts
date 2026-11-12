import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { requireMaster } from '@/libs/profiles/api';
import { buildGrantRows, diffGrants } from '@/libs/profiles/shared';

/**
 * Which of the master's books a profile can see. The profile holds its own
 * book rows (copies of the master's catalog data with no reading state), so it
 * syncs them like any library and keeps its own progress. Removing a book
 * soft-deletes the profile's row; the master's book and file are untouched.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  try {
    const master = await requireMaster(req, res);
    if (!master) return;
    const { ownerId, admin } = master;

    const profileId = req.method === 'GET' ? req.query['profileId'] : req.body?.profileId;
    if (typeof profileId !== 'string') return res.status(400).json({ error: 'Bad request' });
    const { data: owned } = await admin
      .from('profiles')
      .select('profile_user_id')
      .eq('owner_id', ownerId)
      .eq('profile_user_id', profileId)
      .maybeSingle();
    if (!owned) return res.status(404).json({ error: 'Profile not found' });

    const { data: current, error: currentError } = await admin
      .from('books')
      .select('book_hash')
      .eq('user_id', profileId)
      .is('deleted_at', null);
    if (currentError) throw currentError;
    const currentHashes = (current ?? []).map((b) => b.book_hash as string);

    if (req.method === 'GET') return res.status(200).json({ bookHashes: currentHashes });

    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
    const desired = req.body?.bookHashes;
    if (!Array.isArray(desired) || !desired.every((h) => typeof h === 'string')) {
      return res.status(400).json({ error: 'bookHashes must be an array of strings' });
    }

    const { add, remove } = diffGrants(currentHashes, desired);

    if (add.length > 0) {
      const { data: masterRows, error } = await admin
        .from('books')
        .select('*')
        .eq('user_id', ownerId)
        .in('book_hash', add)
        .is('deleted_at', null);
      if (error) throw error;
      if (masterRows?.length) {
        const { error: upsertError } = await admin
          .from('books')
          .upsert(buildGrantRows(masterRows, profileId), { onConflict: 'user_id,book_hash' });
        if (upsertError) throw upsertError;
      }
    }
    if (remove.length > 0) {
      const { error } = await admin
        .from('books')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', profileId)
        .in('book_hash', remove);
      if (error) throw error;
    }
    return res.status(200).json({ added: add.length, removed: remove.length });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

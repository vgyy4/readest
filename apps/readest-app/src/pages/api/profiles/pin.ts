import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { requireMaster } from '@/libs/profiles/api';
import { hashPin, isValidPin } from '@/libs/profiles/server';

/**
 * Master PIN. `verify` checks the PIN sent in X-Readest-Master-PIN (requireMaster
 * already does, so reaching the handler means it was right or none is set);
 * `set` replaces or first sets it; `clear` removes it. Changing needs the
 * current PIN in the header whenever one exists.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const master = await requireMaster(req, res);
    if (!master) return;
    const { ownerId, admin } = master;
    const { action, pin } = req.body ?? {};

    if (action === 'verify') return res.status(200).json({ ok: true });

    if (action === 'set') {
      if (!isValidPin(pin)) return res.status(400).json({ error: 'The PIN must be 4 to 8 digits' });
      const { error } = await admin
        .from('profile_pins')
        .upsert({ owner_id: ownerId, pin_hash: await hashPin(pin), updated_at: new Date() });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'clear') {
      const { error } = await admin.from('profile_pins').delete().eq('owner_id', ownerId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

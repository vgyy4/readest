import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { isPinLocked, recordPinResult, requireMaster } from '@/libs/profiles/api';
import { hashPin, isValidPin, pinAllowsEntry } from '@/libs/profiles/server';

/**
 * PINs, all exactly 4 digits. Every profile can have its own, and so can the
 * main profile (the master PIN).
 *
 * - `verify` { profileId?, pin? }: may this PIN open the profile (no profileId
 *   = the main profile)? A profile accepts its own PIN or the master PIN. It
 *   works while a profile is the active one, which is how a profile unlocks
 *   switching, and failed guesses are rate-limited per account.
 * - `set` / `clear` { profileId?, pin? }: master only, with the current master
 *   PIN in X-Readest-Master-PIN whenever one exists. No profileId sets the
 *   master PIN itself.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, pin, profileId } = req.body ?? {};
    if (profileId !== undefined && profileId !== null && typeof profileId !== 'string') {
      return res.status(400).json({ error: 'Bad request' });
    }

    if (action === 'verify') {
      const master = await requireMaster(req, res, { pin: false });
      if (!master) return;
      const { ownerId, admin } = master;
      if (isPinLocked(ownerId)) {
        return res.status(429).json({ error: 'Too many wrong PINs, try again later' });
      }
      const { data: masterRow } = await admin
        .from('profile_pins')
        .select('pin_hash')
        .eq('owner_id', ownerId)
        .maybeSingle();
      let targetHash: string | null = null;
      if (profileId) {
        const { data: owned } = await admin
          .from('profiles')
          .select('profile_user_id')
          .eq('owner_id', ownerId)
          .eq('profile_user_id', profileId)
          .maybeSingle();
        if (!owned) return res.status(404).json({ error: 'Profile not found' });
        const { data: pinRow } = await admin
          .from('profile_user_pins')
          .select('pin_hash')
          .eq('profile_user_id', profileId)
          .maybeSingle();
        targetHash = pinRow?.pin_hash ?? null;
      }
      const ok = await pinAllowsEntry({
        isMain: !profileId,
        targetHash,
        masterHash: masterRow?.pin_hash ?? null,
        pin: typeof pin === 'string' ? pin : undefined,
      });
      recordPinResult(ownerId, ok);
      return ok ? res.status(200).json({ ok: true }) : res.status(401).json({ error: 'Wrong PIN' });
    }

    const master = await requireMaster(req, res);
    if (!master) return;
    const { ownerId, admin } = master;

    if (profileId) {
      const { data: owned } = await admin
        .from('profiles')
        .select('profile_user_id')
        .eq('owner_id', ownerId)
        .eq('profile_user_id', profileId)
        .maybeSingle();
      if (!owned) return res.status(404).json({ error: 'Profile not found' });
    }

    if (action === 'set') {
      if (!isValidPin(pin)) return res.status(400).json({ error: 'The PIN must be 4 digits' });
      const pinHash = await hashPin(pin);
      const { error } = profileId
        ? await admin
            .from('profile_user_pins')
            .upsert({ profile_user_id: profileId, pin_hash: pinHash, updated_at: new Date() })
        : await admin
            .from('profile_pins')
            .upsert({ owner_id: ownerId, pin_hash: pinHash, updated_at: new Date() });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'clear') {
      const { error } = profileId
        ? await admin.from('profile_user_pins').delete().eq('profile_user_id', profileId)
        : await admin.from('profile_pins').delete().eq('owner_id', ownerId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

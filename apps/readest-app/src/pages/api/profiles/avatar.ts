import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { PROFILE_HEADER } from '@/libs/profiles/shared';
import { isAvatarId } from '@/libs/profiles/avatars';
import { resolveAvatarTarget } from '@/libs/profiles/avatarTarget';

/**
 * Choose a profile's picture. Open to the signed-in account and to a profile acting as
 * itself: no PIN, because a picture is not private and a new profile picks one the first
 * time it is opened. Body: { avatar: 'av-07', profileId?: string }.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, token, ownerId, isProfile } = await validateUserAndToken(
      req.headers['authorization'],
      req.headers[PROFILE_HEADER],
    );
    if (!user || !token || !ownerId) return res.status(403).json({ error: 'Not authenticated' });

    const avatar = req.body?.avatar;
    if (!isAvatarId(avatar)) return res.status(400).json({ error: 'Unknown picture' });

    const target = resolveAvatarTarget({
      isProfile: !!isProfile,
      effectiveUserId: user.id,
      ownerId,
      requested: req.body?.profileId,
    });
    if (!target) return res.status(403).json({ error: 'Not allowed' });

    const admin = createSupabaseAdminClient();
    if (target.kind === 'main') {
      const { error } = await admin
        .from('profile_main_meta')
        .upsert({ owner_id: ownerId, avatar, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      const { data, error } = await admin
        .from('profiles')
        .update({ avatar })
        .eq('owner_id', ownerId)
        .eq('profile_user_id', target.profileId)
        .select('profile_user_id');
      if (error) throw error;
      if (!data?.length) return res.status(404).json({ error: 'Profile not found' });
    }
    return res.status(200).json({ avatar });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'node:crypto';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { MAX_PROFILES, requireMaster } from '@/libs/profiles/api';

/** A column or table the database does not have yet (an update that was not applied). */
export const isMissingSchema = (error: { code?: string; message?: string }) =>
  ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '') ||
  /avatar|profile_main_meta/i.test(error.message ?? '');

const cleanName = (name: unknown) => (typeof name === 'string' ? name.trim().slice(0, 40) : '');

/**
 * Profiles of the signed-in account. Listing is open to the master session;
 * creating, renaming and deleting need the master PIN when one is set.
 * A profile is a hidden, login-less user owned by the account, so its books,
 * progress and notes are separate rows in the existing tables.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  try {
    const master = await requireMaster(req, res, { pin: req.method !== 'GET' });
    if (!master) return;
    const { ownerId, admin } = master;

    if (req.method === 'GET') {
      const listProfiles = (columns: string) =>
        admin
          .from('profiles')
          .select(columns)
          .eq('owner_id', ownerId)
          .order('created_at') as unknown as Promise<{
          data: Record<string, unknown>[] | null;
          error: { code?: string; message?: string } | null;
        }>;
      const [first, { data: pin }, { data: mainMeta }] = await Promise.all([
        listProfiles('profile_user_id, name, avatar, created_at'),
        admin.from('profile_pins').select('owner_id').eq('owner_id', ownerId).maybeSingle(),
        admin.from('profile_main_meta').select('avatar').eq('owner_id', ownerId).maybeSingle(),
      ]);
      let { data: profiles, error } = first;
      // The pictures need database migration 021. Until it is applied, still list the profiles
      // (with no pictures) and say so, rather than failing the whole profile screen.
      let needsMigration = false;
      if (error && isMissingSchema(error)) {
        needsMigration = true;
        ({ data: profiles, error } = await listProfiles('profile_user_id, name, created_at'));
      }
      if (error) throw error;
      const ids = (profiles ?? []).map((p) => p['profile_user_id'] as string);
      const { data: pins } = ids.length
        ? await admin.from('profile_user_pins').select('profile_user_id').in('profile_user_id', ids)
        : { data: [] };
      const withPin = new Set((pins ?? []).map((p) => p.profile_user_id as string));
      return res.status(200).json({
        hasPin: !!pin,
        mainAvatar: mainMeta?.avatar ?? null,
        ...(needsMigration ? { needsMigration: true } : {}),
        profiles: (profiles ?? []).map((p) => ({
          id: p['profile_user_id'],
          name: p['name'],
          avatar: (p['avatar'] as string | null | undefined) ?? null,
          createdAt: p['created_at'],
          hasPin: withPin.has(p['profile_user_id'] as string),
        })),
      });
    }

    if (req.method === 'POST') {
      const name = cleanName(req.body?.name);
      if (!name) return res.status(400).json({ error: 'A profile needs a name' });
      const { count } = await admin
        .from('profiles')
        .select('profile_user_id', { count: 'exact', head: true })
        .eq('owner_id', ownerId);
      if ((count ?? 0) >= MAX_PROFILES) {
        return res.status(400).json({ error: `At most ${MAX_PROFILES} profiles` });
      }
      // No sign-in for this user: unreachable address, random password, banned.
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: `${randomUUID()}@profile.invalid`,
        password: randomUUID() + randomUUID(),
        email_confirm: true,
        ban_duration: '876000h',
        user_metadata: { readest_profile_of: ownerId },
      });
      if (createError || !created.user) throw createError ?? new Error('createUser failed');
      const { error: insertError } = await admin
        .from('profiles')
        .insert({ profile_user_id: created.user.id, owner_id: ownerId, name });
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw insertError;
      }
      return res.status(201).json({ id: created.user.id, name });
    }

    if (req.method === 'PATCH') {
      const name = cleanName(req.body?.name);
      const id = req.body?.id;
      if (!name || typeof id !== 'string') return res.status(400).json({ error: 'Bad request' });
      const { data, error } = await admin
        .from('profiles')
        .update({ name })
        .eq('owner_id', ownerId)
        .eq('profile_user_id', id)
        .select('profile_user_id');
      if (error) throw error;
      if (!data?.length) return res.status(404).json({ error: 'Profile not found' });
      return res.status(200).json({ id, name });
    }

    if (req.method === 'DELETE') {
      const id = req.query['id'];
      if (typeof id !== 'string') return res.status(400).json({ error: 'Bad request' });
      const { data } = await admin
        .from('profiles')
        .select('profile_user_id')
        .eq('owner_id', ownerId)
        .eq('profile_user_id', id)
        .maybeSingle();
      if (!data) return res.status(404).json({ error: 'Profile not found' });
      // Cascades to the profile row and every row the profile owned.
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
      return res.status(200).json({ id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

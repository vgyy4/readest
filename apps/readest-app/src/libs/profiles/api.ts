import type { NextApiRequest, NextApiResponse } from 'next';
import { validateUserAndToken } from '@/utils/access';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { PIN_HEADER, PROFILE_HEADER } from './shared';
import { verifyPin } from './server';

export const MAX_PROFILES = 8;

const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;
// Per server instance; enough to make guessing a 4-digit PIN impractical.
const pinFailures = new Map<string, { count: number; since: number }>();

export const isPinLocked = (ownerId: string, now = Date.now()) => {
  const entry = pinFailures.get(ownerId);
  if (!entry) return false;
  if (now - entry.since > PIN_LOCK_MS) {
    pinFailures.delete(ownerId);
    return false;
  }
  return entry.count >= MAX_PIN_FAILURES;
};

export const recordPinResult = (ownerId: string, ok: boolean, now = Date.now()) => {
  if (ok) {
    pinFailures.delete(ownerId);
    return;
  }
  const entry = pinFailures.get(ownerId);
  pinFailures.set(ownerId, {
    count: (entry?.count ?? 0) + 1,
    since: entry && now - entry.since <= PIN_LOCK_MS ? entry.since : now,
  });
};

export interface MasterContext {
  ownerId: string;
  admin: ReturnType<typeof createSupabaseAdminClient>;
}

/**
 * Authenticate a master-only request: the account itself (never a profile),
 * and, when the master has set a PIN, the right PIN in X-Readest-Master-PIN.
 * Sends the error response and returns null when the request is refused.
 */
export const requireMaster = async (
  req: NextApiRequest,
  res: NextApiResponse,
  { pin = true }: { pin?: boolean } = {},
): Promise<MasterContext | null> => {
  const { user, token, isProfile } = await validateUserAndToken(
    req.headers['authorization'],
    req.headers[PROFILE_HEADER],
  );
  if (!user || !token || isProfile) {
    res.status(403).json({ error: 'Not authenticated' });
    return null;
  }
  const admin = createSupabaseAdminClient();
  if (pin) {
    const { data } = await admin
      .from('profile_pins')
      .select('pin_hash')
      .eq('owner_id', user.id)
      .maybeSingle();
    if (data) {
      if (isPinLocked(user.id)) {
        res.status(429).json({ error: 'Too many wrong PINs, try again later' });
        return null;
      }
      const given = req.headers[PIN_HEADER];
      const ok = typeof given === 'string' && (await verifyPin(given, data.pin_hash));
      recordPinResult(user.id, ok);
      if (!ok) {
        res.status(401).json({ error: 'PIN required' });
        return null;
      }
    }
  }
  return { ownerId: user.id, admin };
};

/**
 * Which of `bookHashes` a profile of this account can still see. Their files
 * are the account's single copy, so the owner may not delete them from storage
 * while a profile uses them.
 */
export const getBooksInUseByProfiles = async (
  admin: MasterContext['admin'],
  ownerId: string,
  bookHashes: string[],
): Promise<Set<string>> => {
  if (bookHashes.length === 0) return new Set();
  const { data: profiles } = await admin
    .from('profiles')
    .select('profile_user_id')
    .eq('owner_id', ownerId);
  const profileIds = (profiles ?? []).map((p) => p.profile_user_id as string);
  if (profileIds.length === 0) return new Set();
  const { data: books } = await admin
    .from('books')
    .select('book_hash')
    .in('user_id', profileIds)
    .in('book_hash', bookHashes)
    .is('deleted_at', null);
  return new Set((books ?? []).map((b) => b.book_hash as string));
};

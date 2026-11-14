import { getAPIBaseUrl } from '@/services/environment';
import { fetchWithAuth } from '@/utils/fetch';
import { getActiveProfileId, setActiveProfileId } from './active';
import { setCachedAvatar, setCachedProfiles, type ProfileInfo, type ProfilesState } from './cache';
import { forgetPinsOfProfilesWithoutPin, matchesRememberedPin, rememberPin } from './pinCache';
import { isOfflineError } from './offline';
import { PIN_HEADER } from './shared';

export type { ProfileInfo, ProfilesState };
export { getCachedProfiles } from './cache';

const endpoint = (path: string) => `${getAPIBaseUrl()}/profiles${path}`;

const pinHeaders = (pin?: string): Record<string, string> => (pin ? { [PIN_HEADER]: pin } : {});

const json = (method: string, body: unknown, pin?: string): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...pinHeaders(pin) },
  body: JSON.stringify(body),
});

export const fetchProfiles = async (): Promise<ProfilesState> => {
  const response = await fetchWithAuth(endpoint(''), { method: 'GET' });
  const state = (await response.json()) as ProfilesState;
  setCachedProfiles(state);
  forgetPinsOfProfilesWithoutPin(state);
  return state;
};

export const createProfile = async (name: string, pin?: string): Promise<ProfileInfo> =>
  (await (await fetchWithAuth(endpoint(''), json('POST', { name }, pin))).json()) as ProfileInfo;

export const renameProfile = async (id: string, name: string, pin?: string) => {
  await fetchWithAuth(endpoint(''), json('PATCH', { id, name }, pin));
};

export const deleteProfile = async (id: string, pin?: string) => {
  await fetchWithAuth(`${endpoint('')}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: pinHeaders(pin),
  });
};

export const fetchProfileBooks = async (profileId: string, pin?: string): Promise<string[]> => {
  const response = await fetchWithAuth(
    `${endpoint('/books')}?profileId=${encodeURIComponent(profileId)}`,
    { method: 'GET', headers: pinHeaders(pin) },
  );
  return ((await response.json()) as { bookHashes: string[] }).bookHashes;
};

/** The server answers "Book not found" for a book it has not received yet. */
const withBookHint = async <T>(request: Promise<T>): Promise<T> => {
  try {
    return await request;
  } catch (e) {
    if (e instanceof Error && e.message === 'Book not found') {
      throw new Error(
        'This book has not reached the server yet. Wait for sync to finish, then try again.',
      );
    }
    throw e;
  }
};

export const setProfileBooks = async (profileId: string, bookHashes: string[], pin?: string) => {
  await withBookHint(
    fetchWithAuth(endpoint('/books'), json('PUT', { profileId, bookHashes }, pin)),
  );
};

export interface BookAccess {
  /** Profiles that can see the book. */
  profileIds: string[];
  /** Profiles that had it and no longer do (they deleted it, or it was taken away). */
  removedProfileIds: string[];
}

/** The admin's per-book view: which profiles can see `bookHash`, and which dropped it. */
export const fetchBookAccess = async (bookHash: string, pin?: string): Promise<BookAccess> => {
  const response = await fetchWithAuth(
    `${endpoint('/book-access')}?bookHash=${encodeURIComponent(bookHash)}`,
    { method: 'GET', headers: pinHeaders(pin) },
  );
  const body = (await response.json()) as Partial<BookAccess>;
  return { profileIds: body.profileIds ?? [], removedProfileIds: body.removedProfileIds ?? [] };
};

export const setBookAccess = async (bookHash: string, profileIds: string[], pin?: string) => {
  await withBookHint(
    fetchWithAuth(endpoint('/book-access'), json('PUT', { bookHash, profileIds }, pin)),
  );
};

/** 4-digit PINs. No `profileId` is the master PIN of the main profile. */
export const setPin = async (newPin: string, masterPin?: string, profileId?: string) => {
  await fetchWithAuth(
    endpoint('/pin'),
    json('POST', { action: 'set', pin: newPin, profileId }, masterPin),
  );
};

export const clearPin = async (masterPin?: string, profileId?: string) => {
  await fetchWithAuth(endpoint('/pin'), json('POST', { action: 'clear', profileId }, masterPin));
};

/** What checking a PIN came to: `offline-unknown` is "no connection and never checked here". */
export type PinCheck = 'ok' | 'wrong' | 'offline-unknown';

/**
 * May `pin` open this profile (null = the main profile)? A profile takes its own PIN or the
 * master PIN. Sent as the main account (no profile header) even while a profile is active, which
 * is how a profile unlocks switching. Without a connection, a PIN that was accepted before on this
 * device is accepted again (see pinCache); one never checked here cannot be told.
 */
export const checkProfilePin = async (
  profileId: string | null,
  pin?: string,
): Promise<PinCheck> => {
  const active = getActiveProfileId();
  setActiveProfileId(null);
  try {
    await fetchWithAuth(endpoint('/pin'), json('POST', { action: 'verify', profileId, pin }));
    if (pin) await rememberPin(profileId, pin);
    return 'ok';
  } catch (error) {
    // The server answered: it said no (wrong PIN, too many tries). Believe it.
    if (!isOfflineError(error)) return 'wrong';
    const remembered = pin ? await matchesRememberedPin(profileId, pin) : null;
    if (remembered === null) return 'offline-unknown';
    return remembered ? 'ok' : 'wrong';
  } finally {
    setActiveProfileId(active);
  }
};

export const verifyProfilePin = async (profileId: string | null, pin?: string) =>
  (await checkProfilePin(profileId, pin)) === 'ok';

/** Use `profileId` (null = the master) and reload, as library and progress change with it. */
export const switchProfile = (profileId: string | null) => {
  setActiveProfileId(profileId);
  window.location.reload();
};

/**
 * Pick a stock picture. Inside a profile this sets that profile's own; as the main
 * profile, `profileId` chooses another profile's (omit it for the main profile's).
 * No PIN is needed.
 */
export const chooseAvatar = async (avatar: string, profileId?: string | null) => {
  await fetchWithAuth(
    endpoint('/avatar'),
    json('POST', { avatar, profileId: profileId ?? undefined }),
  );
  setCachedAvatar(profileId ?? getActiveProfileId(), avatar);
};

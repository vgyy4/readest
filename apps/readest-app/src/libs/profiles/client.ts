import { getAPIBaseUrl } from '@/services/environment';
import { fetchWithAuth } from '@/utils/fetch';
import { readJson } from '@/utils/readJson';
import { getActiveProfileId, setActiveProfileId } from './active';
import {
  getCachedProfiles,
  setCachedAvatar,
  setCachedProfiles,
  type ProfileInfo,
  type ProfilesState,
} from './cache';
import { forgetPinsOfProfilesWithoutPin, matchesRememberedPin, rememberPin } from './pinCache';
import { isOfflineError } from './offline';
import { verifyScryptPin } from './scrypt';
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
  const state = await readJson<ProfilesState>(response);
  setCachedProfiles(state);
  forgetPinsOfProfilesWithoutPin(state);
  return state;
};

export const createProfile = async (name: string, pin?: string): Promise<ProfileInfo> =>
  readJson<ProfileInfo>(await fetchWithAuth(endpoint(''), json('POST', { name }, pin)));

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
  return (await readJson<{ bookHashes: string[] }>(response)).bookHashes;
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
  const body = await readJson<Partial<BookAccess>>(response);
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
/**
 * Does `pin` open `profileId` (null = main) according to the verifiers in the last list of
 * profiles? A profile takes its own PIN or the master PIN; the main profile only the master PIN.
 * `null` when the list has none (no list yet, or a server that does not send them).
 */
const matchesListedVerifiers = async (
  profileId: string | null,
  pin?: string,
): Promise<boolean | null> => {
  const state = getCachedProfiles();
  if (!state) return null;
  const master = state.mainPinVerifier;
  const own = profileId ? state.profiles.find((p) => p.id === profileId)?.pinVerifier : master;
  if (own === undefined || master === undefined) return null;
  // Where no PIN is set, none is asked for (as on the server).
  if ((profileId ? own : master) === null) return true;
  if (!pin) return false;
  const accepted = (profileId ? [own, master] : [master]).filter((v): v is string => !!v);
  for (const verifier of accepted) {
    if (await verifyScryptPin(pin, verifier)) return true;
  }
  return false;
};

const PIN_CHECK_TIMEOUT_MS = 6000;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

export const checkProfilePin = async (
  profileId: string | null,
  pin?: string,
): Promise<PinCheck> => {
  const active = getActiveProfileId();
  setActiveProfileId(null);
  try {
    // A device that knows it is offline has nothing to ask; and one that thinks it is online may
    // still never get an answer (the sign-in layer retries a token refresh for a long time), so
    // the question gets a few seconds before the remembered PIN is used instead.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new TypeError('offline');
    }
    await withTimeout(
      fetchWithAuth(endpoint('/pin'), json('POST', { action: 'verify', profileId, pin })),
      PIN_CHECK_TIMEOUT_MS,
    );
    if (pin) await rememberPin(profileId, pin);
    return 'ok';
  } catch (error) {
    // The server answered: it said no (wrong PIN, too many tries). Believe it.
    if (!isOfflineError(error)) return 'wrong';
    // The list of profiles carries what the server stores to check each PIN; with it any PIN can
    // be checked here, including one never typed on this device. It is also the newer word than a
    // PIN remembered earlier (the PIN may have been changed since).
    const byList = await matchesListedVerifiers(profileId, pin);
    if (byList !== null) return byList ? 'ok' : 'wrong';
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

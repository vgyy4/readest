import { getAPIBaseUrl } from '@/services/environment';
import { fetchWithAuth } from '@/utils/fetch';
import { getActiveProfileId, setActiveProfileId } from './active';
import { setCachedAvatar, setCachedProfiles, type ProfileInfo, type ProfilesState } from './cache';
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

/** The admin's per-book view: which profiles can see `bookHash`. */
export const fetchBookAccess = async (bookHash: string, pin?: string): Promise<string[]> => {
  const response = await fetchWithAuth(
    `${endpoint('/book-access')}?bookHash=${encodeURIComponent(bookHash)}`,
    { method: 'GET', headers: pinHeaders(pin) },
  );
  return ((await response.json()) as { profileIds: string[] }).profileIds;
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

/**
 * May `pin` open this profile (null = the main profile)? A profile takes its own
 * PIN or the master PIN. Sent as the main account (no profile header) even while
 * a profile is active, which is how a profile unlocks switching.
 */
export const verifyProfilePin = async (profileId: string | null, pin?: string) => {
  const active = getActiveProfileId();
  setActiveProfileId(null);
  try {
    await fetchWithAuth(endpoint('/pin'), json('POST', { action: 'verify', profileId, pin }));
    return true;
  } catch {
    return false;
  } finally {
    setActiveProfileId(active);
  }
};

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

import { getAPIBaseUrl } from '@/services/environment';
import { fetchWithAuth } from '@/utils/fetch';
import { getActiveProfileId, setActiveProfileId } from './active';
import { setCachedProfiles, type ProfileInfo, type ProfilesState } from './cache';
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

export const setProfileBooks = async (profileId: string, bookHashes: string[], pin?: string) => {
  await fetchWithAuth(endpoint('/books'), json('PUT', { profileId, bookHashes }, pin));
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
  await fetchWithAuth(endpoint('/book-access'), json('PUT', { bookHash, profileIds }, pin));
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

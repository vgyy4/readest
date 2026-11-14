export interface ProfileInfo {
  id: string;
  name: string;
  /** The profile has a PIN of its own. */
  hasPin?: boolean;
  /**
   * What the server stores to check the profile's PIN (`scrypt$salt$hash`), so a PIN can be
   * checked without a connection. null: no PIN. Missing: a server that does not send it.
   */
  pinVerifier?: string | null;
  /** A stock avatar id such as 'av-07'; null until the profile picks one. */
  avatar?: string | null;
}

export interface ProfilesState {
  hasPin: boolean;
  /** The master PIN's stored check (see {@link ProfileInfo.pinVerifier}). */
  mainPinVerifier?: string | null;
  /** The main profile's picture. */
  mainAvatar?: string | null;
  /** The server's database update for pictures has not been applied yet. */
  needsMigration?: boolean;
  profiles: ProfileInfo[];
}

export const CACHE_KEY = 'readest-profiles-cache';

/** The last list the main profile saw, so a profile or the admin check works offline. */
export const getCachedProfiles = (): ProfilesState | null => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as ProfilesState | null;
  } catch {
    return null;
  }
};

export const setCachedProfiles = (state: ProfilesState) =>
  localStorage.setItem(CACHE_KEY, JSON.stringify(state));

/** Remember a picture the device just saved, so the profile is not asked again. */
export const setCachedAvatar = (profileId: string | null, avatar: string) => {
  const state = getCachedProfiles();
  if (!state) return;
  if (profileId) {
    state.profiles = state.profiles.map((p) => (p.id === profileId ? { ...p, avatar } : p));
  } else {
    state.mainAvatar = avatar;
  }
  setCachedProfiles(state);
};

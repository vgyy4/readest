export interface ProfileInfo {
  id: string;
  name: string;
  /** The profile has a PIN of its own. */
  hasPin?: boolean;
}

export interface ProfilesState {
  hasPin: boolean;
  profiles: ProfileInfo[];
}

const CACHE_KEY = 'readest-profiles-cache';

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

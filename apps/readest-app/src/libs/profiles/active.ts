const STORAGE_KEY = 'readest-active-profile';

/** The profile this device is using; null is the master (the account itself). */
export const getActiveProfileId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY) || null;
};

export const isProfileActive = () => getActiveProfileId() !== null;

/**
 * Remember the profile. Library, progress and sync timestamps are all read
 * through the active id, so callers reload the app after switching.
 */
export const setActiveProfileId = (id: string | null) => {
  if (typeof localStorage === 'undefined') return;
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
};

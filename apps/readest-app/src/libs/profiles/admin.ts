import { isProfileActive } from './active';
import { getCachedProfiles } from './cache';

const KEY = 'readest-admin-mode';

/**
 * The main profile acts as the admin: it adds books and decides who can see
 * what, but does not read (opening a book shows who has it instead). That turns
 * on by itself once the account has a profile, and can be switched either way.
 * A profile is always for reading.
 */
export const isAdminMode = (): boolean => {
  if (typeof localStorage === 'undefined' || isProfileActive()) return false;
  const setting = localStorage.getItem(KEY);
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return (getCachedProfiles()?.profiles.length ?? 0) > 0;
};

/** The explicit choice, or null for "automatic". */
export const getAdminModeSetting = (): boolean | null => {
  const setting = localStorage.getItem(KEY);
  return setting === 'on' ? true : setting === 'off' ? false : null;
};

export const setAdminModeSetting = (enabled: boolean | null) => {
  if (enabled === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, enabled ? 'on' : 'off');
};

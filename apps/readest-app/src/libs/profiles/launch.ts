import { getActiveProfileId, setActiveProfileId } from './active';
import { CACHE_KEY, type ProfilesState } from './cache';

/**
 * Which profile is in use is chosen at every app launch. "Chosen" lives in sessionStorage:
 * it survives a page reload but is gone when the app is closed and opened again, which is
 * what makes the profile screen appear on each launch (the profile itself is remembered
 * in localStorage, but only so a reload keeps working).
 */
export const CHOSEN_KEY = 'readest-profile-chosen';
const AVATAR_SKIPPED_KEY = 'readest-avatar-skipped';

const session = () => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

export const hasChosenProfile = () => session()?.getItem(CHOSEN_KEY) === '1';
export const markProfileChosen = () => session()?.setItem(CHOSEN_KEY, '1');

/** Does this account have profiles to choose between? (Without any, there is nothing to pick.) */
export const hasProfiles = (state: ProfilesState | null | undefined) =>
  (state?.profiles.length ?? 0) > 0;

/** The picture of `profileId` (null = the main profile) in the last list this device saw. */
export const avatarOf = (state: ProfilesState, profileId: string | null) =>
  profileId ? state.profiles.find((p) => p.id === profileId)?.avatar : state.mainAvatar;

export const markAvatarSkipped = (profileId: string | null) =>
  session()?.setItem(`${AVATAR_SKIPPED_KEY}:${profileId ?? 'main'}`, '1');

/**
 * Should this profile be asked for a picture? Only the first time it is opened (no picture
 * yet), and only in accounts that have profiles. Skipping asks again next launch.
 */
export const needsAvatar = (state: ProfilesState | null | undefined, profileId: string | null) => {
  if (!state || !hasProfiles(state)) return false;
  if (profileId && !state.profiles.some((p) => p.id === profileId)) return false;
  if (session()?.getItem(`${AVATAR_SKIPPED_KEY}:${profileId ?? 'main'}`) === '1') return false;
  return !avatarOf(state, profileId);
};

/** Start using `profileId` (null = the main profile) for this launch. */
export const enterProfile = (profileId: string | null) => {
  setActiveProfileId(profileId);
  markProfileChosen();
};

/** "Switch profile": leave the current profile and show the profile screen again. */
export const leaveProfile = () => {
  session()?.removeItem(CHOSEN_KEY);
  setActiveProfileId(null);
  window.location.reload();
};

/** On sign-out: nothing of this account's profiles should linger for the next one. */
export const clearProfileSession = () => {
  session()?.removeItem(CHOSEN_KEY);
  setActiveProfileId(null);
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
};

export const isInsideProfile = () => getActiveProfileId() !== null;

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveProfileId } from '@/libs/profiles/active';
import { getCachedProfiles, setCachedAvatar, setCachedProfiles } from '@/libs/profiles/cache';
import {
  avatarOf,
  clearProfileSession,
  enterProfile,
  hasChosenProfile,
  hasProfiles,
  leaveProfile,
  markAvatarSkipped,
  needsAvatar,
} from '@/libs/profiles/launch';
import { resolveAvatarTarget } from '@/libs/profiles/avatarTarget';

const state = {
  hasPin: false,
  mainAvatar: null,
  profiles: [
    { id: 'kid-1', name: 'Noa', avatar: 'av-03' },
    { id: 'kid-2', name: 'Eli', avatar: null },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('choosing a profile at launch', () => {
  it('is not chosen until the app says so, and forgotten when it is closed (sessionStorage)', () => {
    expect(hasChosenProfile()).toBe(false);
    enterProfile('kid-1');
    expect(hasChosenProfile()).toBe(true);
    expect(getActiveProfileId()).toBe('kid-1');
    sessionStorage.clear(); // a new launch
    expect(hasChosenProfile()).toBe(false);
    expect(getActiveProfileId()).toBe('kid-1'); // remembered, but the picker still shows
  });

  it('only matters for accounts that have profiles', () => {
    expect(hasProfiles(null)).toBe(false);
    expect(hasProfiles({ hasPin: false, profiles: [] })).toBe(false);
    expect(hasProfiles(state)).toBe(true);
  });

  it('Switch profile leaves the profile and reloads to the picker', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    enterProfile('kid-2');
    leaveProfile();
    expect(hasChosenProfile()).toBe(false);
    expect(getActiveProfileId()).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it('signing out forgets the profile and the cached list', () => {
    setCachedProfiles(state);
    enterProfile('kid-1');
    clearProfileSession();
    expect(getActiveProfileId()).toBeNull();
    expect(hasChosenProfile()).toBe(false);
    expect(getCachedProfiles()).toBeNull();
  });
});

describe('the first-open picture prompt', () => {
  it('asks a profile with no picture, once it is opened', () => {
    expect(needsAvatar(state, 'kid-2')).toBe(true);
    expect(needsAvatar(state, 'kid-1')).toBe(false);
  });

  it('asks the main profile too, but only in an account with profiles', () => {
    expect(needsAvatar(state, null)).toBe(true);
    expect(needsAvatar({ ...state, mainAvatar: 'av-10' }, null)).toBe(false);
    expect(needsAvatar({ hasPin: false, profiles: [] }, null)).toBe(false);
    expect(needsAvatar(null, null)).toBe(false);
  });

  it('does not ask about a profile the list does not know', () => {
    expect(needsAvatar(state, 'unknown')).toBe(false);
  });

  it('stops asking after Skip for this launch', () => {
    markAvatarSkipped('kid-2');
    expect(needsAvatar(state, 'kid-2')).toBe(false);
    expect(needsAvatar(state, null)).toBe(true);
  });

  it('remembers a saved picture so it is not asked again', () => {
    setCachedProfiles(state);
    setCachedAvatar('kid-2', 'av-20');
    setCachedAvatar(null, 'av-44');
    const saved = getCachedProfiles()!;
    expect(avatarOf(saved, 'kid-2')).toBe('av-20');
    expect(avatarOf(saved, null)).toBe('av-44');
    expect(needsAvatar(saved, 'kid-2')).toBe(false);
  });
});

describe('who may change which picture', () => {
  const base = { effectiveUserId: 'owner', ownerId: 'owner' };

  it('the account changes the main picture, or any profile it names', () => {
    expect(resolveAvatarTarget({ ...base, isProfile: false, requested: undefined })).toEqual({
      kind: 'main',
    });
    expect(resolveAvatarTarget({ ...base, isProfile: false, requested: 'owner' })).toEqual({
      kind: 'main',
    });
    expect(resolveAvatarTarget({ ...base, isProfile: false, requested: 'kid-1' })).toEqual({
      kind: 'child',
      profileId: 'kid-1',
    });
  });

  it('a profile changes only its own picture', () => {
    const asKid = { effectiveUserId: 'kid-1', ownerId: 'owner', isProfile: true };
    expect(resolveAvatarTarget({ ...asKid, requested: undefined })).toEqual({
      kind: 'child',
      profileId: 'kid-1',
    });
    expect(resolveAvatarTarget({ ...asKid, requested: 'kid-1' })).toEqual({
      kind: 'child',
      profileId: 'kid-1',
    });
    expect(resolveAvatarTarget({ ...asKid, requested: 'kid-2' })).toBeNull();
    expect(resolveAvatarTarget({ ...asKid, requested: 'owner' })).toBeNull();
  });
});

describe('opening the app again after a long time away', () => {
  it('asks who is reading after ten minutes, not after a short break', async () => {
    const { AWAY_MS, shouldReturnToPicker } = await import('@/libs/profiles/launch');
    expect(shouldReturnToPicker(AWAY_MS, state)).toBe(true);
    expect(shouldReturnToPicker(AWAY_MS - 1, state)).toBe(false);
    // An account without profiles has nothing to ask.
    expect(shouldReturnToPicker(AWAY_MS * 5, { hasPin: false, profiles: [] })).toBe(false);
    expect(shouldReturnToPicker(AWAY_MS * 5, null)).toBe(false);
  });

  it('Switch profile asks the screen to explain itself if there turns out to be nothing to pick', async () => {
    const { consumeSwitchRequest } = await import('@/libs/profiles/launch');
    vi.stubGlobal('location', { ...window.location, reload: vi.fn(), assign: vi.fn() });
    expect(consumeSwitchRequest()).toBe(false);
    leaveProfile();
    expect(consumeSwitchRequest()).toBe(true);
    expect(consumeSwitchRequest()).toBe(false); // only once
  });
});

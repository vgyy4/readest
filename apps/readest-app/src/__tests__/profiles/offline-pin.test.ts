import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/environment', () => ({ getAPIBaseUrl: () => 'https://server.test/api' }));
vi.mock('@/utils/fetch', () => ({ fetchWithAuth: (...a: unknown[]) => fetchMock(...a) }));

import {
  forgetPin,
  forgetPinsOfProfilesWithoutPin,
  matchesRememberedPin,
  rememberPin,
} from '@/libs/profiles/pinCache';
import { checkProfilePin, fetchProfiles, verifyProfilePin } from '@/libs/profiles/client';

const KID = 'kid-1';
const offline = () => new TypeError('Failed to fetch');
const serverSays = (message: string) => new Error(message);

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
});

describe('remembered PINs', () => {
  it('match the PIN that was remembered, and no other', async () => {
    await rememberPin(KID, '7305');
    expect(await matchesRememberedPin(KID, '7305')).toBe(true);
    expect(await matchesRememberedPin(KID, '1111')).toBe(false);
  });

  it('say so when nothing was remembered', async () => {
    expect(await matchesRememberedPin(KID, '7305')).toBeNull();
  });

  it('never keep the PIN itself', async () => {
    await rememberPin(KID, '7305');
    const stored = Object.entries(localStorage)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    expect(stored).not.toContain('7305');
  });

  it('keep the main profile apart from a profile, and can forget one', async () => {
    await rememberPin(null, '4821');
    await rememberPin(KID, '7305');
    expect(await matchesRememberedPin(null, '7305')).toBe(false);
    forgetPin(KID);
    expect(await matchesRememberedPin(KID, '7305')).toBeNull();
    expect(await matchesRememberedPin(null, '4821')).toBe(true);
  });

  it('are forgotten for a profile (or the main profile) that no longer has a PIN', async () => {
    await rememberPin(null, '4821');
    await rememberPin(KID, '7305');
    await rememberPin('other', '1234');
    forgetPinsOfProfilesWithoutPin({
      hasPin: false,
      profiles: [
        { id: KID, name: 'Kid', hasPin: false },
        { id: 'other', name: 'Other', hasPin: true },
      ],
    });
    expect(await matchesRememberedPin(null, '4821')).toBeNull();
    expect(await matchesRememberedPin(KID, '7305')).toBeNull();
    expect(await matchesRememberedPin('other', '1234')).toBe(true);
  });
});

describe('checkProfilePin without a connection that answers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not even ask the server when the device says it is offline', async () => {
    await rememberPin(KID, '7305');
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    expect(await checkProfilePin(KID, '7305')).toBe('ok');
    expect(await checkProfilePin(KID, '1111')).toBe('wrong');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says it cannot tell, offline, for a PIN never checked on this device', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    expect(await checkProfilePin(KID, '7305')).toBe('offline-unknown');
  });

  it('gives up on a server that never answers (the sign-in layer retrying for a long time) and uses what was remembered', async () => {
    vi.useFakeTimers();
    await rememberPin(KID, '7305');
    fetchMock.mockReturnValue(new Promise(() => {}));
    const result = checkProfilePin(KID, '7305');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe('ok');
  });

  it('puts the active profile back after giving up', async () => {
    vi.useFakeTimers();
    localStorage.setItem('readest-active-profile', 'someone');
    fetchMock.mockReturnValue(new Promise(() => {}));
    const result = checkProfilePin(KID, '7305');
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(localStorage.getItem('readest-active-profile')).toBe('someone');
  });
});

describe('checkProfilePin', () => {
  it('opens a profile the server accepts, and remembers the PIN for later', async () => {
    fetchMock.mockResolvedValue({});
    expect(await checkProfilePin(KID, '7305')).toBe('ok');
    expect(await matchesRememberedPin(KID, '7305')).toBe(true);
  });

  it('refuses what the server refuses, even when a different PIN was remembered', async () => {
    await rememberPin(KID, '7305');
    fetchMock.mockRejectedValue(serverSays('Wrong PIN'));
    expect(await checkProfilePin(KID, '1111')).toBe('wrong');
    // and a remembered PIN does not override a server that says no
    fetchMock.mockRejectedValue(serverSays('Wrong PIN'));
    expect(await checkProfilePin(KID, '7305')).toBe('wrong');
  });

  it('with no connection, accepts the PIN that was used before', async () => {
    await rememberPin(KID, '7305');
    fetchMock.mockRejectedValue(offline());
    expect(await checkProfilePin(KID, '7305')).toBe('ok');
  });

  it('with no connection, refuses a wrong PIN', async () => {
    await rememberPin(KID, '7305');
    fetchMock.mockRejectedValue(offline());
    expect(await checkProfilePin(KID, '1111')).toBe('wrong');
  });

  it('with no connection and nothing remembered, says it cannot tell (not "wrong PIN")', async () => {
    fetchMock.mockRejectedValue(offline());
    expect(await checkProfilePin(KID, '7305')).toBe('offline-unknown');
  });

  it('treats an expired session while offline like having no connection', async () => {
    await rememberPin(KID, '7305');
    fetchMock.mockRejectedValue(serverSays('Not authenticated'));
    expect(await checkProfilePin(KID, '7305')).toBe('ok');
  });

  it('verifyProfilePin stays a plain yes or no for the other screens', async () => {
    await rememberPin(KID, '7305');
    fetchMock.mockRejectedValue(offline());
    expect(await verifyProfilePin(KID, '7305')).toBe(true);
    expect(await verifyProfilePin(KID, '9999')).toBe(false);
  });
});

describe('fetchProfiles', () => {
  it('forgets remembered PINs of profiles whose PIN was removed on the server', async () => {
    await rememberPin(KID, '7305');
    fetchMock.mockResolvedValue({
      json: async () => ({ hasPin: true, profiles: [{ id: KID, name: 'Kid', hasPin: false }] }),
    });
    await fetchProfiles();
    expect(await matchesRememberedPin(KID, '7305')).toBeNull();
  });
});

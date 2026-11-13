import { describe, expect, it } from 'vitest';
import {
  buildGrantRows,
  pinAllowsEntry,
  planBookGrants,
  diffGrants,
  hashPin,
  isValidPin,
  resolveProfileUser,
  verifyPin,
} from '@/libs/profiles/server';

const OWNER = '11111111-1111-1111-1111-111111111111';
const KID = '22222222-2222-2222-2222-222222222222';

describe('resolveProfileUser', () => {
  const lookup = async (owner: string, profileId: string) => owner === OWNER && profileId === KID;

  it('uses the account itself when no profile is requested', async () => {
    expect(await resolveProfileUser(OWNER, undefined, lookup)).toEqual({
      userId: OWNER,
      isProfile: false,
    });
    expect(await resolveProfileUser(OWNER, '', lookup)).toEqual({
      userId: OWNER,
      isProfile: false,
    });
    expect(await resolveProfileUser(OWNER, OWNER, lookup)).toEqual({
      userId: OWNER,
      isProfile: false,
    });
  });

  it("maps a profile the account owns to that profile's user", async () => {
    expect(await resolveProfileUser(OWNER, KID, lookup)).toEqual({ userId: KID, isProfile: true });
  });

  it('rejects a profile that belongs to someone else or does not exist', async () => {
    expect(await resolveProfileUser('someone-else', KID, lookup)).toBeNull();
    expect(await resolveProfileUser(OWNER, 'not-a-profile', lookup)).toBeNull();
  });
});

describe('master PIN', () => {
  it('verifies the right PIN and rejects the wrong one', async () => {
    const stored = await hashPin('4821');
    expect(await verifyPin('4821', stored)).toBe(true);
    expect(await verifyPin('4822', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPin('4821')).not.toBe(await hashPin('4821'));
  });

  it('never accepts a malformed stored hash', async () => {
    expect(await verifyPin('1234', 'garbage')).toBe(false);
    expect(await verifyPin('1234', '')).toBe(false);
  });

  it('accepts exactly 4 digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('0000')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin(1234)).toBe(false);
  });
});

describe('diffGrants', () => {
  it('adds new books and removes the ones no longer granted', () => {
    expect(diffGrants(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
  });

  it('is a no-op when nothing changed and ignores duplicates', () => {
    expect(diffGrants(['a'], ['a', 'a'])).toEqual({ add: [], remove: [] });
  });
});

describe('buildGrantRows', () => {
  it("copies the master's book rows to the profile without any reading state", () => {
    const rows = buildGrantRows(
      [
        {
          user_id: OWNER,
          book_hash: 'a',
          title: 'Dune',
          uploaded_at: '2026-01-01T00:00:00Z',
          progress: [3, 10],
          reading_status: 'reading',
          reading_status_updated_at: '2026-02-01T00:00:00Z',
          deleted_at: '2026-03-01T00:00:00Z',
        },
      ],
      KID,
    );
    expect(rows).toEqual([
      {
        user_id: KID,
        book_hash: 'a',
        title: 'Dune',
        uploaded_at: '2026-01-01T00:00:00Z',
        progress: null,
        reading_status: null,
        reading_status_updated_at: null,
        deleted_at: null,
      },
    ]);
  });
});

describe('PIN attempt limiter', () => {
  it('locks after repeated wrong PINs and unlocks after the window', async () => {
    const { isPinLocked, recordPinResult } = await import('@/libs/profiles/api');
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) recordPinResult('owner-a', false, t0 + i);
    expect(isPinLocked('owner-a', t0 + 10)).toBe(false);
    recordPinResult('owner-a', false, t0 + 5);
    expect(isPinLocked('owner-a', t0 + 10)).toBe(true);
    expect(isPinLocked('owner-b', t0 + 10)).toBe(false);
    expect(isPinLocked('owner-a', t0 + 6 * 60 * 1000)).toBe(false);
  });

  it('forgets earlier failures after a right PIN', async () => {
    const { isPinLocked, recordPinResult } = await import('@/libs/profiles/api');
    for (let i = 0; i < 5; i++) recordPinResult('owner-c', false, 1);
    recordPinResult('owner-c', true, 2);
    expect(isPinLocked('owner-c', 3)).toBe(false);
  });
});

describe('pinAllowsEntry', () => {
  it('lets anyone into a profile with no PIN of its own, and into a main profile with no PIN', async () => {
    const master = await hashPin('1111');
    expect(await pinAllowsEntry({ isMain: false, targetHash: null, masterHash: master })).toBe(
      true,
    );
    expect(await pinAllowsEntry({ isMain: true, targetHash: null, masterHash: null })).toBe(true);
  });

  it("asks a profile's own PIN, and also accepts the master PIN", async () => {
    const kid = await hashPin('2222');
    const master = await hashPin('1111');
    const entry = { isMain: false, targetHash: kid, masterHash: master };
    expect(await pinAllowsEntry({ ...entry, pin: '2222' })).toBe(true);
    expect(await pinAllowsEntry({ ...entry, pin: '1111' })).toBe(true);
    expect(await pinAllowsEntry({ ...entry, pin: '3333' })).toBe(false);
    expect(await pinAllowsEntry(entry)).toBe(false);
  });

  it('keeps a profile PIN from opening the main profile', async () => {
    const kid = await hashPin('2222');
    const master = await hashPin('1111');
    const entry = { isMain: true, targetHash: null, masterHash: master };
    expect(await pinAllowsEntry({ ...entry, pin: '2222' })).toBe(false);
    expect(await pinAllowsEntry({ ...entry, pin: '1111' })).toBe(true);
    expect(kid).toBeTruthy();
  });
});

describe('planBookGrants', () => {
  const owned = ['kid1', 'kid2', 'teen'];

  it('adds the profiles newly given the book and removes the ones that lost it', () => {
    expect(planBookGrants(owned, ['kid1', 'kid2'], ['kid2', 'teen'])).toEqual({
      add: ['teen'],
      remove: ['kid1'],
    });
  });

  it("ignores ids that are not the account's profiles", () => {
    expect(planBookGrants(owned, [], ['kid1', 'stranger'])).toEqual({ add: ['kid1'], remove: [] });
  });

  it('does nothing when nothing changed', () => {
    expect(planBookGrants(owned, ['kid1'], ['kid1', 'kid1'])).toEqual({ add: [], remove: [] });
  });
});

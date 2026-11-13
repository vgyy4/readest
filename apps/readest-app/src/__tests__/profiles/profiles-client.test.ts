import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { SystemSettings } from '@/types/settings';
import { getActiveProfileId, isProfileActive, setActiveProfileId } from '@/libs/profiles/active';
import { getSyncCursor, setSyncCursor } from '@/libs/profiles/cursors';
import { getConfigFilename, getLibraryBackupFilename, getLibraryFilename } from '@/utils/book';

const book = { hash: 'abc' } as Book;
const KID = '22222222-2222-2222-2222-222222222222';

afterEach(() => setActiveProfileId(null));

describe('active profile', () => {
  it('defaults to the master and remembers a chosen profile', () => {
    expect(getActiveProfileId()).toBeNull();
    expect(isProfileActive()).toBe(false);
    setActiveProfileId(KID);
    expect(getActiveProfileId()).toBe(KID);
    expect(localStorage.getItem('readest-active-profile')).toBe(KID);
    setActiveProfileId(null);
    expect(localStorage.getItem('readest-active-profile')).toBeNull();
  });
});

describe('profile-aware local files', () => {
  it('keeps the master on the original file names', () => {
    expect(getLibraryFilename()).toBe('library.json');
    expect(getLibraryBackupFilename()).toBe('library_backup.json');
    expect(getConfigFilename(book)).toBe('abc/config.json');
  });

  it("gives a profile its own library and per-book progress files, sharing the book's other files", () => {
    setActiveProfileId(KID);
    expect(getLibraryFilename()).toBe(`library.${KID}.json`);
    expect(getLibraryBackupFilename()).toBe(`library_backup.${KID}.json`);
    expect(getConfigFilename(book)).toBe(`abc/config.${KID}.json`);
  });
});

describe('sync cursors', () => {
  const settings = () =>
    ({ lastSyncedAtBooks: 10, lastSyncedAtConfigs: 20, lastSyncedAtNotes: 30 }) as SystemSettings;

  it("uses the account's own cursors for the master", () => {
    const s = settings();
    expect(getSyncCursor(s, 'books')).toBe(10);
    setSyncCursor(s, 'notes', 99);
    expect(s.lastSyncedAtNotes).toBe(99);
  });

  it('keeps a separate cursor per profile and never touches the master', () => {
    const s = settings();
    setActiveProfileId(KID);
    expect(getSyncCursor(s, 'books')).toBe(0);
    setSyncCursor(s, 'books', 55);
    expect(getSyncCursor(s, 'books')).toBe(55);
    expect(s.lastSyncedAtBooks).toBe(10);
    setActiveProfileId(null);
    expect(getSyncCursor(s, 'books')).toBe(10);
  });
});

describe('profile requests and sync scope', () => {
  it('sends the profile header with authenticated requests only while a profile is active', async () => {
    vi.doMock('@/utils/access', () => ({ getAccessToken: async () => 'tok' }));
    const calls: RequestInit[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    try {
      vi.resetModules();
      const { fetchWithAuth } = await import('@/utils/fetch');
      await fetchWithAuth('/api/x', {});
      setActiveProfileId(KID);
      await fetchWithAuth('/api/x', {});
      const [master, profile] = calls.map((c) => c.headers as Record<string, string>);
      expect(master!['X-Readest-Profile'] ?? master!['x-readest-profile']).toBeUndefined();
      expect(profile!['x-readest-profile']).toBe(KID);
      expect(profile!['Authorization']).toBe('Bearer tok');
    } finally {
      globalThis.fetch = realFetch;
      vi.doUnmock('@/utils/access');
      vi.resetModules();
    }
  });

  it("limits a profile's sync to its own books, progress, notes and stats", async () => {
    const { isSyncCategoryEnabled } = await import('@/services/sync/syncCategories');
    setActiveProfileId(KID);
    expect(isSyncCategoryEnabled('settings')).toBe(false);
    expect(isSyncCategoryEnabled('dictionary')).toBe(false);
    expect(isSyncCategoryEnabled('font')).toBe(false);
    expect(isSyncCategoryEnabled('stats')).not.toBe(false);
  });
});

describe('library sync requests', () => {
  it('carry the profile the device is acting as, so progress stays separate', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response(JSON.stringify({ books: [], configs: [], notes: [] }), { status: 200 });
    }) as typeof fetch;
    vi.resetModules();
    vi.doMock('@/utils/access', () => ({ getAccessToken: async () => 'tok' }));
    try {
      const { SyncClient } = await import('@/libs/sync');
      const client = new SyncClient();
      await client.pullChanges(0, 'books');
      await client.pushChanges({ books: [] });
      setActiveProfileId(KID);
      await client.pullChanges(0, 'configs');
      await client.pushChanges({ configs: [] });
      const [pullMaster, pushMaster, pullKid, pushKid] = calls.map((c) => c.headers);
      for (const h of [pullMaster!, pushMaster!]) {
        expect(h['x-readest-profile']).toBeUndefined();
        expect(h['Authorization']).toBe('Bearer tok');
      }
      for (const h of [pullKid!, pushKid!]) expect(h['x-readest-profile']).toBe(KID);
    } finally {
      globalThis.fetch = realFetch;
      vi.doUnmock('@/utils/access');
      vi.resetModules();
      setActiveProfileId(null);
    }
  });
});

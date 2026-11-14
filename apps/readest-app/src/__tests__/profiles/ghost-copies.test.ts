import { describe, expect, it, vi } from 'vitest';
import {
  maybeRemoveGhostProfileCopies,
  removeGhostProfileCopies,
} from '@/libs/profiles/ghostCopies';

type Row = Record<string, unknown>;

/** A tiny in-memory database with the few operations the cleanup uses. */
const fakeDb = (tables: { books: Row[]; files: Row[]; profiles: Row[] }) => {
  const updates: { values: Row; count: number }[] = [];
  const admin = {
    from: (table: keyof typeof tables) => {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null;
      let max = Infinity;
      const chain: Record<string, unknown> = {};
      const add = (test: (r: Row) => boolean) => {
        filters.push(test);
        return chain;
      };
      chain['select'] = () => chain;
      chain['eq'] = (col: string, v: unknown) => add((r) => r[col] === v);
      chain['in'] = (col: string, vs: unknown[]) => add((r) => vs.includes(r[col]));
      chain['is'] = (col: string, v: unknown) => add((r) => (r[col] ?? null) === v);
      chain['not'] = (col: string, _op: string, v: unknown) => add((r) => (r[col] ?? null) !== v);
      chain['limit'] = (n: number) => {
        max = n;
        return chain;
      };
      chain['update'] = (values: Row) => {
        patch = values;
        return chain;
      };
      chain['then'] = (resolve: (v: unknown) => unknown) => {
        const hit = tables[table].filter((r) => filters.every((f) => f(r))).slice(0, max);
        if (patch) {
          for (const row of hit) Object.assign(row, patch);
          updates.push({ values: patch, count: hit.length });
          return resolve({ data: null, error: null });
        }
        return resolve({ data: hit, error: null });
      };
      return chain;
    },
  };
  return { admin: admin as never, updates };
};

const book = (user: string, hash: string, over: Row = {}): Row => ({
  user_id: user,
  book_hash: hash,
  deleted_at: null,
  progress: null,
  ...over,
});
const removed = '2026-11-14T06:00:00.000Z';
const base = () => ({
  profiles: [
    { owner_id: 'owner', profile_user_id: 'kid1' },
    { owner_id: 'owner', profile_user_id: 'kid2' },
  ],
  files: [] as Row[],
  books: [] as Row[],
});

describe('removeGhostProfileCopies', () => {
  it("removes the profiles' copies of a book the admin removed and the server has no file for", async () => {
    const t = base();
    t.books = [book('owner', 'a', { deleted_at: removed }), book('kid1', 'a'), book('kid2', 'a')];
    const { admin } = fakeDb(t);
    expect(await removeGhostProfileCopies(admin, 'owner', async () => false)).toBe(1);
    expect(t.books.filter((b) => b['user_id'] !== 'owner').every((b) => b['deleted_at'])).toBe(
      true,
    );
  });

  it('keeps the copies while the server still has the file', async () => {
    const t = base();
    t.books = [book('owner', 'a', { deleted_at: removed }), book('kid1', 'a')];
    t.files = [{ user_id: 'owner', book_hash: 'a', file_key: 'owner/Readest/Books/a/a.epub' }];
    const { admin } = fakeDb(t);
    expect(await removeGhostProfileCopies(admin, 'owner', async () => true)).toBe(0);
    expect(t.books[1]!['deleted_at']).toBeNull();
  });

  it('removes them when a file record exists but the file itself is gone', async () => {
    const t = base();
    t.books = [book('owner', 'a', { deleted_at: removed }), book('kid1', 'a')];
    t.files = [{ user_id: 'owner', book_hash: 'a', file_key: 'owner/Readest/Books/a/a.epub' }];
    const { admin } = fakeDb(t);
    expect(await removeGhostProfileCopies(admin, 'owner', async () => false)).toBe(1);
  });

  it('does not count a cover as the book', async () => {
    const t = base();
    t.books = [book('owner', 'a', { deleted_at: removed }), book('kid1', 'a')];
    t.files = [{ user_id: 'owner', book_hash: 'a', file_key: 'owner/Readest/Books/a/cover.png' }];
    const { admin } = fakeDb(t);
    expect(await removeGhostProfileCopies(admin, 'owner', async () => true)).toBe(1);
  });

  it('never touches a book the admin still has', async () => {
    const t = base();
    t.books = [book('owner', 'a'), book('kid1', 'a')];
    const { admin } = fakeDb(t);
    expect(await removeGhostProfileCopies(admin, 'owner', async () => false)).toBe(0);
    expect(t.books[1]!['deleted_at']).toBeNull();
  });

  it('never touches a copy someone has read: that reading belongs to the profile', async () => {
    const t = base();
    t.books = [
      book('owner', 'a', { deleted_at: removed }),
      book('kid1', 'a', { progress: [10, 200] }),
      book('kid2', 'a'),
    ];
    const { admin } = fakeDb(t);
    await removeGhostProfileCopies(admin, 'owner', async () => false);
    expect(t.books[1]!['deleted_at']).toBeNull(); // kid1 has read it
    expect(t.books[2]!['deleted_at']).toBeTruthy(); // kid2 has not
  });

  it('only touches the profiles of this account', async () => {
    const t = base();
    t.books = [book('owner', 'a', { deleted_at: removed }), book('stranger-profile', 'a')];
    const { admin } = fakeDb(t);
    await removeGhostProfileCopies(admin, 'owner', async () => false);
    expect(t.books[1]!['deleted_at']).toBeNull();
  });

  it('does nothing for an account without profiles', async () => {
    const t = base();
    t.profiles = [];
    t.books = [book('owner', 'a', { deleted_at: removed })];
    const { admin, updates } = fakeDb(t);
    expect(await removeGhostProfileCopies(admin, 'owner', async () => false)).toBe(0);
    expect(updates).toHaveLength(0);
  });
});

describe('maybeRemoveGhostProfileCopies', () => {
  it('looks at most once in a few minutes per account, so syncing stays cheap', async () => {
    const t = base();
    t.books = [book('owner', 'a', { deleted_at: removed }), book('kid1', 'a')];
    const { admin } = fakeDb(t);
    const exists = vi.fn(async () => false);
    let now = 1_000_000;
    await maybeRemoveGhostProfileCopies(admin, 'owner-throttle', exists, () => now);
    const asked = vi.fn();
    const { admin: second } = fakeDb({ ...base(), books: [] });
    const spy = vi
      .spyOn(second as unknown as { from: (t: string) => unknown }, 'from')
      .mockImplementation((table: string) => {
        asked(table);
        throw new Error('should not be asked');
      });
    now += 60_000; // one minute later
    await maybeRemoveGhostProfileCopies(second, 'owner-throttle', exists, () => now);
    expect(asked).not.toHaveBeenCalled();
    now += 10 * 60_000; // ten minutes later it looks again
    await maybeRemoveGhostProfileCopies(second, 'owner-throttle', exists, () => now).catch(
      () => {},
    );
    expect(asked).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('never throws: a failed cleanup must not fail the sync it rides on', async () => {
    const admin = {
      from: () => {
        throw new Error('database down');
      },
    } as never;
    await expect(
      maybeRemoveGhostProfileCopies(
        admin,
        'owner-x',
        async () => false,
        () => 5e9,
      ),
    ).resolves.toBe(0);
  });
});

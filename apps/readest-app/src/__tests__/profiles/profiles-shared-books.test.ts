import { describe, expect, it } from 'vitest';
import { getBooksInUseByProfiles } from '@/libs/profiles/api';

const OWNER = 'owner';

// Just enough of the Supabase query builder for the two reads the helper makes:
// a real promise of the rows so far, with chainable filters.
type Rows = Record<string, unknown>[];
interface Query extends Promise<{ data: Rows; error: null }> {
  select: () => Query;
  eq: (col: string, val: unknown) => Query;
  in: (col: string, vals: unknown[]) => Query;
  is: (col: string, val: unknown) => Query;
}
const query = (rows: Rows): Query =>
  Object.assign(Promise.resolve({ data: rows, error: null }), {
    select: () => query(rows),
    eq: (col: string, val: unknown) => query(rows.filter((r) => r[col] === val)),
    in: (col: string, vals: unknown[]) => query(rows.filter((r) => vals.includes(r[col]))),
    is: (col: string, val: unknown) => query(rows.filter((r) => (r[col] ?? null) === val)),
  });

const fakeAdmin = (tables: Record<string, Rows>) =>
  ({ from: (table: string) => query(tables[table] ?? []) }) as unknown as Parameters<
    typeof getBooksInUseByProfiles
  >[0];

describe('getBooksInUseByProfiles', () => {
  const admin = fakeAdmin({
    profiles: [
      { profile_user_id: 'kid1', owner_id: OWNER },
      { profile_user_id: 'kid2', owner_id: OWNER },
      { profile_user_id: 'other-kid', owner_id: 'someone-else' },
    ],
    books: [
      { user_id: 'kid1', book_hash: 'a', deleted_at: null },
      { user_id: 'kid2', book_hash: 'a', deleted_at: null },
      { user_id: 'kid2', book_hash: 'b', deleted_at: '2026-01-01' },
      { user_id: 'other-kid', book_hash: 'c', deleted_at: null },
      { user_id: OWNER, book_hash: 'd', deleted_at: null },
    ],
  });

  it('reports a book a profile of this account can still see, once however many profiles share it', async () => {
    expect([...(await getBooksInUseByProfiles(admin, OWNER, ['a', 'b', 'c', 'd', 'e']))]).toEqual([
      'a',
    ]);
  });

  it('finds nothing when the account has no profiles', async () => {
    const none = fakeAdmin({ profiles: [], books: [] });
    expect((await getBooksInUseByProfiles(none, OWNER, ['a'])).size).toBe(0);
  });
});

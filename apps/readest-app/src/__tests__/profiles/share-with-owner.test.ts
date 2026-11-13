import { describe, expect, it } from 'vitest';
import { shareNewBooksWithOwner } from '@/libs/profiles/shareWithOwner';

type Row = Record<string, unknown>;

/** A tiny in-memory `books` table that understands the query chain the helper uses. */
const fakeAdmin = (initial: Row[]) => {
  const rows = [...initial];
  const upserts: Row[][] = [];
  const admin = {
    from: (table: string) => {
      if (table !== 'books') throw new Error(`unexpected table ${table}`);
      const filters: ((r: Row) => boolean)[] = [];
      const builder: Record<string, unknown> = {};
      builder['select'] = () => builder;
      const add = (test: (r: Row) => boolean) => {
        filters.push(test);
        return builder;
      };
      builder['eq'] = (col: string, v: unknown) => add((r) => r[col] === v);
      builder['in'] = (col: string, vs: unknown[]) => add((r) => vs.includes(r[col]));
      builder['is'] = (col: string, v: unknown) => add((r) => (r[col] ?? null) === v);
      builder['then'] = (resolve: (v: unknown) => unknown) =>
        resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
      builder['upsert'] = async (batch: Row[]) => {
        upserts.push(batch);
        rows.push(...batch);
        return { error: null };
      };
      return builder;
    },
  };
  return { admin: admin as never, rows, upserts };
};

const book = (user: string, hash: string, extra: Row = {}): Row => ({
  user_id: user,
  book_hash: hash,
  title: `Title ${hash}`,
  progress: [3, 10],
  reading_status: 'reading',
  deleted_at: null,
  updated_at: '2020-01-01T00:00:00.000Z',
  ...extra,
});

describe('shareNewBooksWithOwner', () => {
  it("gives the owner a copy of a book a profile added, without the profile's reading state", async () => {
    const { admin, rows } = fakeAdmin([book('kid', 'h1')]);
    const added = await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    expect(added).toBe(1);
    const copy = rows.find((r) => r['user_id'] === 'owner');
    expect(copy).toMatchObject({
      book_hash: 'h1',
      title: 'Title h1',
      progress: null,
      deleted_at: null,
    });
    expect(copy?.['reading_status']).toBeNull();
  });

  it("stamps the copy as new so the admin's next library sync picks it up", async () => {
    const { admin, rows } = fakeAdmin([book('kid', 'h1')]);
    await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    const copy = rows.find((r) => r['user_id'] === 'owner')!;
    expect(new Date(copy['updated_at'] as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("leaves the profile's own row alone", async () => {
    const { admin, rows } = fakeAdmin([book('kid', 'h1')]);
    await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    expect(rows.find((r) => r['user_id'] === 'kid')).toMatchObject({ progress: [3, 10] });
  });

  it('does nothing for a book the owner already has, even one the owner removed', async () => {
    const { admin, upserts } = fakeAdmin([
      book('kid', 'h1'),
      book('owner', 'h1', { deleted_at: '2021-01-01T00:00:00.000Z' }),
    ]);
    expect(await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1'])).toBe(0);
    expect(upserts).toHaveLength(0);
  });

  it('ignores books the profile has removed or that it does not have', async () => {
    const { admin, upserts } = fakeAdmin([
      book('kid', 'h1', { deleted_at: '2021-01-01T00:00:00.000Z' }),
    ]);
    expect(await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1', 'nope'])).toBe(0);
    expect(upserts).toHaveLength(0);
  });

  it('copies only the new ones out of a mixed batch', async () => {
    const { admin, rows } = fakeAdmin([book('kid', 'h1'), book('kid', 'h2'), book('owner', 'h1')]);
    expect(await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1', 'h2'])).toBe(1);
    expect(rows.filter((r) => r['user_id'] === 'owner').map((r) => r['book_hash'])).toEqual([
      'h1',
      'h2',
    ]);
  });

  it('is a no-op for an empty list', async () => {
    const { admin, upserts } = fakeAdmin([]);
    expect(await shareNewBooksWithOwner(admin, 'owner', 'kid', [])).toBe(0);
    expect(upserts).toHaveLength(0);
  });
});

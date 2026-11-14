import { describe, expect, it } from 'vitest';
import { shareNewBooksWithOwner } from '@/libs/profiles/shareWithOwner';

type Row = Record<string, unknown>;

/** A tiny in-memory `books` table that understands the query chain the helper uses. */
const fakeAdmin = (initial: Row[]) => {
  const rows = [...initial];
  const upserts: Row[][] = [];
  const updates: { values: Row; count: number }[] = [];
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
      let pending: Row | null = null;
      builder['update'] = (values: Row) => {
        pending = values;
        return builder;
      };
      builder['then'] = (resolve: (v: unknown) => unknown) => {
        const matching = rows.filter((r) => filters.every((f) => f(r)));
        if (pending) {
          updates.push({ values: pending, count: matching.length });
          for (const row of matching) Object.assign(row, pending);
          return resolve({ data: null, error: null });
        }
        return resolve({ data: matching, error: null });
      };
      builder['upsert'] = async (batch: Row[]) => {
        upserts.push(batch);
        rows.push(...batch);
        return { error: null };
      };
      return builder;
    },
  };
  return { admin: admin as never, rows, upserts, updates };
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

describe('shareNewBooksWithOwner: the file arriving after the book', () => {
  const later = '2022-02-02T00:00:00.000Z';

  it("tells the admin's copy once the profile's upload has finished, so the admin can download it", async () => {
    const { admin, rows } = fakeAdmin([
      book('kid', 'h1', { uploaded_at: later }),
      book('owner', 'h1', { uploaded_at: null }),
    ]);
    await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    const owner = rows.find((r) => r['user_id'] === 'owner')!;
    expect(owner['uploaded_at']).toBe(later);
    expect(new Date(owner['updated_at'] as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('copies the upload mark along with a new book that is already uploaded', async () => {
    const { admin, rows } = fakeAdmin([book('kid', 'h1', { uploaded_at: later })]);
    await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    expect(rows.find((r) => r['user_id'] === 'owner')?.['uploaded_at']).toBe(later);
  });

  it("leaves an upload mark the admin's copy already has", async () => {
    const earlier = '2021-01-01T00:00:00.000Z';
    const { admin, rows, updates } = fakeAdmin([
      book('kid', 'h1', { uploaded_at: later }),
      book('owner', 'h1', { uploaded_at: earlier }),
    ]);
    await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    expect(updates).toHaveLength(0);
    expect(rows.find((r) => r['user_id'] === 'owner')?.['uploaded_at']).toBe(earlier);
  });

  it('does nothing while the profile has not uploaded yet', async () => {
    const { admin, updates } = fakeAdmin([
      book('kid', 'h1', { uploaded_at: null }),
      book('owner', 'h1', { uploaded_at: null }),
    ]);
    await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    expect(updates).toHaveLength(0);
  });

  it('does not touch a copy the admin removed', async () => {
    const { admin, updates } = fakeAdmin([
      book('kid', 'h1', { uploaded_at: later }),
      book('owner', 'h1', { uploaded_at: null, deleted_at: '2021-01-01T00:00:00.000Z' }),
    ]);
    await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    expect(updates).toHaveLength(0);
  });
});

describe('a profile deleting a book', () => {
  it("never touches the admin's copy: the admin keeps the book", async () => {
    const { admin, rows, updates, upserts } = fakeAdmin([
      book('kid', 'h1', { deleted_at: '2026-11-14T00:00:00.000Z', uploaded_at: 5 }),
      book('owner', 'h1', { uploaded_at: null }),
    ]);
    await shareNewBooksWithOwner(admin, 'owner', 'kid', ['h1']);
    const owner = rows.find((r) => r['user_id'] === 'owner')!;
    expect(owner['deleted_at']).toBeNull();
    expect(owner['uploaded_at']).toBeNull(); // not even the profile's mark is passed on
    expect(updates).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });
});

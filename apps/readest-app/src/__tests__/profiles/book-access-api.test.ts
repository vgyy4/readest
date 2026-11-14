import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({ master: vi.fn() }));
vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/libs/profiles/api', () => ({
  MAX_PROFILES: 8,
  requireMaster: (...a: unknown[]) => mocks.master(...a),
}));

import handler from '@/pages/api/profiles/book-access';

type Row = Record<string, unknown>;

const admin = (profiles: string[], books: Row[]) => ({
  from: (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    const chain: Record<string, unknown> = {};
    const add = (test: (r: Row) => boolean) => {
      filters.push(test);
      return chain;
    };
    chain['select'] = () => chain;
    chain['eq'] = (col: string, v: unknown) => add((r) => r[col] === v);
    chain['in'] = (col: string, vs: unknown[]) => add((r) => vs.includes(r[col]));
    chain['is'] = (col: string, v: unknown) => add((r) => (r[col] ?? null) === v);
    chain['then'] = (resolve: (v: unknown) => unknown) => {
      const rows =
        table === 'profiles'
          ? profiles.map((id) => ({ profile_user_id: id, owner_id: 'owner' }))
          : books.filter((r) => filters.every((f) => f(r)));
      return resolve({ data: rows, error: null });
    };
    return chain;
  },
});

const get = async (bookHash: string) => {
  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status(c: number) {
      status = c;
      return this;
    },
    json(v: Record<string, unknown>) {
      body = v;
      return this;
    },
  } as unknown as NextApiResponse;
  await handler(
    { method: 'GET', headers: {}, query: { bookHash } } as unknown as NextApiRequest,
    res,
  );
  return { status, body };
};

beforeEach(() => mocks.master.mockReset());

describe('GET /api/profiles/book-access', () => {
  it('tells the admin who has the book and who removed it, so a profile deleting a book is visible', async () => {
    mocks.master.mockResolvedValue({
      ownerId: 'owner',
      admin: admin(
        ['kid', 'teen', 'baby'],
        [
          { user_id: 'kid', book_hash: 'h', deleted_at: null },
          { user_id: 'teen', book_hash: 'h', deleted_at: '2026-11-14T00:00:00Z' },
          // 'baby' never had it: no row at all
          { user_id: 'stranger', book_hash: 'h', deleted_at: '2026-11-14T00:00:00Z' },
        ],
      ),
    });
    const { status, body } = await get('h');
    expect(status).toBe(200);
    expect(body['profileIds']).toEqual(['kid']);
    expect(body['removedProfileIds']).toEqual(['teen']);
  });

  it('does not list a profile as removed when it has the book again', async () => {
    mocks.master.mockResolvedValue({
      ownerId: 'owner',
      admin: admin(['kid'], [{ user_id: 'kid', book_hash: 'h', deleted_at: null }]),
    });
    const { body } = await get('h');
    expect(body['profileIds']).toEqual(['kid']);
    expect(body['removedProfileIds']).toEqual([]);
  });
});

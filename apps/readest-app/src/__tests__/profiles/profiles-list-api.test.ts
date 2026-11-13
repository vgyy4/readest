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

import handler, { isMissingSchema } from '@/pages/api/profiles/index';

type Answer = { data: unknown; error: { code?: string; message?: string } | null };

/** A Supabase stub: each table answers from `tables`, and `profiles` may answer differently per column list. */
const adminWith = (tables: Record<string, (columns: string) => Answer>) => ({
  from: (table: string) => {
    let columns = '';
    const builder: Record<string, unknown> = {};
    builder['select'] = (c: string) => {
      columns = c;
      return builder;
    };
    for (const m of ['eq', 'order', 'in']) builder[m] = () => builder;
    builder['maybeSingle'] = async () => tables[table]!(columns);
    builder['then'] = (resolve: (v: Answer) => unknown) => resolve(tables[table]!(columns));
    return builder;
  },
});

const get = async () => {
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
  await handler({ method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest, res);
  return { status, body };
};

beforeEach(() => mocks.master.mockReset());

describe('GET /api/profiles', () => {
  it('lists the profiles with their pictures', async () => {
    mocks.master.mockResolvedValue({
      ownerId: 'owner',
      admin: adminWith({
        profiles: () => ({
          data: [{ profile_user_id: 'k1', name: 'Noa', avatar: 'av-03', created_at: 't' }],
          error: null,
        }),
        profile_pins: () => ({ data: null, error: null }),
        profile_main_meta: () => ({ data: { avatar: 'av-10' }, error: null }),
        profile_user_pins: () => ({ data: [], error: null }),
      }),
    });
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body['mainAvatar']).toBe('av-10');
    expect(body['needsMigration']).toBeUndefined();
    expect((body['profiles'] as { avatar: string }[])[0]!.avatar).toBe('av-03');
  });

  it('still lists the profiles, with no pictures, before the pictures update is applied', async () => {
    mocks.master.mockResolvedValue({
      ownerId: 'owner',
      admin: adminWith({
        profiles: (columns) =>
          columns.includes('avatar')
            ? {
                data: null,
                error: { code: '42703', message: 'column profiles.avatar does not exist' },
              }
            : { data: [{ profile_user_id: 'k1', name: 'Noa', created_at: 't' }], error: null },
        profile_pins: () => ({ data: { owner_id: 'owner' }, error: null }),
        // The new table is missing too: that answer is ignored.
        profile_main_meta: () => ({
          data: null,
          error: { code: '42P01', message: 'relation does not exist' },
        }),
        profile_user_pins: () => ({ data: [], error: null }),
      }),
    });
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body['needsMigration']).toBe(true);
    expect(body['hasPin']).toBe(true);
    expect(body['profiles']).toEqual([
      { id: 'k1', name: 'Noa', avatar: null, createdAt: 't', hasPin: false },
    ]);
  });

  it('still fails on an error that is not about the missing update', async () => {
    mocks.master.mockResolvedValue({
      ownerId: 'owner',
      admin: adminWith({
        profiles: () => ({
          data: null,
          error: { code: '57P01', message: 'terminating connection' },
        }),
        profile_pins: () => ({ data: null, error: null }),
        profile_main_meta: () => ({ data: null, error: null }),
        profile_user_pins: () => ({ data: [], error: null }),
      }),
    });
    expect((await get()).status).toBe(500);
  });
});

describe('isMissingSchema', () => {
  it('recognises a missing column or table, and nothing else', () => {
    expect(isMissingSchema({ code: '42703' })).toBe(true);
    expect(isMissingSchema({ code: 'PGRST204', message: 'x' })).toBe(true);
    expect(isMissingSchema({ message: 'Could not find the avatar column' })).toBe(true);
    expect(isMissingSchema({ code: '57P01', message: 'connection lost' })).toBe(false);
  });
});

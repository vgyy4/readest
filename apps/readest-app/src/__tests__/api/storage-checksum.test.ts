import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// The server records the SHA-256 of a file when the upload starts, reads the stored copy back when
// it is done, and tells downloaders what the file should be.

const hash = 'a'.repeat(32);
const GOOD = 'c'.repeat(64);
const BAD = 'd'.repeat(64);

const db = vi.hoisted(() => ({
  record: null as null | {
    file_size: number;
    sha256: string | null;
    sha256_checked_at: string | null;
  },
  selectError: null as null | { message: string },
  updates: [] as Record<string, unknown>[],
}));
const stored = vi.hoisted(() => ({
  result: null as null | { sha256: string; size: number },
  throws: null as unknown,
}));

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: vi.fn().mockResolvedValue({
    user: { id: 'user-1' },
    token: 'tok',
    ownerId: undefined,
    isProfile: false,
  }),
}));
vi.mock('@/utils/object', async (orig) => {
  const actual = await orig<typeof import('@/utils/object')>();
  return {
    ...actual,
    sha256OfObject: async () => {
      if (stored.throws) throw stored.throws;
      return stored.result;
    },
  };
});
vi.mock('@/utils/supabase', () => {
  const builder: Record<string, unknown> = {};
  builder['select'] = () => builder;
  builder['eq'] = () => builder;
  builder['limit'] = () => builder;
  builder['maybeSingle'] = async () => ({ data: db.record, error: db.selectError });
  builder['update'] = (row: Record<string, unknown>) => {
    db.updates.push(row);
    return builder;
  };
  builder['then'] = (resolve: (v: unknown) => void) => resolve({ error: null });
  return { createSupabaseAdminClient: () => ({ from: () => builder }) };
});

import handler from '@/pages/api/storage/checksum';
import { forgetAllChecks } from '@/libs/storageChecksum';

const ask = async (body: Record<string, unknown> = {}) => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: { fileName: `Readest/Books/${hash}/${hash}.m4b`, ...body },
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  await handler(req, res);
  const [status] = vi.mocked(res.status).mock.calls[0]!;
  return { status, body: vi.mocked(res.json).mock.calls[0]![0] };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  forgetAllChecks();
  db.record = { file_size: 1000, sha256: GOOD, sha256_checked_at: null };
  db.selectError = null;
  db.updates.length = 0;
  stored.result = { sha256: GOOD, size: 1000 };
  stored.throws = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/storage/checksum', () => {
  it('starts reading the stored file back, and says verified once it matches, recording that', async () => {
    expect((await ask()).body).toEqual({ status: 'running' });
    await settle();
    expect((await ask()).body).toEqual({ status: 'verified' });
    expect(db.updates).toEqual([{ sha256: GOOD, sha256_checked_at: expect.any(String) }]);
  });

  it('says so when the stored copy is not the file that was sent', async () => {
    stored.result = { sha256: BAD, size: 1000 };
    await ask();
    await settle();
    expect((await ask()).body).toEqual({ status: 'mismatch', expected: GOOD, actual: BAD });
    expect(db.updates).toEqual([]);
  });

  it('says so when the size differs', async () => {
    stored.result = { sha256: GOOD, size: 999 };
    await ask();
    await settle();
    expect((await ask()).body).toMatchObject({
      status: 'size-mismatch',
      expected: 1000,
      actual: 999,
    });
  });

  it('answers at once for a file that was checked already', async () => {
    db.record = { file_size: 1000, sha256: GOOD, sha256_checked_at: '2026-11-16T10:00:00Z' };
    expect((await ask()).body).toEqual({ status: 'verified' });
  });

  it('has nothing to check against for a file recorded without a SHA-256, unless the app sends one', async () => {
    db.record = { file_size: 1000, sha256: null, sha256_checked_at: null };
    expect((await ask()).body).toEqual({ status: 'unsupported' });
    expect((await ask({ sha256: GOOD })).body).toEqual({ status: 'running' });
  });

  it('is not an error for a database that has no such column yet, or a file with no record', async () => {
    db.selectError = { message: 'column files.sha256 does not exist' };
    expect((await ask()).body).toEqual({ status: 'unsupported' });
    db.selectError = null;
    db.record = null;
    expect((await ask()).body).toEqual({ status: 'missing' });
  });

  it('reports storage that cannot be read back (R2) as unsupported, and a failed read as an error', async () => {
    stored.result = null;
    await ask();
    await settle();
    expect((await ask()).body).toEqual({ status: 'unsupported' });
    forgetAllChecks();
    stored.throws = new Error('connection reset');
    await ask();
    await settle();
    expect((await ask()).body).toMatchObject({ status: 'error', message: 'connection reset' });
  });

  it("refuses a name that could leave the user's own folder", async () => {
    expect((await ask({ fileName: 'Readest/../other/x' })).status).toBe(400);
  });
});

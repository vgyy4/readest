import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// An upload records the SHA-256 it was started with (so the stored copy and later downloads can be
// checked against it); a download says what the file should be.

const hash = 'a'.repeat(32);
const SHA = 'e'.repeat(64);

const updates = vi.hoisted(() => [] as Record<string, unknown>[]);
const fileRows = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

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
  getStoragePlanData: vi.fn().mockReturnValue({ usage: 0, quota: 10 ** 12 }),
  STORAGE_QUOTA_GRACE_BYTES: 0,
}));
vi.mock('@/utils/object', async (orig) => {
  const actual = await orig<typeof import('@/utils/object')>();
  return {
    ...actual,
    getUploadSignedUrl: async () => 'https://store/upload',
    getDownloadSignedUrl: async (key: string) => `https://store/${key}`,
  };
});
vi.mock('@/utils/supabase', () => {
  const builder: Record<string, unknown> = {};
  builder['select'] = () => builder;
  builder['eq'] = () => builder;
  builder['in'] = () => builder;
  builder['is'] = () => builder;
  builder['limit'] = () => builder;
  builder['insert'] = () => builder;
  builder['single'] = async () => ({ data: { file_size: 10 }, error: null });
  builder['update'] = (row: Record<string, unknown>) => {
    updates.push(row);
    return builder;
  };
  builder['then'] = (resolve: (v: unknown) => void) =>
    resolve({ data: fileRows.rows, error: null });
  return { createSupabaseAdminClient: () => ({ from: () => builder }) };
});

import upload from '@/pages/api/storage/upload';
import download from '@/pages/api/storage/download';

const send = async (
  handler: (req: NextApiRequest, res: NextApiResponse) => unknown,
  req: object,
) => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  await handler(
    { headers: { authorization: 'Bearer t' }, ...req } as unknown as NextApiRequest,
    res,
  );
  return {
    status: vi.mocked(res.status).mock.calls[0]![0],
    body: vi.mocked(res.json).mock.calls[0]![0],
  };
};

beforeEach(() => {
  updates.length = 0;
  fileRows.rows = [];
});

describe('uploads record the SHA-256 they were started with', () => {
  const body = (extra: Record<string, unknown>) => ({
    method: 'POST',
    body: { fileName: `Readest/Books/${hash}/cover.png`, fileSize: 10, bookHash: hash, ...extra },
  });

  it('stores it, and clears the mark that it was checked', async () => {
    const answer = await send(upload, body({ sha256: SHA.toUpperCase() }));
    expect(answer.status).toBe(200);
    expect(updates).toContainEqual({ sha256: SHA, sha256_checked_at: null });
  });

  it('ignores a value that is not a SHA-256', async () => {
    const answer = await send(upload, body({ sha256: 'not-a-hash' }));
    expect(answer.status).toBe(200);
    expect(updates).toEqual([]);
  });

  it('an app that sends none still uploads, as before', async () => {
    expect((await send(upload, body({}))).status).toBe(200);
    expect(updates).toEqual([]);
  });
});

describe('downloads say what the file should be', () => {
  const key = `user-1/Readest/Books/${hash}/${hash}.m4b`;

  it('with the address, for one file', async () => {
    fileRows.rows = [
      { user_id: 'user-1', file_key: key, book_hash: hash, replica_kind: null, sha256: SHA },
    ];
    const answer = await send(download, {
      method: 'GET',
      query: { fileKey: key },
      url: `/api/storage/download?fileKey=${key}`,
    });
    expect(answer.body).toMatchObject({ downloadUrl: expect.stringContaining(key), sha256: SHA });
  });

  it('for many, by file key; none for a file without one', async () => {
    fileRows.rows = [
      { user_id: 'user-1', file_key: key, book_hash: hash, replica_kind: null, sha256: SHA },
    ];
    const other = `user-1/Readest/Books/${hash}/cover.png`;
    const answer = await send(download, { method: 'POST', body: { fileKeys: [key, other] } });
    expect(answer.body.sha256s[key]).toBe(SHA);
    expect(answer.body.sha256s[other]).toBeUndefined();
  });
});

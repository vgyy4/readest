import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const validateUserAndTokenMock = vi.fn();
const createMultipartUploadMock = vi.fn();
const inserted: Record<string, unknown>[] = [];

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...a: unknown[]) => validateUserAndTokenMock(...a),
  getStoragePlanData: vi.fn().mockReturnValue({ usage: 0, quota: 10 ** 12 }),
  STORAGE_QUOTA_GRACE_BYTES: 0,
}));
vi.mock('@/utils/object', async (orig) => {
  const actual = await orig<typeof import('@/utils/object')>();
  return {
    ...actual,
    supportsMultipart: () => true,
    createMultipartUpload: (...a: unknown[]) => createMultipartUploadMock(...a),
    getUploadPartSignedUrl: vi.fn().mockResolvedValue('https://store/part'),
  };
});
vi.mock('@/utils/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'limit']) builder[m] = () => builder;
  builder['maybeSingle'] = async () => ({ data: null, error: null });
  builder['insert'] = async (rows: Record<string, unknown>[]) => {
    inserted.push(...rows);
    return { error: null };
  };
  return { createSupabaseAdminClient: () => ({ from: () => builder }) };
});

import handler from '@/pages/api/storage/multipart';

const hash = 'e'.repeat(32);
const call = async (body: Record<string, unknown>) => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body,
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  await handler(req, res);
  return res;
};

beforeEach(() => {
  inserted.length = 0;
  createMultipartUploadMock.mockReset().mockResolvedValue('upload-1');
  validateUserAndTokenMock.mockReset().mockResolvedValue({
    user: { id: 'kid-user' },
    token: 'tok',
    ownerId: 'owner-user',
    isProfile: true,
  });
});

describe('POST /api/storage/multipart by a profile', () => {
  it("uploads a big audiobook into the account's storage, even without a bookHash field", async () => {
    const res = await call({
      action: 'start',
      fileName: `Readest/Books/${hash}/${hash}.m4b`,
      fileSize: 300 * 1024 * 1024,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(createMultipartUploadMock).toHaveBeenCalledWith(
      `owner-user/Readest/Books/${hash}/${hash}.m4b`,
    );
    expect(inserted[0]).toMatchObject({ user_id: 'owner-user' });
  });

  it("refuses a file that is not one of a book's", async () => {
    const res = await call({ action: 'start', fileName: 'Readest/Settings/x.bin', fileSize: 1000 });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(createMultipartUploadMock).not.toHaveBeenCalled();
  });
});

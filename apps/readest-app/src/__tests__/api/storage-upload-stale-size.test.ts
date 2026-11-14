import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// S3 signs an upload with the exact length of the file. When an earlier attempt (an app that was
// deleted mid-upload, a cover extracted again after a reinstall) left a record with a different
// size, signing with the recorded size makes storage refuse the new file with 403
// SignatureDoesNotMatch, every time. The upload is signed for the file being sent now.

const getUploadSignedUrlMock = vi.fn();
const updated: Record<string, unknown>[] = [];
const single = vi.fn();

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
  return { ...actual, getUploadSignedUrl: (...a: unknown[]) => getUploadSignedUrlMock(...a) };
});
vi.mock('@/utils/supabase', () => {
  const builder: Record<string, unknown> = {};
  builder['select'] = () => builder;
  builder['eq'] = () => builder;
  builder['limit'] = () => builder;
  builder['insert'] = () => builder;
  builder['update'] = (row: Record<string, unknown>) => {
    updated.push(row);
    return builder;
  };
  builder['single'] = (...a: unknown[]) => single(...a);
  // `await builder` (an update with no .single()) resolves like a Supabase response.
  builder['then'] = (resolve: (v: unknown) => void) => resolve({ error: null });
  return { createSupabaseAdminClient: () => ({ from: () => builder }) };
});

import handler from '@/pages/api/storage/upload';

const hash = 'a'.repeat(32);
const call = async (fileSize: number) => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: { fileName: `Readest/Books/${hash}/cover.png`, fileSize, bookHash: hash },
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  await handler(req, res);
  return res;
};

beforeEach(() => {
  updated.length = 0;
  getUploadSignedUrlMock.mockReset().mockResolvedValue('https://store/upload');
  single.mockReset().mockResolvedValue({ data: { file_size: 1000 }, error: null });
});

describe('POST /api/storage/upload when an earlier attempt recorded another size', () => {
  it('signs the size of the file being sent, and corrects the record', async () => {
    const res = await call(5000);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(getUploadSignedUrlMock).toHaveBeenCalledWith(
      expect.stringContaining(`${hash}/cover.png`),
      5000,
      expect.anything(),
    );
    expect(updated).toEqual([{ file_size: 5000 }]);
  });

  it('leaves the record alone when the size is the same', async () => {
    const res = await call(1000);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(getUploadSignedUrlMock).toHaveBeenCalledWith(expect.anything(), 1000, expect.anything());
    expect(updated).toEqual([]);
  });
});

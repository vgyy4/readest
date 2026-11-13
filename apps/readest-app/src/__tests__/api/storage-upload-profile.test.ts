import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// A profile has no storage of its own: what it uploads goes to the account's, so the admin has
// it too, and only the files of a book may be written that way.

const validateUserAndTokenMock = vi.fn();
const getUploadSignedUrlMock = vi.fn();
const inserted: Record<string, unknown>[] = [];
const lookedUpUsers: unknown[] = [];

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
  return { ...actual, getUploadSignedUrl: (...a: unknown[]) => getUploadSignedUrlMock(...a) };
});
const single = vi.fn();
vi.mock('@/utils/supabase', () => {
  const builder: Record<string, unknown> = {};
  builder['select'] = () => builder;
  builder['eq'] = (col: string, value: unknown) => {
    if (col === 'user_id') lookedUpUsers.push(value);
    return builder;
  };
  builder['limit'] = () => builder;
  builder['insert'] = (rows: Record<string, unknown>[]) => {
    inserted.push(...rows);
    return builder;
  };
  builder['single'] = (...a: unknown[]) => single(...a);
  return { createSupabaseAdminClient: () => ({ from: () => builder }) };
});

import handler from '@/pages/api/storage/upload';

const hash = 'c'.repeat(32);
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
  lookedUpUsers.length = 0;
  getUploadSignedUrlMock.mockReset().mockResolvedValue('https://store/upload');
  single
    .mockReset()
    .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    .mockResolvedValueOnce({ data: { file_size: 1000 }, error: null });
  validateUserAndTokenMock.mockReset().mockResolvedValue({
    user: { id: 'kid-user' },
    token: 'tok',
    ownerId: 'owner-user',
    isProfile: true,
  });
});

describe('POST /api/storage/upload by a profile', () => {
  it("stores a book file in the account's storage, under the account owner", async () => {
    const res = await call({
      fileName: `Readest/Books/${hash}/${hash}.m4b`,
      fileSize: 1000,
      bookHash: hash,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(getUploadSignedUrlMock).toHaveBeenCalledWith(
      `owner-user/Readest/Books/${hash}/${hash}.m4b`,
      expect.anything(),
      expect.anything(),
    );
    expect(inserted[0]).toMatchObject({ user_id: 'owner-user', book_hash: hash });
    expect(lookedUpUsers).not.toContain('kid-user');
  });

  it.each([
    [
      "another book's folder",
      { fileName: `Readest/Books/${'d'.repeat(32)}/x.epub`, bookHash: hash },
    ],
    ['somewhere else in the storage', { fileName: 'Readest/Settings/x.json', bookHash: hash }],
    ['no book hash', { fileName: `Readest/Books/${hash}/x.epub` }],
    ['a temp image', { fileName: 'x.png', bookHash: hash, temp: true }],
    ['public media', { fileName: 'x.png', bookHash: hash, media: 'book_covers' }],
  ])('refuses %s', async (_label, extra) => {
    const res = await call({ fileSize: 1000, ...extra });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getUploadSignedUrlMock).not.toHaveBeenCalled();
  });

  it("still stores the account owner's own uploads under their own id", async () => {
    validateUserAndTokenMock.mockResolvedValue({
      user: { id: 'owner-user' },
      token: 'tok',
      ownerId: 'owner-user',
      isProfile: false,
    });
    const res = await call({
      fileName: `Readest/Books/${hash}/${hash}.epub`,
      fileSize: 1000,
      bookHash: hash,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(inserted[0]).toMatchObject({ user_id: 'owner-user' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { PART_SIZE } from '@/libs/multipart';

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  admin: vi.fn(),
  supports: vi.fn(),
  create: vi.fn(),
  partUrl: vi.fn(),
  list: vi.fn(),
  complete: vi.fn(),
  abort: vi.fn(),
  exists: vi.fn(),
}));

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...a: unknown[]) => mocks.validate(...a),
  getStoragePlanData: () => ({ usage: 0, quota: 10 ** 12 }),
  STORAGE_QUOTA_GRACE_BYTES: 0,
}));
vi.mock('@/utils/supabase', () => ({ createSupabaseAdminClient: () => mocks.admin() }));
vi.mock('@/utils/object', async (orig) => ({
  ...(await orig<typeof import('@/utils/object')>()),
  supportsMultipart: () => mocks.supports(),
  createMultipartUpload: (...a: unknown[]) => mocks.create(...a),
  getUploadPartSignedUrl: (...a: unknown[]) => mocks.partUrl(...a),
  listUploadedParts: (...a: unknown[]) => mocks.list(...a),
  completeMultipartUpload: (...a: unknown[]) => mocks.complete(...a),
  abortMultipartUpload: (...a: unknown[]) => mocks.abort(...a),
  objectExists: (...a: unknown[]) => mocks.exists(...a),
}));

import handler from '@/pages/api/storage/multipart';

const call = async (body: Record<string, unknown>) => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body,
  } as unknown as NextApiRequest;
  let status = 0;
  let json: unknown;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      json = value;
      return this;
    },
  } as unknown as NextApiResponse;
  await handler(req, res);
  return { status, json: json as Record<string, unknown> };
};

let recordSize: number | null;
let deleted: boolean;
const supabase = () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'limit']) builder[m] = () => builder;
  builder['maybeSingle'] = async () => ({
    data: recordSize === null ? null : { file_size: recordSize },
    error: null,
  });
  builder['insert'] = async () => ({ error: null });
  builder['delete'] = () => ({ eq: () => ({ eq: async () => void (deleted = true) }) });
  return { from: () => builder };
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  recordSize = null;
  deleted = false;
  mocks.validate.mockResolvedValue({ user: { id: 'owner' }, token: 'tok', isProfile: false });
  mocks.admin.mockImplementation(supabase);
  mocks.supports.mockReturnValue(true);
  mocks.create.mockResolvedValue('upload-1');
  mocks.partUrl.mockImplementation(
    async (_k: string, _u: string, n: number) => `https://s3/part${n}`,
  );
  mocks.exists.mockResolvedValue(false);
  mocks.abort.mockResolvedValue(undefined);
});

describe('POST /api/storage/multipart', () => {
  it('starts an upload with one signed URL per part, each under the part size', async () => {
    const { status, json } = await call({
      action: 'start',
      fileName: 'h/book.m4b',
      fileSize: PART_SIZE * 2 + 7,
      bookHash: 'h',
    });
    expect(status).toBe(200);
    expect(json['uploadId']).toBe('upload-1');
    const parts = json['parts'] as {
      partNumber: number;
      size: number;
      start: number;
      uploadUrl: string;
    }[];
    expect(parts.map((p) => p.size)).toEqual([PART_SIZE, PART_SIZE, 7]);
    expect(parts.map((p) => p.uploadUrl)).toEqual([
      'https://s3/part1',
      'https://s3/part2',
      'https://s3/part3',
    ]);
    expect(mocks.create).toHaveBeenCalledWith('owner/h/book.m4b');
  });

  it('completes only when every part has arrived', async () => {
    recordSize = PART_SIZE + 1;
    mocks.list.mockResolvedValue([{ PartNumber: 1, ETag: '"a"', Size: PART_SIZE }]);
    const missing = await call({ action: 'complete', fileName: 'h/b.m4b', uploadId: 'u' });
    expect(missing.status).toBe(400);
    expect(mocks.complete).not.toHaveBeenCalled();

    mocks.list.mockResolvedValue([
      { PartNumber: 1, ETag: '"a"', Size: PART_SIZE },
      { PartNumber: 2, ETag: '"b"', Size: 1 },
    ]);
    const done = await call({ action: 'complete', fileName: 'h/b.m4b', uploadId: 'u' });
    expect(done.status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith('owner/h/b.m4b', 'u', expect.any(Array));
  });

  it('aborts and forgets an upload that never finished, but keeps a file that already exists', async () => {
    await call({ action: 'abort', fileName: 'h/b.m4b', uploadId: 'u' });
    expect(mocks.abort).toHaveBeenCalledWith('owner/h/b.m4b', 'u');
    expect(deleted).toBe(true);

    deleted = false;
    mocks.exists.mockResolvedValue(true);
    await call({ action: 'abort', fileName: 'h/b.m4b', uploadId: 'u' });
    expect(deleted).toBe(false);
  });

  it('refuses a path that escapes the user, a profile, and a backend without multipart', async () => {
    expect((await call({ action: 'start', fileName: '../x/y', fileSize: 1 })).status).toBe(400);
    mocks.validate.mockResolvedValue({ user: { id: 'kid' }, token: 't', isProfile: true });
    expect((await call({ action: 'start', fileName: 'a/b', fileSize: 1 })).status).toBe(403);
    mocks.validate.mockResolvedValue({ user: { id: 'owner' }, token: 't', isProfile: false });
    mocks.supports.mockReturnValue(false);
    const unsupported = await call({ action: 'start', fileName: 'a/b', fileSize: 1 });
    expect(unsupported.status).toBe(400);
    expect(unsupported.json['error']).toBe('Multipart not supported');
  });
});

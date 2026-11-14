import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// An earlier attempt at the same file leaves a record behind (the upload was killed). The next
// attempt must plan its parts from the file it is sending now, not from the old record.

const validateUserAndTokenMock = vi.fn();
const createMultipartUploadMock = vi.fn();
const state = {
  existing: null as null | { file_size: number },
  updates: [] as Record<string, unknown>[],
};

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
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'limit']) chain[m] = () => chain;
  chain['maybeSingle'] = async () => ({ data: state.existing, error: null });
  chain['insert'] = async () => ({ error: null });
  chain['update'] = (values: Record<string, unknown>) => {
    state.updates.push(values);
    return chain;
  };
  chain['then'] = (resolve: (v: unknown) => unknown) => resolve({ error: null });
  return { createSupabaseAdminClient: () => ({ from: () => chain }) };
});

import handler from '@/pages/api/storage/multipart';

const MB = 1024 * 1024;
const start = async (fileSize: number) => {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer t' },
    body: { action: 'start', fileName: 'Readest/Books/x/a.m4b', fileSize },
  } as unknown as NextApiRequest;
  let status = 0;
  let json: { parts?: unknown[] } = {};
  const res = {
    status(c: number) {
      status = c;
      return this;
    },
    json(v: { parts?: unknown[] }) {
      json = v;
      return this;
    },
  } as unknown as NextApiResponse;
  await handler(req, res);
  return { status, parts: json.parts?.length };
};

beforeEach(() => {
  state.existing = null;
  state.updates = [];
  createMultipartUploadMock.mockReset().mockResolvedValue('u1');
  validateUserAndTokenMock
    .mockReset()
    .mockResolvedValue({ user: { id: 'owner' }, token: 't', ownerId: 'owner', isProfile: false });
});

describe('POST /api/storage/multipart start after an earlier attempt', () => {
  it('plans the parts for the file being sent now, and corrects the old record', async () => {
    state.existing = { file_size: 60 * MB }; // an old attempt recorded a different size: 2 parts
    const { status, parts } = await start(152 * MB); // 4 parts
    expect(status).toBe(200);
    expect(parts).toBe(4);
    expect(state.updates).toEqual([{ file_size: 152 * MB }]);
  });

  it('leaves the record alone when the size is the same', async () => {
    state.existing = { file_size: 152 * MB };
    const { parts } = await start(152 * MB);
    expect(parts).toBe(4);
    expect(state.updates).toHaveLength(0);
  });

  it('plans normally when there is no earlier attempt', async () => {
    const { parts } = await start(152 * MB);
    expect(parts).toBe(4);
    expect(state.updates).toHaveLength(0);
  });
});

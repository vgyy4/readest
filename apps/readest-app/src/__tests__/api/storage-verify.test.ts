import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// "Which of these books does the server really have?" A library can claim a book is uploaded
// while the storage has no file (the mark came from elsewhere, an upload that never finished, a
// wiped bucket). Devices use this to find those books and upload them again.

const validateUserAndTokenMock = vi.fn();
const objectExistsMock = vi.fn();
let fileRows: { book_hash: string; file_key: string }[] = [];
const lookedUpUsers: unknown[] = [];

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...a: unknown[]) => validateUserAndTokenMock(...a),
}));
vi.mock('@/utils/object', () => ({
  objectExists: (...a: unknown[]) => objectExistsMock(...a),
}));
const clearedMarks: { values: Record<string, unknown>; userIds: unknown; hashes: unknown }[] = [];
let profileIds: string[] = [];
vi.mock('@/utils/supabase', () => {
  const files: Record<string, unknown> = {};
  files['select'] = () => files;
  files['eq'] = (col: string, value: unknown) => {
    if (col === 'user_id') lookedUpUsers.push(value);
    return files;
  };
  files['in'] = () => files;
  files['is'] = async () => ({ data: fileRows, error: null });
  const profiles: Record<string, unknown> = {};
  profiles['select'] = () => profiles;
  profiles['eq'] = async () => ({
    data: profileIds.map((id) => ({ profile_user_id: id })),
    error: null,
  });
  const books = () => {
    const call: { values: Record<string, unknown>; userIds?: unknown; hashes?: unknown } = {
      values: {},
    };
    const chain: Record<string, unknown> = {};
    chain['update'] = (values: Record<string, unknown>) => {
      call.values = values;
      return chain;
    };
    let ins = 0;
    chain['in'] = (_col: string, list: unknown) => {
      if (ins++ === 0) call.userIds = list;
      else call.hashes = list;
      return chain;
    };
    chain['not'] = async () => {
      clearedMarks.push(call as (typeof clearedMarks)[number]);
      return { error: null };
    };
    return chain;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: (table: string) =>
        table === 'files' ? files : table === 'profiles' ? profiles : books(),
    }),
  };
});

import handler from '@/pages/api/storage/verify';

const a = 'a'.repeat(32);
const b = 'b'.repeat(32);
const c = 'c'.repeat(32);

const call = async (body: unknown, method = 'POST') => {
  const req = { method, headers: { authorization: 'Bearer t' }, body } as unknown as NextApiRequest;
  let status = 0;
  let json: Record<string, unknown> = {};
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(value: Record<string, unknown>) {
      json = value;
      return this;
    },
  } as unknown as NextApiResponse;
  await handler(req, res);
  return { status, json };
};

beforeEach(() => {
  fileRows = [];
  lookedUpUsers.length = 0;
  clearedMarks.length = 0;
  profileIds = [];
  objectExistsMock.mockReset().mockResolvedValue(true);
  validateUserAndTokenMock.mockReset().mockResolvedValue({
    user: { id: 'owner' },
    token: 't',
    ownerId: 'owner',
    isProfile: false,
  });
});

describe('POST /api/storage/verify', () => {
  it('reports a book as present only when a file record exists and the file is really there', async () => {
    fileRows = [
      { book_hash: a, file_key: `owner/Readest/Books/${a}/${a}.epub` },
      { book_hash: b, file_key: `owner/Readest/Books/${b}/${b}.epub` },
    ];
    objectExistsMock.mockImplementation(async (key: string) => key.includes(a));
    const { status, json } = await call({ bookHashes: [a, b, c] });
    expect(status).toBe(200);
    expect(json['present']).toEqual([a]);
    expect(json['missing']).toEqual([b, c]); // b: record but no file; c: no record at all
  });

  it('does not count a cover as the book', async () => {
    fileRows = [{ book_hash: a, file_key: `owner/Readest/Books/${a}/cover.png` }];
    const { json } = await call({ bookHashes: [a] });
    expect(json['missing']).toEqual([a]);
  });

  it("looks in the account's storage for a profile", async () => {
    validateUserAndTokenMock.mockResolvedValue({
      user: { id: 'kid' },
      token: 't',
      ownerId: 'owner',
      isProfile: true,
    });
    await call({ bookHashes: [a] });
    expect(lookedUpUsers).toEqual(['owner']);
  });

  it('refuses a request that is not signed in, and bad input', async () => {
    validateUserAndTokenMock.mockResolvedValue({});
    expect((await call({ bookHashes: [a] })).status).toBe(403);
    validateUserAndTokenMock.mockResolvedValue({
      user: { id: 'owner' },
      token: 't',
      ownerId: 'owner',
    });
    expect((await call({ bookHashes: 'nope' })).status).toBe(400);
    expect((await call({ bookHashes: ['../x'] })).status).toBe(400);
    expect((await call({ bookHashes: Array(201).fill(a) })).status).toBe(400);
    expect((await call({ bookHashes: [a] }, 'GET')).status).toBe(405);
  });

  it('answers an empty list with nothing missing', async () => {
    const { status, json } = await call({ bookHashes: [] });
    expect(status).toBe(200);
    expect(json).toEqual({ present: [], missing: [] });
  });
});

describe('POST /api/storage/verify with repair', () => {
  it('clears the false "uploaded" mark of the missing books for the account and every profile', async () => {
    profileIds = ['kid-1', 'kid-2'];
    fileRows = [{ book_hash: a, file_key: `owner/Readest/Books/${a}/${a}.epub` }];
    const { json } = await call({ bookHashes: [a, b], repair: true });
    expect(json['missing']).toEqual([b]);
    expect(clearedMarks).toHaveLength(1);
    expect(clearedMarks[0]!.values['uploaded_at']).toBeNull();
    expect(typeof clearedMarks[0]!.values['updated_at']).toBe('string');
    expect(clearedMarks[0]!.userIds).toEqual(['owner', 'kid-1', 'kid-2']);
    expect(clearedMarks[0]!.hashes).toEqual([b]);
  });

  it('leaves the marks of books the server does have', async () => {
    fileRows = [{ book_hash: a, file_key: `owner/Readest/Books/${a}/${a}.epub` }];
    await call({ bookHashes: [a], repair: true });
    expect(clearedMarks).toHaveLength(0);
  });

  it('changes nothing unless asked to', async () => {
    await call({ bookHashes: [a, b] });
    expect(clearedMarks).toHaveLength(0);
  });

  it('works from a profile, for the account it belongs to', async () => {
    validateUserAndTokenMock.mockResolvedValue({
      user: { id: 'kid-1' },
      token: 't',
      ownerId: 'owner',
      isProfile: true,
    });
    profileIds = ['kid-1'];
    await call({ bookHashes: [c], repair: true });
    expect(clearedMarks[0]!.userIds).toEqual(['owner', 'kid-1']);
  });
});

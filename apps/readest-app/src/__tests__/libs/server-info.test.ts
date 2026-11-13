import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/server-info';

const run = async (method: string, headers: Record<string, string> = {}) => {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    getHeader() {
      return undefined;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler(
    { method, headers } as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  return res;
};

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/server-info', () => {
  it('reports the addresses an app needs', async () => {
    vi.stubEnv('SUPABASE_PUBLIC_URL', 'https://books.example.com');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('API_BASE_URL', 'https://books.example.com');
    const res = await run('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      readest: 'server-info',
      supabaseUrl: 'https://books.example.com',
      supabaseAnonKey: 'anon-key',
      apiBaseUrl: 'https://books.example.com',
    });
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('derives the API address from the request when none is configured', async () => {
    vi.stubEnv('SUPABASE_PUBLIC_URL', 'https://s.example.com');
    vi.stubEnv('SUPABASE_ANON_KEY', 'k');
    vi.stubEnv('API_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.stubEnv('SITE_URL', '');
    const res = await run('GET', { host: 'books.example.com', 'x-forwarded-proto': 'https' });
    expect((res.body as { apiBaseUrl: string }).apiBaseUrl).toBe('https://books.example.com');
  });

  it('only answers GET', async () => {
    expect((await run('POST')).statusCode).toBe(405);
  });
});

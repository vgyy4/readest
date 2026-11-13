import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accessFetch, getAccessHeaders } from '@/libs/cloudflareAccess';

const setEnv = () => {
  vi.stubEnv('NEXT_PUBLIC_CF_ACCESS_CLIENT_ID', 'id.access');
  vi.stubEnv('NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET', 'secret');
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://books.example.com');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://books.example.com');
};

afterEach(() => vi.unstubAllEnvs());

describe('getAccessHeaders', () => {
  it('sends nothing when no service token is configured', () => {
    expect(getAccessHeaders('https://books.example.com/api/x')).toEqual({});
  });

  describe('with a service token', () => {
    beforeEach(setEnv);

    it('adds the token for the configured server', () => {
      expect(getAccessHeaders('https://books.example.com/auth/v1/token')).toEqual({
        'CF-Access-Client-Id': 'id.access',
        'CF-Access-Client-Secret': 'secret',
      });
    });

    it('never sends it to another host, or for a relative URL', () => {
      expect(getAccessHeaders('https://evil.example.org/steal')).toEqual({});
      expect(getAccessHeaders('/api/sync')).toEqual({});
      expect(getAccessHeaders('not a url')).toEqual({});
    });

    it('also covers extra hosts named in NEXT_PUBLIC_CF_ACCESS_HOSTS', () => {
      vi.stubEnv('NEXT_PUBLIC_CF_ACCESS_HOSTS', 'files.example.com, cdn.example.com');
      expect(getAccessHeaders('https://files.example.com/readest-files/a')).not.toEqual({});
      expect(getAccessHeaders('https://cdn.example.com/x')).not.toEqual({});
    });
  });
});

describe('accessFetch', () => {
  beforeEach(setEnv);

  it('adds the headers and keeps the caller’s own', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    await accessFetch('https://books.example.com/rest/v1/books', {
      headers: { Authorization: 'Bearer t' },
    });
    const headers = new Headers(spy.mock.calls[0]![1]!.headers);
    expect(headers.get('authorization')).toBe('Bearer t');
    expect(headers.get('cf-access-client-id')).toBe('id.access');
    expect(headers.get('cf-access-client-secret')).toBe('secret');
    spy.mockRestore();
  });

  it('leaves requests to other hosts alone', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    await accessFetch('https://other.example.org/x', { headers: { A: 'b' } });
    const headers = new Headers(spy.mock.calls[0]![1]!.headers);
    expect(headers.get('cf-access-client-id')).toBeNull();
    spy.mockRestore();
  });
});

describe('a server chosen on the sign-in screen', () => {
  afterEach(() => {
    delete (window as { __READEST_RUNTIME_CONFIG?: unknown }).__READEST_RUNTIME_CONFIG;
  });

  it('uses the token and host saved with it, without any build-time setting', () => {
    (window as { __READEST_RUNTIME_CONFIG?: unknown }).__READEST_RUNTIME_CONFIG = {
      apiBaseUrl: 'https://mine.example.com',
      supabaseUrl: 'https://mine.example.com',
      cfAccessClientId: 'rt-id',
      cfAccessClientSecret: 'rt-secret',
    };
    expect(getAccessHeaders('https://mine.example.com/auth/v1/token')).toEqual({
      'CF-Access-Client-Id': 'rt-id',
      'CF-Access-Client-Secret': 'rt-secret',
    });
    expect(getAccessHeaders('https://other.example.org/')).toEqual({});
  });
});

describe('installAccessFetch', () => {
  it('adds the token to any request to our server, from any caller, and only those', async () => {
    vi.stubEnv('NEXT_PUBLIC_CF_ACCESS_CLIENT_ID', 'id.access');
    vi.stubEnv('NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET', 'secret');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://books.example.com');
    const seen: Headers[] = [];
    const original = window.fetch;
    window.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response('ok');
    }) as typeof fetch;
    vi.resetModules();
    const { installAccessFetch } = await import('@/libs/cloudflareAccess');
    installAccessFetch();
    installAccessFetch(); // twice is harmless
    try {
      await window.fetch('https://books.example.com/api/sync', { headers: { A: 'b' } });
      await window.fetch('https://elsewhere.example.org/x');
      expect(seen[0]!.get('cf-access-client-id')).toBe('id.access');
      expect(seen[0]!.get('a')).toBe('b');
      expect(seen[1]!.get('cf-access-client-id')).toBeNull();
      expect(seen).toHaveLength(2);
    } finally {
      window.fetch = original;
    }
  });
});

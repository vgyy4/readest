import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearServer,
  discoverServer,
  getStoredServer,
  normalizeServerUrl,
  saveServer,
  SERVER_BOOT_SCRIPT,
  ServerCheckFailure,
} from '@/libs/serverConfig';

afterEach(() => {
  localStorage.clear();
  delete (window as { __READEST_RUNTIME_CONFIG?: unknown }).__READEST_RUNTIME_CONFIG;
});

describe('normalizeServerUrl', () => {
  it('accepts a bare host, a full URL, a LAN address and trailing paths', () => {
    expect(normalizeServerUrl('books.example.com')).toBe('https://books.example.com');
    expect(normalizeServerUrl('  https://books.example.com/  ')).toBe('https://books.example.com');
    expect(normalizeServerUrl('http://192.168.1.50:3000/library')).toBe('http://192.168.1.50:3000');
  });

  it('rejects empty input and other schemes', () => {
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl('   ')).toBeNull();
    expect(normalizeServerUrl('ftp://example.com')).toBeNull();
    expect(normalizeServerUrl('javascript://x')).toBeNull();
  });
});

const info = {
  readest: 'server-info',
  supabaseUrl: 'https://books.example.com',
  supabaseAnonKey: 'anon',
  apiBaseUrl: 'https://books.example.com',
};
const respond = (body: unknown, status = 200) =>
  vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('discoverServer', () => {
  it('reads the addresses from /api/server-info', async () => {
    const fetchImpl = respond(info);
    const server = await discoverServer('books.example.com', undefined, fetchImpl);
    expect(server).toEqual({
      apiBaseUrl: 'https://books.example.com',
      supabaseUrl: 'https://books.example.com',
      supabaseAnonKey: 'anon',
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://books.example.com/api/server-info', {
      headers: {},
    });
  });

  it('sends the Cloudflare Access token and keeps it', async () => {
    const fetchImpl = respond(info);
    const server = await discoverServer(
      'books.example.com',
      { clientId: 'id.access', clientSecret: 'secret' },
      fetchImpl,
    );
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]![1].headers).toEqual({
      'CF-Access-Client-Id': 'id.access',
      'CF-Access-Client-Secret': 'secret',
    });
    expect(server.cfAccessClientId).toBe('id.access');
    expect(server.cfAccessClientSecret).toBe('secret');
  });

  it('says why it failed', async () => {
    const reason = async (promise: Promise<unknown>) =>
      promise.catch((e) => (e as ServerCheckFailure).reason);
    expect(await reason(discoverServer('', undefined, respond(info)))).toBe('invalid-url');
    expect(await reason(discoverServer('a.com', undefined, respond({}, 403)))).toBe('blocked');
    expect(await reason(discoverServer('a.com', undefined, respond({}, 404)))).toBe('not-readest');
    expect(await reason(discoverServer('a.com', undefined, respond({ hello: 1 })))).toBe(
      'not-readest',
    );
    const offline = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;
    expect(await reason(discoverServer('a.com', undefined, offline))).toBe('blocked');
    expect(
      await reason(discoverServer('a.com', { clientId: 'i', clientSecret: 's' }, offline)),
    ).toBe('unreachable');
  });

  it('falls back to the typed address when the server does not report one', async () => {
    const { apiBaseUrl: _unused, ...rest } = info;
    const server = await discoverServer('books.example.com', undefined, respond(rest));
    expect(server.apiBaseUrl).toBe('https://books.example.com');
  });
});

describe('stored server and the boot script', () => {
  const server = {
    apiBaseUrl: 'https://a.example.com',
    supabaseUrl: 'https://a.example.com',
    supabaseAnonKey: 'anon',
    cfAccessClientId: 'id',
    cfAccessClientSecret: 'sec',
  };

  it('stores, reads and clears the server', () => {
    expect(getStoredServer()).toBeNull();
    saveServer(server);
    expect(getStoredServer()).toEqual(server);
    clearServer();
    expect(getStoredServer()).toBeNull();
  });

  it('ignores a broken stored value', () => {
    localStorage.setItem('readest-server', '{nope');
    expect(getStoredServer()).toBeNull();
    localStorage.setItem('readest-server', JSON.stringify({ apiBaseUrl: 'x' }));
    expect(getStoredServer()).toBeNull();
  });

  it('feeds the runtime config before the app loads', () => {
    saveServer(server);
    new Function(SERVER_BOOT_SCRIPT)();
    expect(
      (window as { __READEST_RUNTIME_CONFIG?: Record<string, string> }).__READEST_RUNTIME_CONFIG,
    ).toMatchObject({
      apiBaseUrl: 'https://a.example.com',
      supabaseUrl: 'https://a.example.com',
      supabaseAnonKey: 'anon',
      cfAccessClientId: 'id',
    });
  });

  it('leaves the default config alone when no server is chosen', () => {
    new Function(SERVER_BOOT_SCRIPT)();
    expect(
      (window as { __READEST_RUNTIME_CONFIG?: unknown }).__READEST_RUNTIME_CONFIG,
    ).toBeUndefined();
  });
});

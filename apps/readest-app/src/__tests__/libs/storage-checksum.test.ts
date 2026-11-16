import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A finished transfer is checked by SHA-256: what arrived against what was uploaded, and what the
// server stored against what was sent.

const env = vi.hoisted(() => ({ web: false }));
vi.mock('@/services/environment', () => ({
  getAPIBaseUrl: () => 'https://api.test',
  isWebAppPlatform: () => env.web,
}));
vi.mock('@/utils/access', () => ({ getUserID: vi.fn().mockResolvedValue('user-1') }));
vi.mock('@/utils/fetch', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('@/utils/transfer', () => ({
  tauriUpload: vi.fn(),
  tauriDownload: vi.fn(),
  webUpload: vi.fn(),
  webDownload: vi.fn(),
}));
const hashes = vi.hoisted(() => ({ path: vi.fn(), blob: vi.fn() }));
vi.mock('@/utils/fileHash', async (orig) => {
  const actual = await orig<typeof import('@/utils/fileHash')>();
  return { ...actual, sha256OfPath: hashes.path, sha256OfBlob: hashes.blob };
});

import { downloadFile, uploadFile } from '@/libs/storage';
import { fetchWithAuth } from '@/utils/fetch';
import { tauriDownload, tauriUpload, webDownload } from '@/utils/transfer';
import type { AppService } from '@/types/system';

const GOOD = 'a'.repeat(64);
const BAD = 'b'.repeat(64);

const json = (body: unknown) => ({ json: async () => body }) as Response;

const appService = () =>
  ({
    deleteFile: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn(),
  }) as unknown as AppService & {
    deleteFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
  };

beforeEach(() => {
  vi.clearAllMocks();
  env.web = false;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(tauriDownload).mockResolvedValue({});
  vi.mocked(fetchWithAuth).mockResolvedValue(
    json({ downloadUrl: 'https://store/x', sha256: GOOD }),
  );
});
afterEach(() => vi.useRealTimers());

describe('a download is checked against the SHA-256 it was uploaded with', () => {
  const run = (over: Partial<Parameters<typeof downloadFile>[0]> = {}) =>
    downloadFile({
      appService: appService(),
      dst: '/books/a.m4b',
      cfp: 'Readest/Books/a.m4b',
      ...over,
    });

  it('passes when the file is the one that was uploaded', async () => {
    hashes.path.mockResolvedValue(GOOD.toUpperCase()); // case does not matter
    await run();
    expect(hashes.path).toHaveBeenCalledWith('/books/a.m4b');
    expect(tauriDownload).toHaveBeenCalledTimes(1);
  });

  it('downloads again over one connection when the many-connection copy does not match, then passes', async () => {
    hashes.path.mockResolvedValueOnce(BAD).mockResolvedValueOnce(GOOD);
    const app = appService();
    await run({ appService: app });
    expect(tauriDownload).toHaveBeenCalledTimes(2);
    // Arguments: url, path, progress, headers, body, singleThreaded.
    expect(vi.mocked(tauriDownload).mock.calls[1]![5]).toBe(true);
    expect(app.deleteFile).toHaveBeenCalledWith('/books/a.m4b', 'None');
  });

  it('removes the file and fails when it still does not match', async () => {
    hashes.path.mockResolvedValue(BAD);
    const app = appService();
    await expect(run({ appService: app })).rejects.toThrow(/does not match.*SHA-256/);
    expect(app.deleteFile).toHaveBeenLastCalledWith('/books/a.m4b', 'None');
    expect(tauriDownload).toHaveBeenCalledTimes(2);
  });

  it('does not try again when it was already one connection', async () => {
    hashes.path.mockResolvedValue(BAD);
    const app = appService();
    await expect(run({ appService: app, singleThreaded: true })).rejects.toThrow(/does not match/);
    expect(tauriDownload).toHaveBeenCalledTimes(1);
    expect(app.deleteFile).toHaveBeenCalled();
  });

  it('checks nothing when the server has no SHA-256 for the file (uploaded before they were kept)', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(
      json({ downloadUrl: 'https://store/x', sha256: null }),
    );
    await run();
    expect(hashes.path).not.toHaveBeenCalled();
  });

  it('takes a SHA-256 given with the address, for downloads that already have one', async () => {
    hashes.path.mockResolvedValue(BAD);
    await expect(run({ url: 'https://store/y', sha256: GOOD })).rejects.toThrow(/does not match/);
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('lets a file through when the check itself cannot run', async () => {
    hashes.path.mockRejectedValue(new Error('no such command'));
    await expect(run()).resolves.toBeDefined();
  });

  it('on the web, checks the file before it is saved', async () => {
    env.web = true;
    vi.mocked(webDownload).mockResolvedValue({ headers: {}, blob: new Blob(['x']) });
    hashes.blob.mockResolvedValue(BAD);
    const app = appService();
    await expect(run({ appService: app })).rejects.toThrow(/does not match/);
    expect(app.writeFile).not.toHaveBeenCalled();
    hashes.blob.mockResolvedValue(GOOD);
    await run({ appService: app });
    expect(app.writeFile).toHaveBeenCalledTimes(1);
  });
});

describe('an upload is checked against the copy the server stored', () => {
  const file = new File(['content'], 'Readest/Books/abc/abc.m4b');
  const bodiesTo = (suffix: string) =>
    vi
      .mocked(fetchWithAuth)
      .mock.calls.filter(([url]) => String(url).endsWith(suffix))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

  const server = (checks: string[]) => {
    const answers = [...checks];
    vi.mocked(fetchWithAuth).mockImplementation(async (url) => {
      if (String(url).endsWith('/storage/upload')) return json({ uploadUrl: 'https://store/put' });
      if (String(url).endsWith('/storage/checksum'))
        return json({ status: answers.shift() ?? 'verified' });
      return json({});
    });
  };

  beforeEach(() => {
    vi.mocked(tauriUpload).mockResolvedValue('' as never);
    hashes.path.mockResolvedValue(GOOD);
  });

  it("sends the file's SHA-256 with the upload, and asks the server to check it when it is done", async () => {
    server(['verified']);
    await uploadFile(file, '/books/abc/abc.m4b', undefined, 'abc');
    expect(bodiesTo('/storage/upload')[0]).toMatchObject({ sha256: GOOD, fileSize: file.size });
    expect(bodiesTo('/storage/checksum')[0]).toEqual({ fileName: file.name, sha256: GOOD });
  });

  it('waits while the server is still reading the file back', async () => {
    vi.useFakeTimers();
    server(['running', 'running', 'verified']);
    const done = uploadFile(file, '/books/abc/abc.m4b', undefined, 'abc');
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(bodiesTo('/storage/checksum')).toHaveLength(3);
  });

  it('removes the stored copy and fails when it does not match', async () => {
    server(['mismatch']);
    await expect(uploadFile(file, '/books/abc/abc.m4b', undefined, 'abc')).rejects.toThrow(
      /does not match the file that was sent/,
    );
    expect(
      vi
        .mocked(fetchWithAuth)
        .mock.calls.some(
          ([url, init]) =>
            String(url).includes('/storage/delete') && (init as RequestInit).method === 'DELETE',
        ),
    ).toBe(true);
  });

  it('is not failed by a server that cannot check', async () => {
    vi.mocked(fetchWithAuth).mockImplementation(async (url) => {
      if (String(url).endsWith('/storage/upload')) return json({ uploadUrl: 'https://store/put' });
      throw new Error('The server sent a web page instead of data (HTTP 404)');
    });
    await expect(uploadFile(file, '/books/abc/abc.m4b', undefined, 'abc')).resolves.toBeUndefined();
  });

  it('goes unchecked, and asks nothing, when the SHA-256 cannot be worked out', async () => {
    hashes.path.mockRejectedValue(new Error('unreadable'));
    server([]);
    await uploadFile(file, '/books/abc/abc.m4b', undefined, 'abc');
    expect(bodiesTo('/storage/upload')[0]!['sha256']).toBeUndefined();
    expect(bodiesTo('/storage/checksum')).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/environment', () => ({
  getAPIBaseUrl: () => 'https://server.test/api',
  isWebAppPlatform: () => false,
}));
vi.mock('@/utils/access', () => ({ getUserID: vi.fn().mockResolvedValue('user-1') }));
vi.mock('@/utils/fetch', () => ({
  fetchWithAuth: vi.fn().mockResolvedValue({
    json: async () => ({ downloadUrl: 'https://server.test/readest-books/x?sig=1' }),
  }),
}));
vi.mock('@/utils/transfer', () => ({
  tauriUpload: vi.fn(),
  tauriDownload: vi.fn(),
  webUpload: vi.fn(),
  webDownload: vi.fn(),
}));

import { downloadFile } from '@/libs/storage';
import { friendlyDownloadError } from '@/libs/downloadError';
import { fetchWithAuth } from '@/utils/fetch';
import { tauriDownload } from '@/utils/transfer';

const app = {} as never;
const run = () =>
  downloadFile({ appService: app, dst: 'Books/h/h.epub', cfp: 'Readest/Books/h/h.epub' });

describe('friendlyDownloadError', () => {
  it('names a refusal and what to check', () => {
    const e = friendlyDownloadError(
      new Error('request failed with status code 403: Access denied'),
    );
    expect(e.message).toMatch(/refused/i);
    expect(e.message).toMatch(/403/);
    expect(e.message).toMatch(/Cloudflare Access/);
  });

  it('says a missing file is not on the server', () => {
    expect(
      friendlyDownloadError(new Error('request failed with status code 404: NoSuchKey')).message,
    ).toMatch(/not on the server/i);
    expect(friendlyDownloadError(new Error('No download URL available')).message).toMatch(
      /does not have this file/i,
    );
  });

  it('turns the server\'s plain "File not found" into what to do about it', () => {
    const e = friendlyDownloadError(new Error('File not found'));
    expect(e.message).toMatch(/does not have this book/i);
    expect(e.message).toMatch(/Wi-Fi/);
  });

  it('reports a file the server has no record of, without trying to download anything', async () => {
    vi.mocked(fetchWithAuth).mockRejectedValueOnce(new Error('File not found'));
    vi.mocked(tauriDownload).mockReset();
    await expect(run()).rejects.toThrow(/does not have this book/i);
    expect(vi.mocked(tauriDownload)).not.toHaveBeenCalled();
  });

  it('says a proxy timeout was a timeout', () => {
    expect(
      friendlyDownloadError(new Error('request failed with status code 524: x')).message,
    ).toMatch(/did not answer in time/i);
  });

  it('keeps any other message as it was', () => {
    expect(
      friendlyDownloadError(new Error('a part of the file came back 5 bytes long')).message,
    ).toBe('a part of the file came back 5 bytes long');
  });
});

describe('downloadFile on the apps', () => {
  beforeEach(() => {
    vi.mocked(tauriDownload).mockReset();
  });

  it('tries once more with a single connection when the first try fails on the network', async () => {
    vi.mocked(tauriDownload)
      .mockRejectedValueOnce(new Error('a part of the file came back 3 bytes long'))
      .mockResolvedValueOnce({ ok: 'yes' });
    await expect(run()).resolves.toEqual({ ok: 'yes' });
    expect(vi.mocked(tauriDownload)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(tauriDownload).mock.calls[0]![6]).toBeUndefined(); // skipSsl
    expect(vi.mocked(tauriDownload).mock.calls[0]![5]).toBeUndefined(); // singleThreaded
    expect(vi.mocked(tauriDownload).mock.calls[1]![5]).toBe(true);
  });

  it('does not retry a refusal: asking again changes nothing', async () => {
    vi.mocked(tauriDownload).mockRejectedValue(
      new Error('request failed with status code 403: Access denied'),
    );
    await expect(run()).rejects.toThrow(/refused/i);
    expect(vi.mocked(tauriDownload)).toHaveBeenCalledTimes(1);
  });

  it('does not retry when it already was single-connection', async () => {
    vi.mocked(tauriDownload).mockRejectedValue(new Error('connection reset'));
    await expect(
      downloadFile({ appService: app, dst: 'x', cfp: 'y', singleThreaded: true }),
    ).rejects.toThrow('connection reset');
    expect(vi.mocked(tauriDownload)).toHaveBeenCalledTimes(1);
  });

  it('reports the reason when both tries fail', async () => {
    vi.mocked(tauriDownload).mockRejectedValue(
      new Error('request failed with status code 502: bad gateway'),
    );
    await expect(run()).rejects.toThrow(/server/i);
    expect(vi.mocked(tauriDownload)).toHaveBeenCalledTimes(2);
  });
});

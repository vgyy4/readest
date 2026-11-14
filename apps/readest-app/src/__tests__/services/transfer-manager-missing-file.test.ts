import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTransferStore } from '@/store/transferStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';
import type { Book } from '@/types/book';

const toasts: { message: string; type: string }[] = [];
vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: vi.fn((name: string, payload: { message: string; type: string }) => {
      if (name === 'toast') toasts.push(payload);
    }),
    dispatchSync: vi.fn(),
  },
}));
vi.mock('@/utils/uploadNetwork', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/uploadNetwork')>()),
  getNetworkKind: async () => 'wifi',
}));
const check = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/services/serverFileCheck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/serverFileCheck')>()),
  askServerWhichAreMissing: (...a: unknown[]) => check.ask(...a),
}));

import { transferManager } from '@/services/transferManager';
import { NotOnServerError } from '@/libs/downloadError';

const book = (over: Partial<Book> = {}): Book => ({
  hash: 'a'.repeat(32),
  format: 'EPUB',
  title: 'Red Rising',
  author: 'Pierce Brown',
  createdAt: 1,
  updatedAt: 2,
  uploadedAt: 9,
  downloadedAt: null,
  ...over,
});

const reset = () => {
  const mgr = transferManager as unknown as Record<string, unknown>;
  mgr['isInitialized'] = false;
  mgr['isProcessing'] = false;
  mgr['appService'] = null;
  (mgr['abortControllers'] as Map<string, AbortController>).clear();
  let resolveReady: () => void = () => {};
  mgr['readyPromise'] = new Promise<void>((res) => {
    resolveReady = res;
  });
  mgr['readyResolve'] = resolveReady;
  useTransferStore.setState({
    transfers: {},
    isQueuePaused: false,
    isTransferQueueOpen: false,
    maxConcurrent: 2,
    activeCount: 0,
  });
};

const start = async (library: Book[], downloadError: Error) => {
  const updateBook = vi.fn().mockResolvedValue(undefined);
  const appService = {
    downloadBook: vi.fn().mockRejectedValue(downloadError),
    isMacOSApp: false,
  };
  await transferManager.initialize(
    appService as never,
    () => library,
    updateBook,
    (k: string) => k,
  );
  return { appService, updateBook };
};

const settle = (ms = 500) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  reset();
  toasts.length = 0;
  localStorage.clear();
  check.ask.mockReset();
  useSettingsStore.setState({
    settings: {
      version: 1,
      webdav: { enabled: false },
      googleDrive: { enabled: false },
    } as SystemSettings,
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a download the server cannot serve', () => {
  const lost = new NotOnServerError('The server does not have this book.');

  test('when the server confirms it has no file: tells the server to drop its false mark, drops it here, and does not retry', async () => {
    const b = book();
    check.ask.mockResolvedValue([b.hash]);
    const { appService, updateBook } = await start([b], lost);
    transferManager.queueDownload(b);
    await settle(10_000);

    expect(check.ask).toHaveBeenCalledWith([b.hash], { repair: true });
    expect(updateBook).toHaveBeenCalledTimes(1);
    expect(updateBook.mock.calls[0]![0]).toMatchObject({ hash: b.hash, uploadedAt: null });
    expect(updateBook.mock.calls[0]![0].updatedAt).toBeGreaterThan(2);
    expect(appService.downloadBook).toHaveBeenCalledTimes(1); // no pointless retries
    expect(Object.values(useTransferStore.getState().transfers)[0]?.status).toBe('failed');
    const failure = toasts.find((t) => /Failed to download book/.test(t.message));
    expect(failure?.type).toBe('error');
    expect(failure?.message).toMatch(/does not have this book/); // the reason under the headline
  });

  test('when the server says it does have the file, the failure is treated like any other (and the mark stays)', async () => {
    const b = book();
    check.ask.mockResolvedValue([]);
    const { appService, updateBook } = await start([b], lost);
    transferManager.queueDownload(b);
    await settle(1000);
    expect(updateBook).not.toHaveBeenCalled();
    expect(appService.downloadBook.mock.calls.length).toBeGreaterThan(1); // retried
  });

  test('when the server cannot be asked, nothing is changed', async () => {
    const b = book();
    check.ask.mockRejectedValue(new Error('offline'));
    const { updateBook } = await start([b], lost);
    transferManager.queueDownload(b);
    await settle(1000);
    expect(updateBook).not.toHaveBeenCalled();
  });

  test('an ordinary network failure does not touch the mark and is not even checked', async () => {
    const b = book();
    const { updateBook } = await start([b], new Error('connection reset'));
    transferManager.queueDownload(b);
    await settle(1000);
    expect(check.ask).not.toHaveBeenCalled();
    expect(updateBook).not.toHaveBeenCalled();
  });
});

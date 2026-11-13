import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTransferStore } from '@/store/transferStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';
import type { Book } from '@/types/book';

vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: vi.fn(), dispatchSync: vi.fn() } }));

const network = vi.hoisted(() => ({
  kind: 'cellular' as 'wifi' | 'cellular' | 'none' | 'unknown',
}));
vi.mock('@/utils/uploadNetwork', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/uploadNetwork')>()),
  getNetworkKind: async () => network.kind,
}));

import { transferManager } from '@/services/transferManager';

const book = (hash: string): Book => ({
  hash,
  format: 'EPUB',
  title: `Book ${hash}`,
  author: 'A',
  createdAt: 1,
  updatedAt: 2,
});

const reset = () => {
  const mgr = transferManager as unknown as Record<string, unknown>;
  mgr['isInitialized'] = false;
  mgr['isProcessing'] = false;
  mgr['appService'] = null;
  mgr['wifiRecheckTimer'] = null;
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

const settings = (overrides: Partial<SystemSettings> = {}) =>
  useSettingsStore.setState({
    settings: {
      version: 1,
      webdav: { enabled: false },
      googleDrive: { enabled: false },
      ...overrides,
    } as SystemSettings,
  });

const start = async (library: Book[]) => {
  const appService = {
    uploadBook: vi.fn().mockResolvedValue(undefined),
    isMacOSApp: false,
  };
  await transferManager.initialize(
    appService as never,
    () => library,
    vi.fn(),
    (k: string) => k,
  );
  return appService;
};

const settle = (ms = 500) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  reset();
  localStorage.clear();
  settings();
  network.kind = 'cellular';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('uploads and Wi-Fi', () => {
  test('an upload that started by itself waits on mobile data', async () => {
    const app = await start([book('a')]);
    transferManager.queueUpload(book('a'));
    await settle();
    expect(app.uploadBook).not.toHaveBeenCalled();
    expect(Object.values(useTransferStore.getState().transfers)[0]?.status).toBe('pending');
  });

  test('an upload the user pressed goes ahead on mobile data', async () => {
    const app = await start([book('a')]);
    transferManager.queueUpload(book('a'), 1, { manual: true });
    await settle();
    expect(app.uploadBook).toHaveBeenCalledTimes(1);
  });

  test('pressing Upload on a book that is already waiting lets it go', async () => {
    const app = await start([book('a')]);
    transferManager.queueUpload(book('a'));
    await settle();
    expect(app.uploadBook).not.toHaveBeenCalled();
    transferManager.queueUpload(book('a'), 1, { manual: true });
    await settle();
    expect(app.uploadBook).toHaveBeenCalledTimes(1);
  });

  test('waiting uploads go once Wi-Fi is back, without anyone doing anything', async () => {
    const app = await start([book('a'), book('b')]);
    transferManager.queueUpload(book('a'));
    transferManager.queueUpload(book('b'));
    await settle();
    expect(app.uploadBook).not.toHaveBeenCalled();
    network.kind = 'wifi';
    await settle(61_000);
    expect(app.uploadBook).toHaveBeenCalledTimes(2);
  });

  test('on Wi-Fi an upload goes straight away', async () => {
    network.kind = 'wifi';
    const app = await start([book('a')]);
    transferManager.queueUpload(book('a'));
    await settle();
    expect(app.uploadBook).toHaveBeenCalledTimes(1);
  });

  test('turning Wi-Fi only off lets everything go on mobile data', async () => {
    settings({ uploadWifiOnly: false });
    const app = await start([book('a')]);
    transferManager.queueUpload(book('a'));
    await settle();
    expect(app.uploadBook).toHaveBeenCalledTimes(1);
  });

  test('a network that cannot be told never holds anything back', async () => {
    network.kind = 'unknown';
    const app = await start([book('a')]);
    transferManager.queueUpload(book('a'));
    await settle();
    expect(app.uploadBook).toHaveBeenCalledTimes(1);
  });

  test('retrying a failed upload by hand counts as manual', async () => {
    await start([book('a')]);
    const id = transferManager.queueUpload(book('a'))!;
    useTransferStore.getState().setTransferStatus(id, 'failed', 'x');
    useTransferStore.getState().retryTransfer(id);
    expect(useTransferStore.getState().transfers[id]?.manual).toBe(true);
  });
});

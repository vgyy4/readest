import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTransferStore } from '@/store/transferStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';
import type { Book } from '@/types/book';

// While a transfer runs, Android needs a foreground service or it stops the app a few minutes
// after the screen locks. The service is started with the first transfer and stopped a little
// after the last one ends, and never on other platforms.

const service = vi.hoisted(() => ({ calls: [] as { active: boolean; text?: string }[] }));
vi.mock('@/utils/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/bridge')>()),
  setTransferService: vi.fn(async (active: boolean, text?: string) => {
    service.calls.push({ active, text });
  }),
}));
vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: vi.fn(), dispatchSync: vi.fn() },
}));
vi.mock('@/utils/uploadNetwork', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/uploadNetwork')>()),
  getNetworkKind: async () => 'wifi',
}));

import { transferManager } from '@/services/transferManager';

const book = (hash: string): Book => ({
  hash,
  format: 'M4B',
  title: `Book ${hash}`,
  author: 'A',
  createdAt: 1,
  updatedAt: 2,
  uploadedAt: null,
  downloadedAt: 5,
});

const reset = () => {
  const mgr = transferManager as unknown as Record<string, unknown>;
  mgr['isInitialized'] = false;
  mgr['isProcessing'] = false;
  mgr['appService'] = null;
  mgr['keepAlive'] = false;
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

const start = async (library: Book[], isAndroidApp: boolean, uploadBook: () => Promise<void>) => {
  const appService = { isAndroidApp, isMacOSApp: false, uploadBook, downloadBook: vi.fn() };
  await transferManager.initialize(
    appService as never,
    () => library,
    vi.fn().mockResolvedValue(undefined),
    (k: string) => k,
  );
};

const settle = (ms = 500) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  reset();
  service.calls.length = 0;
  localStorage.clear();
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

describe('keeping the app alive while transferring (Android)', () => {
  test('starts the service with a running transfer and stops it shortly after the last one ends', async () => {
    let finish: () => void = () => {};
    const b = book('a');
    await start(
      [b],
      true,
      () =>
        new Promise<void>((res) => {
          finish = res;
        }),
    );
    transferManager.queueUpload(b, 1, { manual: true });
    await settle();
    expect(service.calls).toEqual([{ active: true, text: 'Transferring books' }]);

    finish();
    await settle(2000);
    expect(service.calls).toHaveLength(1); // not stopped straight away
    await settle(20_000);
    expect(service.calls.at(-1)).toEqual({ active: false, text: undefined });
  });

  test('one transfer after another is one service run, not a stop and a start each time', async () => {
    const a = book('a');
    const b = book('b');
    await start([a, b], true, async () => {});
    useTransferStore.setState({ maxConcurrent: 1 });
    transferManager.queueUpload(a, 1, { manual: true });
    transferManager.queueUpload(b, 1, { manual: true });
    await settle(3000);
    expect(service.calls.filter((c) => c.active)).toHaveLength(1);
    expect(service.calls.filter((c) => !c.active)).toHaveLength(0);
  });

  test('does nothing on other platforms', async () => {
    const b = book('a');
    await start([b], false, async () => {});
    transferManager.queueUpload(b, 1, { manual: true });
    await settle(30_000);
    expect(service.calls).toEqual([]);
  });
});

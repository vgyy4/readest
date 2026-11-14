import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTransferStore } from '@/store/transferStore';
import { useSettingsStore } from '@/store/settingsStore';
import { setActiveProfileId } from '@/libs/profiles/active';
import type { SystemSettings } from '@/types/settings';
import type { Book } from '@/types/book';

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: vi.fn(), dispatchSync: vi.fn() },
}));
vi.mock('@/utils/uploadNetwork', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/uploadNetwork')>()),
  getNetworkKind: async () => 'wifi',
}));

import { transferManager } from '@/services/transferManager';

const HASH = 'a'.repeat(32);
const book = (over: Partial<Book> = {}): Book => ({
  hash: HASH,
  format: 'EPUB',
  title: 'Dust',
  author: 'A',
  createdAt: 1,
  updatedAt: 2,
  uploadedAt: null,
  downloadedAt: 5,
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

const start = async (library: Book[], over: Record<string, unknown> = {}) => {
  const updateBook = vi.fn().mockResolvedValue(undefined);
  const appService = {
    isMacOSApp: false,
    uploadBook: vi.fn(async (b: Book) => {
      b.uploadedAt = 99;
    }),
    downloadBook: vi.fn().mockResolvedValue(undefined),
    // Another profile's library on this device.
    loadBookFromProfileLibrary: vi.fn(async () => book()),
    saveBookToProfileLibrary: vi.fn().mockResolvedValue(undefined),
    ...over,
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
const rows = () => Object.values(useTransferStore.getState().transfers);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  reset();
  localStorage.clear();
  setActiveProfileId(null);
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
  setActiveProfileId(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pressing Upload more than once', () => {
  test('queues the book once, however many times it is pressed', async () => {
    const b = book();
    await start([b]);
    useTransferStore.getState().setIsTransferQueueOpen(false);
    const ids = [1, 2, 3, 4, 5].map(() => transferManager.queueUpload(b, 1, { manual: true }));
    expect(new Set(ids).size).toBe(1);
    expect(rows().filter((t) => t.type === 'upload')).toHaveLength(1);
  });

  test('presses while the upload is running do not start another one', async () => {
    const b = book();
    let finish: () => void = () => {};
    const { appService } = await start([b], {
      uploadBook: vi.fn(
        () =>
          new Promise<void>((res) => {
            finish = res;
          }),
      ),
    });
    transferManager.queueUpload(b, 1, { manual: true });
    await settle();
    transferManager.queueUpload(b, 1, { manual: true });
    transferManager.queueUpload(b, 1, { manual: true });
    await settle();
    finish();
    await settle();
    expect(appService.uploadBook).toHaveBeenCalledTimes(1);
  });

  test('a retried copy of an upload that is already waiting does not upload twice', async () => {
    const b = book();
    let finish: () => void = () => {};
    const { appService } = await start([b], {
      uploadBook: vi.fn(
        () =>
          new Promise<void>((res) => {
            finish = res;
          }),
      ),
    });
    const store = useTransferStore.getState();
    const failed = store.addTransfer(HASH, 'Dust', 'upload');
    store.setTransferStatus(failed, 'failed', 'boom');
    transferManager.queueUpload(b, 1, { manual: true });
    transferManager.retryTransfer(failed);
    await settle(2000);
    finish();
    await settle(2000);
    expect(appService.uploadBook).toHaveBeenCalledTimes(1);
  });
});

describe('switching profile', () => {
  test('a transfer is stamped with the profile that asked for it', async () => {
    setActiveProfileId('ofer');
    await start([book()]);
    transferManager.queueUpload(book(), 1, { manual: true });
    expect(rows()[0]?.profileId).toBe('ofer');
  });

  test("an upload queued by another profile still runs, from that profile's library", async () => {
    setActiveProfileId('ofer');
    const { appService, updateBook } = await start([]);
    // Queued while Ofer was active, then the app reloaded as Neta.
    useTransferStore.getState().addTransfer(HASH, 'Dust', 'upload');
    expect(rows()[0]?.profileId).toBe('ofer');
    setActiveProfileId('neta');
    transferManager.resumeQueue();
    await settle(2000);

    expect(appService.loadBookFromProfileLibrary).toHaveBeenCalledWith('ofer', HASH);
    expect(appService.uploadBook).toHaveBeenCalledTimes(1);
    expect(appService.saveBookToProfileLibrary).toHaveBeenCalledWith(
      'ofer',
      expect.objectContaining({ hash: HASH, uploadedAt: 99 }),
    );
    expect(updateBook).not.toHaveBeenCalled(); // Neta's library is untouched
    expect(rows()[0]?.status).toBe('completed');
  });

  test('a download for another profile waits until that profile is back', async () => {
    setActiveProfileId('ofer');
    const { appService } = await start([book()]);
    useTransferStore.getState().addTransfer(HASH, 'Dust', 'download');
    setActiveProfileId('neta');
    transferManager.resumeQueue();
    await settle(2000);
    expect(appService.downloadBook).not.toHaveBeenCalled();
    expect(rows()[0]?.status).toBe('pending');

    setActiveProfileId('ofer');
    transferManager.resumeQueue();
    await settle(2000);
    expect(appService.downloadBook).toHaveBeenCalledTimes(1);
    expect(rows()[0]?.status).toBe('completed');
  });

  test('a transfer from before profiles were recorded runs for whoever is active', async () => {
    const b = book();
    const { appService } = await start([b]);
    const id = useTransferStore.getState().addTransfer(HASH, 'Dust', 'download');
    useTransferStore.setState((s) => ({
      transfers: { ...s.transfers, [id]: { ...s.transfers[id]!, profileId: undefined } },
    }));
    setActiveProfileId('neta');
    transferManager.resumeQueue();
    await settle(2000);
    expect(appService.downloadBook).toHaveBeenCalledTimes(1);
  });
});

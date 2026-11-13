import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { Book } from '@/types/book';

const mocks = vi.hoisted(() => ({
  token: 'jwt' as string | null,
  library: [] as Book[],
  updateBook: vi.fn(),
  queueBatchUploads: vi.fn(),
  findMissing: vi.fn(),
  cloud: true,
  syncBook: true as boolean | undefined,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: mocks.token }) }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: { tag: 'env' } }) }));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: Object.assign(() => ({ updateBook: mocks.updateBook }), {
    getState: () => ({ library: mocks.library }),
  }),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ settings: { syncCategories: { book: mocks.syncBook } } }),
  },
}));
vi.mock('@/services/sync/cloudSyncProvider', () => ({
  isReadestCloudStorageActive: () => mocks.cloud,
}));
vi.mock('@/services/transferManager', () => ({
  transferManager: {
    waitUntilReady: () => Promise.resolve(),
    queueBatchUploads: (...a: unknown[]) => mocks.queueBatchUploads(...a),
  },
}));
vi.mock('@/services/serverFileCheck', async (orig) => ({
  ...(await orig<typeof import('@/services/serverFileCheck')>()),
  findBooksMissingFromServer: (...a: unknown[]) => mocks.findMissing(...a),
}));

import { useUploadMissingBooks } from '@/app/library/hooks/useUploadMissingBooks';

const book = (hash: string, over: Partial<Book> = {}): Book => ({
  hash,
  format: 'EPUB',
  title: hash,
  author: 'A',
  createdAt: 1,
  updatedAt: 1,
  downloadedAt: 5,
  uploadedAt: null,
  ...over,
});

beforeEach(() => {
  mocks.token = 'jwt';
  mocks.cloud = true;
  mocks.syncBook = true;
  mocks.library = [];
  mocks.updateBook.mockReset().mockResolvedValue(undefined);
  mocks.queueBatchUploads.mockReset();
  mocks.findMissing.mockReset().mockResolvedValue([]);
  localStorage.clear();
});
afterEach(cleanup);

describe('useUploadMissingBooks', () => {
  test('queues books that were never uploaded', async () => {
    mocks.library = [book('new'), book('done', { uploadedAt: 9 })];
    renderHook(() => useUploadMissingBooks(true));
    await waitFor(() => expect(mocks.queueBatchUploads).toHaveBeenCalled());
    const first = mocks.queueBatchUploads.mock.calls[0]![0] as Book[];
    expect(first.map((b) => b.hash)).toEqual(['new']);
  });

  test('a book marked uploaded that the server has no file for is marked not uploaded and sent again', async () => {
    const lost = book('lost', { uploadedAt: 9 });
    mocks.library = [lost, book('fine', { uploadedAt: 9 })];
    mocks.findMissing.mockResolvedValue([lost]);
    renderHook(() => useUploadMissingBooks(true));
    await waitFor(() => expect(mocks.updateBook).toHaveBeenCalled());
    const [env, updated] = mocks.updateBook.mock.calls[0]!;
    expect(env).toEqual({ tag: 'env' });
    expect(updated).toMatchObject({ hash: 'lost', uploadedAt: null });
    expect(updated.updatedAt).toBeGreaterThan(1);
    const queued = mocks.queueBatchUploads.mock.calls.flatMap((c) => c[0] as Book[]);
    expect(queued.map((b) => b.hash)).toEqual(['lost']);
    expect(queued[0]!.uploadedAt).toBeNull();
  });

  test('changes nothing when the server has everything', async () => {
    mocks.library = [book('a', { uploadedAt: 9 })];
    renderHook(() => useUploadMissingBooks(true));
    await waitFor(() => expect(mocks.findMissing).toHaveBeenCalled());
    expect(mocks.updateBook).not.toHaveBeenCalled();
    expect(mocks.queueBatchUploads).not.toHaveBeenCalled();
  });

  test('does nothing signed out, with sync of books off, or on another storage provider', async () => {
    mocks.library = [book('a', { uploadedAt: 9 })];
    mocks.token = null;
    renderHook(() => useUploadMissingBooks(true));
    cleanup();
    mocks.token = 'jwt';
    mocks.syncBook = false;
    renderHook(() => useUploadMissingBooks(true));
    cleanup();
    mocks.syncBook = true;
    mocks.cloud = false;
    renderHook(() => useUploadMissingBooks(true));
    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.findMissing).not.toHaveBeenCalled();
    expect(mocks.queueBatchUploads).not.toHaveBeenCalled();
  });

  test('looks once per launch, not on every render', async () => {
    mocks.library = [book('a', { uploadedAt: 9 })];
    const { rerender } = renderHook(() => useUploadMissingBooks(true));
    await waitFor(() => expect(mocks.findMissing).toHaveBeenCalledTimes(1));
    rerender();
    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.findMissing).toHaveBeenCalledTimes(1);
  });
});

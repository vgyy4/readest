import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import { useTransferStore } from '@/store/transferStore';

vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: vi.fn() } }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: { isMobile: true } }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (n: number) => n }));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ settings: {} }) }));
vi.mock('@/services/sync/cloudSyncProvider', () => ({ isReadestCloudStorageActive: () => true }));
vi.mock('@/components/BookCover', () => ({ default: () => <div /> }));
vi.mock('@/app/library/components/ReadingProgress', () => ({ default: () => <div /> }));

import BookItem from '@/app/library/components/BookItem';

const book: Book = {
  hash: 'h1',
  format: 'EPUB',
  title: 'Dust',
  author: 'A',
  createdAt: 1,
  updatedAt: 1,
  uploadedAt: null,
  downloadedAt: 1,
};

const show = (transferProgress: number | null = null) =>
  render(
    <BookItem
      book={book}
      mode='grid'
      coverFit='crop'
      isSelectMode={false}
      bookSelected={false}
      transferProgress={transferProgress}
      handleBookUpload={vi.fn()}
      handleBookDownload={vi.fn()}
      showBookDetailsModal={vi.fn()}
      showTimeRemaining={false}
    />,
  );

const startUpload = (hash: string, progress: number) => {
  const store = useTransferStore.getState();
  const id = store.addTransfer(hash, 'Dust', 'upload');
  store.setTransferStatus(id, 'in_progress');
  store.updateTransferProgress(id, progress, progress, 100, 1);
  return id;
};

beforeEach(() => useTransferStore.setState({ transfers: {} }));
afterEach(cleanup);

describe('BookItem transfer percentage', () => {
  it('shows nothing when the book is not transferring', () => {
    show();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it('shows the percentage of a queued upload', () => {
    startUpload('h1', 42.4);
    show();
    expect(screen.getByText('42%')).toBeTruthy();
  });

  it('follows the upload as it advances', () => {
    const id = startUpload('h1', 10);
    show();
    expect(screen.getByText('10%')).toBeTruthy();
    act(() => useTransferStore.getState().updateTransferProgress(id, 77, 77, 100, 1));
    expect(screen.getByText('77%')).toBeTruthy();
  });

  it('ignores uploads of other books', () => {
    startUpload('other', 50);
    show();
    expect(screen.queryByText('50%')).toBeNull();
  });

  it('shows the percentage of a direct (non-queue) transfer', () => {
    show(63.2);
    expect(screen.getByText('63%')).toBeTruthy();
  });
});

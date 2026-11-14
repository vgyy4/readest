import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';

const dispatch = vi.hoisted(() => vi.fn());
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch } }));
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

const book = (over: Partial<Book> = {}): Book => ({
  hash: 'h',
  format: 'EPUB',
  title: 'Red Rising',
  author: 'A',
  createdAt: 1,
  updatedAt: 1,
  uploadedAt: null,
  downloadedAt: null,
  ...over,
});

const show = (b: Book, handlers: Partial<{ up: () => void; down: () => void }> = {}) =>
  render(
    <BookItem
      book={b}
      mode='grid'
      coverFit='crop'
      isSelectMode={false}
      bookSelected={false}
      transferProgress={null}
      handleBookUpload={handlers.up ?? vi.fn()}
      handleBookDownload={handlers.down ?? vi.fn()}
      showBookDetailsModal={vi.fn()}
      showTimeRemaining={false}
    />,
  );

beforeEach(() => dispatch.mockReset());
afterEach(cleanup);

describe('BookItem when a book has no file anywhere', () => {
  it('offers no upload or download, and says what to do', () => {
    const up = vi.fn();
    const down = vi.fn();
    show(book(), { up, down });
    expect(screen.queryByLabelText('Upload Book')).toBeNull();
    expect(screen.queryByLabelText('Download Book')).toBeNull();
    fireEvent.click(screen.getByLabelText('File missing'));
    expect(up).not.toHaveBeenCalled();
    expect(down).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({ message: expect.stringMatching(/Import the file again/) }),
    );
  });

  it('still offers Upload for a book that is only on this device', () => {
    const up = vi.fn();
    show(book({ downloadedAt: 5 }), { up });
    fireEvent.click(screen.getByLabelText('Upload Book'));
    expect(up).toHaveBeenCalled();
    expect(screen.queryByLabelText('File missing')).toBeNull();
  });

  it('still offers Download for a book that is only on the server', () => {
    const down = vi.fn();
    show(book({ uploadedAt: 9 }), { down });
    fireEvent.click(screen.getByLabelText('Download Book'));
    expect(down).toHaveBeenCalled();
  });

  it('does not call a file opened in place from elsewhere missing', () => {
    show(book({ filePath: '/books/x.epub' }));
    expect(screen.queryByLabelText('File missing')).toBeNull();
  });
});

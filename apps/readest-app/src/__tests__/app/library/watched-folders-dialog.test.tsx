import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/utils/rtl', () => ({ getDirFromUILanguage: () => 'ltr' }));
vi.mock('@/components/Dialog', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div role='dialog' aria-label={title}>
      {children}
    </div>
  ),
}));

import WatchedFoldersDialog from '@/app/library/components/WatchedFoldersDialog';

afterEach(cleanup);

describe('WatchedFoldersDialog', () => {
  it('lists the watched folders and stops watching one when asked', () => {
    const onUnwatch = vi.fn();
    render(
      <WatchedFoldersDialog
        folders={[
          { path: '/storage/Audiobooks', flatten: false },
          { path: '/storage/Books', flatten: true },
        ]}
        onUnwatch={onUnwatch}
        onSetFlatten={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Audiobooks')).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText('Stop watching')[0]!);
    expect(onUnwatch).toHaveBeenCalledWith('/storage/Audiobooks');
  });

  it('closes from the back button', () => {
    const onClose = vi.fn();
    render(
      <WatchedFoldersDialog
        folders={[]}
        onUnwatch={vi.fn()}
        onSetFlatten={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('No folders are watched.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onClose).toHaveBeenCalled();
  });
});

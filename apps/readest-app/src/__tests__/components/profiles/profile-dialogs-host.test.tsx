import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import ProfileDialogsHost from '@/app/library/components/ProfileDialogsHost';
import { eventDispatcher } from '@/utils/event';

vi.mock('@/app/library/components/ProfilesDialog', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div role='dialog' aria-label='Profiles'>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));
vi.mock('@/app/library/components/BookAccessDialog', () => ({
  __esModule: true,
  default: ({ book }: { book: { hash: string; title: string } }) => (
    <div role='dialog' aria-label='Access'>
      {book.hash}:{book.title}
    </div>
  ),
}));
vi.mock('@/components/ModalPortal', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

describe('ProfileDialogsHost', () => {
  // The Profiles menu item only sends an event. The host has to be listening even when the
  // library is empty (a new device or a new profile), where there is no bookshelf at all.
  it('opens Profiles from the menu event with an empty library', async () => {
    render(<ProfileDialogsHost books={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      await eventDispatcher.dispatch('open-profiles');
    });
    expect(screen.getByRole('dialog', { name: 'Profiles' })).toBeTruthy();
    act(() => screen.getByText('close').click());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the book-access window for a book, even one not in the list', async () => {
    render(<ProfileDialogsHost books={[{ hash: 'h1', title: 'Dune' } as Book]} />);
    await act(async () => {
      await eventDispatcher.dispatch('open-book-access', { bookHashes: ['h1'] });
    });
    expect(screen.getByRole('dialog', { name: 'Access' }).textContent).toBe('h1:Dune');
  });

  it('stops listening when it unmounts', async () => {
    const { unmount } = render(<ProfileDialogsHost books={[]} />);
    unmount();
    await act(async () => {
      await eventDispatcher.dispatch('open-profiles');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

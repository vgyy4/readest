import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import { ensureBooksOnServer } from '@/libs/profiles/pushBooks';
import { useLibraryStore } from '@/store/libraryStore';

const push = vi.hoisted(() => vi.fn());
vi.mock('@/libs/sync', () => ({
  SyncClient: class {
    pushChanges = push;
  },
}));

beforeEach(() => {
  push.mockReset();
  push.mockResolvedValue({});
  useLibraryStore.setState({
    library: [
      { hash: 'a', title: 'Dune' },
      { hash: 'b', title: 'Emma' },
      { hash: 'c', title: 'Gone', deletedAt: 5 },
    ] as Book[],
  });
});
afterEach(() => useLibraryStore.setState({ library: [] }));

describe('ensureBooksOnServer', () => {
  it('sends the library entries of the books about to be shared', async () => {
    await ensureBooksOnServer(['a', 'c', 'zzz']);
    expect(push).toHaveBeenCalledTimes(1);
    // Only live books the library actually has.
    expect(push.mock.calls[0]![0].books.map((b: Book) => b.hash)).toEqual(['a']);
  });

  it('sends nothing when there is nothing to send', async () => {
    await ensureBooksOnServer([]);
    await ensureBooksOnServer(['zzz']);
    expect(push).not.toHaveBeenCalled();
  });

  it('lets a failed send surface, so nothing is shared', async () => {
    push.mockRejectedValue(new Error('Failed to push changes'));
    await expect(ensureBooksOnServer(['a'])).rejects.toThrow('Failed to push changes');
  });
});

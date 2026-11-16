import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudiobookHandoff } from '@/hooks/useAudiobookHandoff';
import { useAudiobookStore } from '@/store/audiobookStore';

beforeEach(() => {
  useAudiobookStore.setState({
    hostMounted: false,
    bookHash: null,
    expanded: false,
    backRoute: null,
  });
});

afterEach(cleanup);

describe('useAudiobookHandoff', () => {
  it('hands the book to the app-wide player once it is there, and says it did', () => {
    const goBack = vi.fn();
    const { result } = renderHook(() => useAudiobookHandoff('h1', true, goBack));
    expect(result.current).toBe(false); // no host yet: the page keeps its own player
    expect(useAudiobookStore.getState().bookHash).toBeNull();

    act(() => useAudiobookStore.getState().setHostMounted(true));
    expect(result.current).toBe(true);
    expect(useAudiobookStore.getState()).toMatchObject({ bookHash: 'h1', expanded: true });

    useAudiobookStore.getState().backRoute?.();
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('waits until the library is ready, and ignores a page that is not showing an audiobook', () => {
    useAudiobookStore.setState({ hostMounted: true });
    const { result, rerender, unmount } = renderHook(
      ({ ready }) => useAudiobookHandoff('h1', ready, vi.fn()),
      {
        initialProps: { ready: false },
      },
    );
    expect(result.current).toBe(false);
    expect(useAudiobookStore.getState().bookHash).toBeNull();
    rerender({ ready: true });
    expect(useAudiobookStore.getState().bookHash).toBe('h1');

    unmount();
    useAudiobookStore.setState({ bookHash: null, expanded: false });
    const none = renderHook(() => useAudiobookHandoff(undefined, true, vi.fn()));
    expect(none.result.current).toBe(false);
    expect(useAudiobookStore.getState().bookHash).toBeNull();
  });

  it('does not reopen a book the listener already closed, when only the callback changes', () => {
    useAudiobookStore.setState({ hostMounted: true });
    const { rerender } = renderHook(({ cb }) => useAudiobookHandoff('h1', true, cb), {
      initialProps: { cb: vi.fn() },
    });
    act(() => useAudiobookStore.getState().collapse());
    rerender({ cb: vi.fn() });
    expect(useAudiobookStore.getState().expanded).toBe(false);
  });
});

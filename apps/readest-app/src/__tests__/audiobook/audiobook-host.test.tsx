import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import { useAudiobookStore } from '@/store/audiobookStore';
import { useLibraryStore } from '@/store/libraryStore';

// The audiobook player lives above the pages: leaving the full player keeps the book playing
// behind a mini player, and the same <audio> element carries on.

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string | number>) =>
    options ? key.replace(/{{(\w+)}}/g, (_m, n) => String(options[n] ?? '')) : key,
}));
const pathname = vi.hoisted(() => ({ value: '/library' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    isDarkMode: false,
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  }),
}));
vi.mock('@/hooks/useHtmlAttribute', () => ({
  useHtmlAttribute: () => '',
  useIsEink: () => false,
}));
vi.mock('@/hooks/useUiStyle', () => ({ useUiStyle: () => ['material', vi.fn()] }));
vi.mock('@/store/deviceStore', () => {
  const state = { acquireBackKeyInterception: vi.fn(), releaseBackKeyInterception: vi.fn() };
  return { useDeviceControlStore: Object.assign(() => state, { getState: () => state }) };
});

const player = vi.hoisted(() => ({
  current: null as unknown,
}));
vi.mock('@/hooks/useAudiobook', () => ({
  bookmarkSeconds: () => 0,
  useAudiobook: () => player.current,
}));
vi.mock('@/components/audiobook/AudiobookPlayer', () => ({
  AudiobookPlayerView: ({ onBack, onScreen }: { onBack: () => void; onScreen?: boolean }) => (
    <div data-testid='full-player' data-on-screen={String(onScreen)}>
      <button onClick={onBack}>leave-player</button>
    </div>
  ),
}));

import AudiobookHost from '@/components/audiobook/AudiobookHost';

const book = {
  hash: 'hh',
  format: 'M4B',
  title: 'The Return of the King',
  author: 'Tolkien',
  createdAt: 1,
  updatedAt: 1,
} as Book;

const makePlayer = (over: Record<string, unknown> = {}) => ({
  audioProps: { ref: { current: null }, src: 'blob:x' },
  playing: false,
  position: 50,
  duration: 200,
  chapters: [
    { title: 'Synopsis', start: 0, end: 100 },
    { title: 'Prologue', start: 100, end: 200 },
  ],
  chapter: { title: 'Synopsis', start: 0, end: 100 },
  chapterIndex: 0,
  coverUrl: '',
  color: null,
  speed: 1,
  toggle: vi.fn(),
  skipBack: vi.fn(),
  skipForward: vi.fn(),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  pathname.value = '/library';
  player.current = makePlayer();
  useLibraryStore.setState({ library: [book], hashIndex: new Map([['hh', 0]]) });
  useAudiobookStore.setState({
    hostMounted: false,
    bookHash: null,
    expanded: false,
    backRoute: null,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const open = (backRoute?: () => void) =>
  act(() => useAudiobookStore.getState().open('hh', backRoute ?? null));

describe('AudiobookHost', () => {
  it('says it is there, and shows nothing while no book is loaded', () => {
    const { container } = render(<AudiobookHost />);
    expect(useAudiobookStore.getState().hostMounted).toBe(true);
    expect(container.querySelector('audio')).toBeNull();
    expect(screen.queryByTestId('full-player')).toBeNull();
  });

  it('shows the full player when a book is opened, with the one audio element', () => {
    const { container } = render(<AudiobookHost />);
    open();
    expect(screen.getByTestId('full-player')).toBeTruthy();
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(screen.queryByLabelText('Open the player')).toBeNull();
  });

  it('keeps the book playing behind a mini player when the full player is left', () => {
    const back = vi.fn();
    pathname.value = '/reader'; // the page it was opened from
    const { container, rerender } = render(<AudiobookHost />);
    open(back);
    const audio = container.querySelector('audio');
    fireEvent.click(screen.getByText('leave-player'));
    expect(back).toHaveBeenCalledTimes(1);
    expect(useAudiobookStore.getState().expanded).toBe(false);
    pathname.value = '/library'; // going back leaves the reader
    rerender(<AudiobookHost />);
    // The same audio element is still there, and the mini player shows the book.
    expect(container.querySelector('audio')).toBe(audio);
    expect(screen.getByLabelText('Open the player')).toBeTruthy();
    expect(screen.getByText('The Return of the King')).toBeTruthy();
    expect(screen.getByText('Synopsis')).toBeTruthy();
  });

  it('plays and pauses from the mini player, and opens the full player again', () => {
    render(<AudiobookHost />);
    open();
    fireEvent.click(screen.getByText('leave-player'));
    fireEvent.click(screen.getByLabelText('Play'));
    expect((player.current as { toggle: () => void }).toggle).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Open the player'));
    expect(useAudiobookStore.getState().expanded).toBe(true);
    expect(screen.getByTestId('full-player')).toBeTruthy();
  });

  it('shows Pause while playing, and how far through the book it is', () => {
    player.current = makePlayer({ playing: true, position: 100, duration: 200 });
    render(<AudiobookHost />);
    open();
    fireEvent.click(screen.getByText('leave-player'));
    expect(screen.getByLabelText('Pause')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  });

  it('shows headphones, not a broken picture, when the cover cannot be loaded', () => {
    player.current = makePlayer({ coverUrl: 'asset://missing.png' });
    const { container } = render(<AudiobookHost />);
    open();
    fireEvent.click(screen.getByText('leave-player'));
    const image = container.querySelector('.ab-mini img') as HTMLImageElement;
    expect(image).toBeTruthy();
    fireEvent.error(image);
    expect(container.querySelector('.ab-mini img')).toBeNull();
  });

  it('stops and unloads the book when the mini player is closed', () => {
    const { container } = render(<AudiobookHost />);
    open();
    fireEvent.click(screen.getByText('leave-player'));
    fireEvent.click(screen.getByLabelText('Stop and close'));
    expect(useAudiobookStore.getState().bookHash).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
  });

  it('keeps the mini player off the reader pages, where it would cover the page', () => {
    render(<AudiobookHost />);
    open();
    fireEvent.click(screen.getByText('leave-player'));
    pathname.value = '/reader/abc';
    cleanup();
    render(<AudiobookHost />);
    expect(screen.queryByLabelText('Open the player')).toBeNull();
  });

  it('goes back to the mini player when the page it was opened from is left', () => {
    const { rerender } = render(<AudiobookHost />);
    pathname.value = '/reader';
    open(() => {});
    expect(useAudiobookStore.getState().expanded).toBe(true);
    pathname.value = '/library';
    rerender(<AudiobookHost />);
    expect(useAudiobookStore.getState().expanded).toBe(false);
  });

  it('switches to another audiobook, replacing the one that was loaded', () => {
    useLibraryStore.setState({
      library: [book, { ...book, hash: 'h2', title: 'Dust' }],
      hashIndex: new Map([
        ['hh', 0],
        ['h2', 1],
      ]),
    });
    render(<AudiobookHost />);
    open();
    fireEvent.click(screen.getByText('leave-player'));
    expect(screen.getByText('The Return of the King')).toBeTruthy();
    act(() => useAudiobookStore.getState().open('h2'));
    fireEvent.click(screen.getByText('leave-player'));
    expect(screen.getByText('Dust')).toBeTruthy();
  });
});

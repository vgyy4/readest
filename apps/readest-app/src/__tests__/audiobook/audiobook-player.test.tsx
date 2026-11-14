import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import AudiobookPlayer from '@/components/audiobook/AudiobookPlayer';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string | number>) => {
    if (!options) return key;
    return key.replace(/{{(\w+)}}/g, (_match, name) => String(options[name] ?? ''));
  },
}));

const tauriInvoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauriInvoke }));

const mocks = vi.hoisted(() => ({
  appService: {
    appPlatform: 'web',
    exists: vi.fn(),
    openFile: vi.fn(),
    resolveFilePath: vi.fn(),
    getImageURL: vi.fn(),
    loadBookConfig: vi.fn(),
    saveBookConfig: vi.fn(),
  },
  updateBook: vi.fn(),
  session: { update: vi.fn(), dispose: vi.fn() },
  createSession: vi.fn(),
  parse: vi.fn(),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: mocks.appService }),
}));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ settings: {} }) }));
vi.mock('@/store/libraryStore', () => {
  const state = { updateBook: mocks.updateBook, getBookByHash: () => undefined };
  const useLibraryStore = Object.assign(() => state, { getState: () => state });
  return { useLibraryStore };
});
const parsedBook = {
  title: 'Dune',
  author: 'Frank Herbert',
  duration: 200,
  chapters: [
    { title: 'Part One', start: 0, end: 100 },
    { title: 'Part Two', start: 100, end: 200 },
  ],
};
vi.mock('@/libs/audiobook/metadata', () => ({
  parseAudiobook: (...args: unknown[]) => mocks.parse(...args),
}));
vi.mock('@/libs/audiobook/session', () => ({
  createAudiobookSession: (...args: unknown[]) => {
    mocks.createSession(...args);
    return mocks.session;
  },
}));

const book = {
  hash: 'abc',
  format: 'M4B',
  title: 'Dune',
  author: 'Frank Herbert',
  createdAt: 1,
  updatedAt: 1,
} as Book;

// jsdom does not play media: give the element the bits the player uses.
const installMedia = () => {
  const proto = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
  const state = new WeakMap<object, { t: number; paused: boolean; rate: number; d: number }>();
  const s = (el: object) => {
    if (!state.has(el)) state.set(el, { t: 0, paused: true, rate: 1, d: 200 });
    return state.get(el)!;
  };
  Object.defineProperties(proto, {
    currentTime: {
      configurable: true,
      get() {
        return s(this).t;
      },
      set(v: number) {
        s(this).t = v;
      },
    },
    duration: {
      configurable: true,
      get() {
        return s(this).d;
      },
    },
    paused: {
      configurable: true,
      get() {
        return s(this).paused;
      },
    },
    playbackRate: {
      configurable: true,
      get() {
        return s(this).rate;
      },
      set(v: number) {
        s(this).rate = v;
      },
    },
  });
  proto['play'] = vi.fn(async function (this: HTMLMediaElement) {
    s(this).paused = false;
  });
  proto['pause'] = vi.fn(function (this: HTMLMediaElement) {
    s(this).paused = true;
  });
};

const audio = () => document.querySelector('audio') as HTMLAudioElement;
const loaded = async () => {
  await waitFor(() => expect(audio().getAttribute('src')).toBeTruthy());
  fireEvent.loadedMetadata(audio());
};

beforeEach(() => {
  installMedia();
  mocks.parse.mockReset();
  mocks.parse.mockImplementation(async () => parsedBook);
  mocks.appService.exists.mockResolvedValue(true);
  mocks.appService.openFile.mockResolvedValue(new File(['x'], 'dune.m4b'));
  mocks.appService.loadBookConfig.mockResolvedValue({});
  mocks.appService.saveBookConfig.mockResolvedValue(undefined);
  mocks.updateBook.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:audio');
  localStorage.clear();
  Object.values(mocks.session).forEach((fn) => fn.mockReset());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AudiobookPlayer opening a book it has not read before', () => {
  it('starts the audio without waiting for the tags and chapters to be read', async () => {
    mocks.parse.mockImplementation(() => new Promise(() => {})); // never finishes
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await waitFor(() => expect(audio().getAttribute('src')).toBeTruthy());
    expect(screen.queryByText('Part One')).toBeNull();
  });

  it('fills in the chapters once they have been read', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    expect(await screen.findByText('Part One')).toBeTruthy();
  });

  it('still plays when the tags cannot be read', async () => {
    mocks.parse.mockRejectedValue(new Error('truncated file'));
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await waitFor(() => expect(audio().getAttribute('src')).toBeTruthy());
    await waitFor(() => expect(mocks.parse).toHaveBeenCalled());
    expect(screen.queryByText(/truncated file/)).toBeNull();
    expect(screen.getByLabelText('Play')).toBeTruthy();
  });
});

describe('AudiobookPlayer', () => {
  it('shows the book, its chapter and the transport controls', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    expect(screen.getByText('Frank Herbert')).toBeTruthy();
    expect(await screen.findByText('Part One')).toBeTruthy();
    for (const label of [
      'Previous chapter',
      'Back 20 seconds',
      'Play',
      'Forward 20 seconds',
      'Next chapter',
      'Playback speed',
      'Sleep timer',
      'Chapters',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('plays and pauses', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    fireEvent.click(screen.getByLabelText('Play'));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    fireEvent.play(audio());
    fireEvent.click(await screen.findByLabelText('Pause'));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('skips back and forward by the skip amount, which can be changed', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    audio().currentTime = 50;
    fireEvent.click(screen.getByLabelText('Forward 20 seconds'));
    expect(audio().currentTime).toBe(70);
    fireEvent.click(screen.getByLabelText('Back 20 seconds'));
    expect(audio().currentTime).toBe(50);
    // The small skip buttons never offer "Back to".
    expect(screen.queryByText(/^Back to/)).toBeNull();

    fireEvent.click(screen.getByLabelText('More'));
    fireEvent.click(screen.getByLabelText('Longer skip'));
    fireEvent.click(screen.getByLabelText('Longer skip'));
    fireEvent.click(screen.getByLabelText('Back'));
    expect(screen.getByLabelText('Forward 30 seconds')).toBeTruthy();
  });

  it('offers a way back after a chapter change, for ten seconds', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    audio().currentTime = 40;
    fireEvent.timeUpdate(audio());
    fireEvent.click(screen.getByLabelText('Next chapter'));
    expect(audio().currentTime).toBe(100);
    fireEvent.click(await screen.findByText(/^Back to/));
    expect(audio().currentTime).toBe(40);

    fireEvent.click(screen.getByLabelText('Next chapter'));
    expect(screen.getByText(/^Back to/)).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(11_000);
    });
    expect(screen.queryByText(/^Back to/)).toBeNull();
  });

  it('saves moments as bookmarks and jumps back to them', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    audio().currentTime = 75;
    fireEvent.timeUpdate(audio());
    fireEvent.click(screen.getByLabelText('Bookmarks'));
    fireEvent.click(await screen.findByText('Save this moment'));
    await waitFor(() => expect(mocks.appService.saveBookConfig).toHaveBeenCalled());
    const saved = mocks.appService.saveBookConfig.mock.calls.find(([, c]) => c.booknotes)!;
    expect(saved[1].booknotes[0]).toMatchObject({ type: 'bookmark', cfi: 'audio:75' });

    audio().currentTime = 5;
    fireEvent.timeUpdate(audio());
    fireEvent.click(await screen.findByText('1:15'));
    expect(audio().currentTime).toBe(75);
  });

  it('switches between the Material and the liquid glass style, and remembers it', async () => {
    const { unmount } = render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    const root = () => document.querySelector('.audiobook-player')!;
    expect(root().classList.contains('ab-glass')).toBe(false);
    fireEvent.click(screen.getByLabelText('More'));
    fireEvent.click(screen.getByText('Liquid glass'));
    expect(root().classList.contains('ab-glass')).toBe(true);
    unmount();

    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    expect(root().classList.contains('ab-glass')).toBe(true);
  });

  it('jumps to a chapter from the list, and between chapters', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    fireEvent.click(screen.getByLabelText('Chapters'));
    fireEvent.click(await screen.findByText('Part Two'));
    expect(audio().currentTime).toBe(100);

    audio().currentTime = 150;
    fireEvent.timeUpdate(audio());
    fireEvent.click(screen.getByLabelText('Previous chapter'));
    expect(audio().currentTime).toBe(100);
  });

  it('sets the playback speed from the speed sheet', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    fireEvent.click(screen.getByLabelText('Playback speed'));
    fireEvent.click(await screen.findByText('1.25×', { selector: 'button' }));
    expect(audio().playbackRate).toBe(1.25);
    fireEvent.click(screen.getByLabelText('Faster'));
    expect(audio().playbackRate).toBeCloseTo(1.3);
  });

  it('counts down a sleep timer and pauses at zero', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByLabelText('Sleep timer'));
    fireEvent.click(await screen.findByText('5 minutes'));
    expect(screen.getByText('5:00')).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000 + 1500);
    });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(screen.getByLabelText('Sleep timer').textContent).toBe('');
  });

  it('resumes where this profile left off', async () => {
    mocks.appService.loadBookConfig.mockResolvedValue({ location: 'audio:42' });
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    expect(audio().currentTime).toBe(42);
  });

  it("saves progress to the profile's own config and library entry when paused", async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    audio().currentTime = 61.9;
    fireEvent.timeUpdate(audio());
    fireEvent.pause(audio());
    await waitFor(() => expect(mocks.appService.saveBookConfig).toHaveBeenCalled());
    const [, config] = mocks.appService.saveBookConfig.mock.calls.at(-1)!;
    expect(config).toMatchObject({ location: 'audio:61', progress: [61, 200] });
    await waitFor(() => expect(mocks.updateBook).toHaveBeenCalled());
    const saved = mocks.updateBook.mock.calls.at(-1)![1] as Book;
    expect(saved.progress).toEqual([61, 200]);
    expect(saved.readingStatus).toBe('reading');
  });

  it('marks the book finished near the end', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    audio().currentTime = 198;
    fireEvent.timeUpdate(audio());
    fireEvent.ended(audio());
    await waitFor(() => expect(mocks.updateBook).toHaveBeenCalled());
    expect((mocks.updateBook.mock.calls.at(-1)![1] as Book).readingStatus).toBe('finished');
  });

  it('goes back', async () => {
    const onBack = vi.fn();
    render(<AudiobookPlayer book={book} onBack={onBack} />);
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  describe('on iOS (Tauri)', () => {
    beforeEach(() => {
      mocks.appService.appPlatform = 'tauri';
      (mocks.appService as Record<string, unknown>)['isIOSApp'] = true;
      mocks.appService.resolveFilePath.mockResolvedValue('/var/Readest/Books/abc/Dune.m4b');
      mocks.appService.getImageURL.mockResolvedValue('asset://localhost/Dune.m4b');
      mocks.appService.openFile.mockClear();
      tauriInvoke.mockReset();
      tauriInvoke.mockResolvedValue('http://127.0.0.1:5555/tok/audio');
    });
    afterEach(() => {
      mocks.appService.appPlatform = 'web';
      (mocks.appService as Record<string, unknown>)['isIOSApp'] = false;
    });

    it('streams from the local address, never loading the whole file into memory', async () => {
      render(<AudiobookPlayer book={book} onBack={() => {}} />);
      await waitFor(() =>
        expect(audio().getAttribute('src')).toBe('http://127.0.0.1:5555/tok/audio'),
      );
      expect(tauriInvoke).toHaveBeenCalledWith('serve_media_file', {
        filePath: '/var/Readest/Books/abc/Dune.m4b',
        mimeType: 'audio/mp4',
      });
      // The file was opened once, to read its chapters, and not again to build a blob.
      expect(mocks.appService.openFile).toHaveBeenCalledTimes(1);
      expect(URL.createObjectURL).not.toHaveBeenCalledWith(expect.any(Blob));
    });

    it('moves on to the next way when one does not play, then reports the failure', async () => {
      render(<AudiobookPlayer book={book} onBack={() => {}} />);
      await waitFor(() => expect(audio().getAttribute('src')).toContain('127.0.0.1'));
      fireEvent.error(audio());
      await waitFor(() => expect(audio().getAttribute('src')).toBe('asset://localhost/Dune.m4b'));
      fireEvent.error(audio());
      // Small enough to try as a blob, the last resort.
      await waitFor(() => expect(audio().getAttribute('src')).toBe('blob:audio'));
      fireEvent.error(audio());
      expect(await screen.findByRole('alert')).toBeTruthy();
    });
  });
});

describe('saving progress with a library that hands back a new book each time', () => {
  // The real library store replaces the book object on every update, which re-renders the player
  // with a new `book` prop. Saving must not feed on that: one pause is one save, not a loop.
  const Host = () => {
    const [current, setCurrent] = useState<Book>(book);
    mocks.updateBook.mockImplementation(async (_env: unknown, next: Book) => {
      setCurrent({ ...next });
    });
    return <AudiobookPlayer book={current} onBack={() => {}} />;
  };

  it('saves once per pause, not again and again', async () => {
    mocks.updateBook.mockClear();
    mocks.appService.saveBookConfig.mockClear();
    render(<Host />);
    await loaded();
    audio().currentTime = 60;
    fireEvent.timeUpdate(audio());
    fireEvent.click(screen.getByLabelText('Play'));
    fireEvent.play(audio());
    fireEvent.click(await screen.findByLabelText('Pause'));
    fireEvent.pause(audio());
    await waitFor(() => expect(mocks.updateBook).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(mocks.updateBook.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mocks.appService.saveBookConfig.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

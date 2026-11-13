import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import AudiobookPlayer from '@/components/audiobook/AudiobookPlayer';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string | number>) => {
    if (!options) return key;
    return key.replace(/{{(\w+)}}/g, (_match, name) => String(options[name] ?? ''));
  },
}));

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
vi.mock('@/libs/audiobook/metadata', () => ({
  parseAudiobook: async () => ({
    title: 'Dune',
    author: 'Frank Herbert',
    duration: 200,
    chapters: [
      { title: 'Part One', start: 0, end: 100 },
      { title: 'Part Two', start: 100, end: 200 },
    ],
  }),
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
  mocks.appService.exists.mockResolvedValue(true);
  mocks.appService.openFile.mockResolvedValue(new File(['x'], 'dune.m4b'));
  mocks.appService.loadBookConfig.mockResolvedValue({});
  mocks.appService.saveBookConfig.mockResolvedValue(undefined);
  mocks.updateBook.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => 'blob:audio');
  Object.values(mocks.session).forEach((fn) => fn.mockReset());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AudiobookPlayer', () => {
  it('shows the book, its chapter and the transport controls', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    expect(screen.getByText('Frank Herbert')).toBeTruthy();
    expect(await screen.findByText('Part One')).toBeTruthy();
    for (const label of [
      'Previous chapter',
      'Back 10 seconds',
      'Play',
      'Forward 30 seconds',
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

  it('skips back 10 seconds and forward 30', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    audio().currentTime = 50;
    fireEvent.click(screen.getByLabelText('Forward 30 seconds'));
    expect(audio().currentTime).toBe(80);
    fireEvent.click(screen.getByLabelText('Back 10 seconds'));
    expect(audio().currentTime).toBe(70);
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

  it('cycles the playback speed', async () => {
    render(<AudiobookPlayer book={book} onBack={() => {}} />);
    await loaded();
    fireEvent.click(screen.getByLabelText('Playback speed'));
    expect(audio().playbackRate).toBe(1.25);
    expect(screen.getByText('1.25×')).toBeTruthy();
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
});

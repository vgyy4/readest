import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentLoader } from '@/libs/document';

const mocks = vi.hoisted(() => {
  class FakeNativeSession {
    handlers: Record<string, ((arg?: number) => void) | null> = {};
    setActionHandler = (action: string, h: ((arg?: number) => void) | null) => {
      this.handlers[action] = h;
    };
    setActive = vi.fn();
    updateMetadata = vi.fn();
    updatePlaybackState = vi.fn();
  }
  return { FakeNativeSession, current: null as unknown };
});

vi.mock('@/libs/mediaSession', () => ({
  TauriMediaSession: mocks.FakeNativeSession,
  getMediaSession: () => mocks.current,
}));

const actions = () => ({
  play: vi.fn(),
  pause: vi.fn(),
  previous: vi.fn(),
  next: vi.fn(),
  seekBy: vi.fn(),
  seekTo: vi.fn(),
});
const info = { bookHash: 'abc', title: 'Dune', author: 'Frank Herbert', artwork: 'cover.png' };

describe('createAudiobookSession (native)', () => {
  let native: InstanceType<typeof mocks.FakeNativeSession>;
  beforeEach(() => {
    native = new mocks.FakeNativeSession();
    mocks.current = native;
  });

  it('wires the headset and lock screen to the player, and starts the foreground session', async () => {
    const { createAudiobookSession } = await import('@/libs/audiobook/session');
    const a = actions();
    createAudiobookSession(a, info);
    expect(native.setActive).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, bookHash: 'abc' }),
    );
    expect(native.updateMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Dune', artist: 'Frank Herbert', artwork: 'cover.png' }),
    );
    native.handlers['play']!();
    native.handlers['previoustrack']!();
    native.handlers['nexttrack']!();
    native.handlers['seekforward']!();
    native.handlers['seekbackward']!();
    native.handlers['seekto']!(90_000);
    expect(a.play).toHaveBeenCalled();
    expect(a.previous).toHaveBeenCalled();
    expect(a.next).toHaveBeenCalled();
    expect(a.seekBy).toHaveBeenCalledWith(30);
    expect(a.seekBy).toHaveBeenCalledWith(-10);
    expect(a.seekTo).toHaveBeenCalledWith(90);
  });

  it('reports the playback state in milliseconds, and toggles from the headset button', async () => {
    const { createAudiobookSession } = await import('@/libs/audiobook/session');
    const a = actions();
    const session = createAudiobookSession(a, info);
    session.update({ playing: true, position: 12.5, duration: 600, speed: 1 });
    expect(native.updatePlaybackState).toHaveBeenCalledWith({
      playing: true,
      position: 12500,
      duration: 600000,
    });
    native.handlers['toggle']!();
    expect(a.pause).toHaveBeenCalled();
    session.update({ playing: false, position: 12.5, duration: 600, speed: 1 });
    native.handlers['toggle']!();
    expect(a.play).toHaveBeenCalled();
  });

  it('releases the session when the player closes', async () => {
    const { createAudiobookSession } = await import('@/libs/audiobook/session');
    createAudiobookSession(actions(), info).dispose();
    expect(native.setActive).toHaveBeenLastCalledWith({ active: false });
    expect(native.handlers['play']).toBeNull();
  });
});

describe('createAudiobookSession (browser)', () => {
  it('drives the Media Session API', async () => {
    const handlers: Record<string, ((d?: { seekTime?: number }) => void) | null> = {};
    const web = {
      metadata: null as unknown,
      playbackState: 'none',
      setActionHandler: (a: string, h: ((d?: { seekTime?: number }) => void) | null) => {
        handlers[a] = h;
      },
      setPositionState: vi.fn(),
    };
    class FakeMetadata {
      constructor(public init: unknown) {}
    }
    vi.stubGlobal('MediaMetadata', FakeMetadata);
    mocks.current = web;
    const { createAudiobookSession } = await import('@/libs/audiobook/session');
    const a = actions();
    const session = createAudiobookSession(a, info);
    handlers['seekto']!({ seekTime: 33 });
    handlers['seekbackward']!();
    expect(a.seekTo).toHaveBeenCalledWith(33);
    expect(a.seekBy).toHaveBeenCalledWith(-10);

    session.update({ playing: true, position: 5, duration: 100, speed: 1.5 });
    expect(web.playbackState).toBe('playing');
    expect(web.setPositionState).toHaveBeenCalledWith({
      duration: 100,
      position: 5,
      playbackRate: 1.5,
    });
    session.dispose();
    expect(web.playbackState).toBe('none');
    vi.unstubAllGlobals();
  });
});

describe('importing an audio file', () => {
  it('opens as an audiobook with its own format and a title from the file name', async () => {
    const wav = new Uint8Array(44 + 16000);
    const v = new DataView(wav.buffer);
    [...'RIFF'].forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
    v.setUint32(4, 36 + 16000, true);
    [...'WAVEfmt '].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 16000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    [...'data'].forEach((c, i) => v.setUint8(36 + i, c.charCodeAt(0)));
    v.setUint32(40, 16000, true);

    const { book, format } = await new DocumentLoader(
      new File([wav], 'Some Story.wav', { type: 'audio/wav' }),
    ).open();
    expect(format).toBe('WAV');
    expect(book.metadata.title).toBe('Some Story');
    expect(book.sections).toEqual([]);
    expect(await book.getCover()).toBeNull();
  });
});

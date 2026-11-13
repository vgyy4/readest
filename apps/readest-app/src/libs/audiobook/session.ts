import { getMediaSession, TauriMediaSession } from '@/libs/mediaSession';

export interface TransportActions {
  play(): void;
  pause(): void;
  previous(): void;
  next(): void;
  seekBy(seconds: number): void;
  seekTo(seconds: number): void;
}

export interface SessionInfo {
  bookHash: string;
  title: string;
  author: string;
  artwork?: string;
  /** How far the rewind and fast-forward buttons jump. */
  skipSeconds: number;
}

export interface SessionState {
  playing: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  speed: number;
}

/**
 * Lock screen, notification and headset controls for the audiobook player.
 * It reuses the app's media session layer: the native foreground-service session
 * on Android, the native Now Playing session on iOS (which also keeps playing in
 * the background), and the browser's Media Session on the web.
 */
export const createAudiobookSession = (actions: TransportActions, info: SessionInfo) => {
  const session = getMediaSession();
  if (!session) return { update: (_state: SessionState) => {}, dispose: () => {} };
  let playing = false;

  if (session instanceof TauriMediaSession) {
    session.setActionHandler('play', actions.play);
    session.setActionHandler('pause', actions.pause);
    session.setActionHandler('toggle', () => (playing ? actions.pause() : actions.play()));
    session.setActionHandler('previoustrack', actions.previous);
    session.setActionHandler('nexttrack', actions.next);
    session.setActionHandler('seekforward', () => actions.seekBy(info.skipSeconds));
    session.setActionHandler('seekbackward', () => actions.seekBy(-info.skipSeconds));
    // The native seek contract is milliseconds.
    session.setActionHandler('seekto', (ms: number) => actions.seekTo(ms / 1000));
    void session.setActive({
      active: true,
      notificationTitle: info.title,
      notificationText: info.author,
      foregroundServiceTitle: info.title,
      foregroundServiceText: info.author,
      bookHash: info.bookHash,
      bookTitle: info.title,
      bookAuthor: info.author,
    });
    void session.updateMetadata({
      title: info.title,
      artist: info.author,
      album: info.title,
      artwork: info.artwork,
    });
    return {
      update(state: SessionState) {
        playing = state.playing;
        void session.updatePlaybackState({
          playing: state.playing,
          position: Math.round(state.position * 1000),
          duration: Math.round(state.duration * 1000),
        });
      },
      dispose() {
        void session.setActive({ active: false });
        for (const action of [
          'play',
          'pause',
          'toggle',
          'previoustrack',
          'nexttrack',
          'seekforward',
          'seekbackward',
          'seekto',
        ]) {
          session.setActionHandler(action, null);
        }
      },
    };
  }

  // Browser Media Session.
  const web = session as MediaSession;
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      web.setActionHandler(action, handler);
    } catch {
      // This browser does not support the action.
    }
  };
  set('play', actions.play);
  set('pause', actions.pause);
  set('previoustrack', actions.previous);
  set('nexttrack', actions.next);
  set('seekbackward', () => actions.seekBy(-info.skipSeconds));
  set('seekforward', () => actions.seekBy(info.skipSeconds));
  set('seekto', (details) => {
    if (details.seekTime !== undefined && details.seekTime !== null) {
      actions.seekTo(details.seekTime);
    }
  });
  web.metadata = new MediaMetadata({
    title: info.title,
    artist: info.author,
    album: info.title,
    artwork: info.artwork ? [{ src: info.artwork }] : [],
  });
  return {
    update(state: SessionState) {
      playing = state.playing;
      web.playbackState = state.playing ? 'playing' : 'paused';
      if (state.duration > 0) {
        try {
          web.setPositionState({
            duration: state.duration,
            position: Math.min(state.position, state.duration),
            playbackRate: state.speed,
          });
        } catch {
          // Position state is optional.
        }
      }
    },
    dispose() {
      for (const action of [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekbackward',
        'seekforward',
        'seekto',
      ] as MediaSessionAction[]) {
        set(action, null);
      }
      web.metadata = null;
      web.playbackState = 'none';
    },
  };
};

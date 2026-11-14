import type { CoverColor } from './palette';
import type { AudioChapter } from './player';

/**
 * What opening an audiobook needs from its file, kept after the first open. Reading it again
 * means reading tags from a file of hundreds of megabytes, through the native bridge on an
 * iPad; the cache makes every later open skip the file entirely. A book's id is a hash of
 * its content, so an entry never goes stale.
 */
export interface AudioInfoCache {
  v: 1;
  /** Seconds. */
  duration: number;
  /** Bytes. */
  size: number;
  chapters: AudioChapter[];
  /** Seconds each file of a book made of several files really lasts, once they have been heard. */
  parts?: number[];
  color?: CoverColor;
  /** The tiny blurred cover used as the background. */
  blur?: string;
}

const PREFIX = 'readest-audio-info:';
const VERSION = 1;

export const readAudioInfo = (hash: string): AudioInfoCache | null => {
  try {
    const raw = localStorage.getItem(PREFIX + hash);
    if (!raw) return null;
    const info = JSON.parse(raw) as AudioInfoCache;
    return info.v === VERSION && Array.isArray(info.chapters) && info.duration >= 0 ? info : null;
  } catch {
    return null;
  }
};

/** Add to the entry for a book; later writes keep what earlier ones stored. */
export const writeAudioInfo = (hash: string, part: Partial<Omit<AudioInfoCache, 'v'>>) => {
  try {
    const merged = {
      duration: 0,
      size: 0,
      chapters: [],
      ...readAudioInfo(hash),
      ...part,
      v: VERSION,
    };
    localStorage.setItem(PREFIX + hash, JSON.stringify(merged));
  } catch {
    // Storage full or unavailable: the book simply opens the slow way next time.
  }
};

export const forgetAudioInfo = (hash: string) => {
  try {
    localStorage.removeItem(PREFIX + hash);
  } catch {
    // Nothing to forget.
  }
};

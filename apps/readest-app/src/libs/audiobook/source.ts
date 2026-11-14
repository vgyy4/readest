import type { AudioFormat } from './formats';

/** The MIME type to give the audio element. WebKit refuses .m4b unless it is told it is MPEG-4 audio. */
export const audioMimeType = (format: AudioFormat | string): string => {
  switch (format) {
    case 'M4B':
    case 'M4A':
      return 'audio/mp4';
    case 'AAC':
      return 'audio/aac';
    case 'MP3':
      return 'audio/mpeg';
    case 'OGG':
      return 'audio/ogg';
    case 'OPUS':
      return 'audio/ogg; codecs=opus';
    case 'FLAC':
      return 'audio/flac';
    case 'WAV':
      return 'audio/wav';
    default:
      return 'audio/mpeg';
  }
};

const CHUNK = 8 * 1024 * 1024;

/**
 * A typed blob of the whole file, read in chunks so a native file is never held twice
 * in one piece. This is how iOS plays audio: its web view cannot stream media from the
 * app's custom file URLs.
 */
export const blobFromFile = async (file: Blob, type: string, chunk = CHUNK): Promise<Blob> => {
  const parts: ArrayBuffer[] = [];
  for (let offset = 0; offset < file.size; offset += chunk) {
    parts.push(await file.slice(offset, Math.min(file.size, offset + chunk)).arrayBuffer());
  }
  return new Blob(parts, { type });
};

/** MediaError codes: 2 network, 3 decode, 4 source not supported. */
export const describeMediaError = (code: number | undefined) => {
  switch (code) {
    case 2:
      return 'The audio file could not be read (network error).';
    case 3:
      return 'The audio file could not be decoded.';
    case 4:
      return 'The audio format is not supported on this device.';
    default:
      return 'This audio file could not be played.';
  }
};

export type PlaybackSource = 'loopback' | 'asset' | 'blob';

/** Past this size a file is not read into memory: a 2 GB iPad would run out. */
export const MAX_BLOB_BYTES = 120 * 1024 * 1024;

/**
 * Ways to hand a file to the <audio> element, best first; the player moves to the next one
 * when a source does not play.
 *  - loopback: a streaming address on 127.0.0.1 served by the app (needed on iOS, whose web
 *    view cannot play from the asset protocol).
 *  - asset: Tauri's asset protocol (streams, never loads the file into memory).
 *  - blob: the whole file in memory, only for files small enough, as a last resort.
 */
export const playbackPlan = ({
  tauri,
  ios,
  android = false,
  size,
}: {
  tauri: boolean;
  ios: boolean;
  android?: boolean;
  size: number;
}): PlaybackSource[] => {
  if (!tauri) return ['blob'];
  // On the phones the asset route is the slow one: the file passes through the app's request
  // handler and the media stack may read it from the start to reach a saved position, which
  // took minutes for a big book. The local address streams straight from the native server.
  const order: PlaybackSource[] = ios || android ? ['loopback', 'asset'] : ['asset', 'loopback'];
  if (size <= MAX_BLOB_BYTES) order.push('blob');
  return order;
};

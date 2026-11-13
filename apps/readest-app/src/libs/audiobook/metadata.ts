import { normalizeChapters, type AudioChapter } from './player';

export interface AudiobookInfo {
  title: string;
  author: string;
  narrator?: string;
  language?: string;
  /** Seconds. */
  duration: number;
  chapters: AudioChapter[];
  cover?: Blob;
}

const baseName = (name: string) => name.replace(/\.[^./\\]+$/, '');

/** Tags, chapters, length and cover art of an audio file (m4b chapters and ID3 CHAP included). */
export const parseAudiobook = async (file: File): Promise<AudiobookInfo> => {
  const { parseBlob } = await import('music-metadata');
  // `duration: true` makes music-metadata read every frame of an MP3 that has no length header:
  // minutes for a long book, and millions of reads through the native bridge on an iPad. Without
  // it the length is estimated from the bitrate, off by seconds at most, and the audio element
  // reports the exact one as soon as it loads.
  const { common, format } = await parseBlob(file, { duration: false, includeChapters: true });
  const duration = format.duration ?? 0;
  const title = common.album?.trim() || common.title?.trim() || baseName(file.name);
  const picture = common.picture?.[0];
  return {
    title,
    author: common.albumartist?.trim() || common.artist?.trim() || '',
    narrator: common.composer?.[0]?.trim() || undefined,
    language: common.language?.trim() || undefined,
    duration,
    chapters: normalizeChapters(format.chapters, duration, title),
    cover: picture
      ? new Blob([new Uint8Array(picture.data)], { type: picture.format || 'image/jpeg' })
      : undefined,
  };
};

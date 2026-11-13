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
  const { common, format } = await parseBlob(file, { duration: true, includeChapters: true });
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

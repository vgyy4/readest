import { normalizeChapters, type AudioChapter } from './player';

export interface AudiobookInfo {
  /** The album tag, which the files of one book share (the `title` falls back to the track title). */
  album?: string;
  /** This file's own title tag, which names its chapter in a book made of several files. */
  trackTitle?: string;
  track?: number;
  disc?: number;
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
  return audiobookInfoFrom(common, format, file.name);
};

type Tags = Awaited<ReturnType<typeof import('music-metadata').parseBlob>>;

/** What the player and the importer take from the tags of one audio file. */
export const audiobookInfoFrom = (
  common: Pick<
    Tags['common'],
    | 'album'
    | 'title'
    | 'albumartist'
    | 'artist'
    | 'composer'
    | 'language'
    | 'picture'
    | 'track'
    | 'disk'
  >,
  format: Pick<Tags['format'], 'duration' | 'chapters'>,
  fileName: string,
): AudiobookInfo => {
  const duration = format.duration ?? 0;
  const album = common.album?.trim() || undefined;
  const trackTitle = common.title?.trim() || undefined;
  const title = album || trackTitle || baseName(fileName);
  const picture = common.picture?.[0];
  return {
    album,
    trackTitle,
    track: common.track?.no ?? undefined,
    disc: common.disk?.no ?? undefined,
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

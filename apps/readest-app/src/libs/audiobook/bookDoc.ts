import type { BookDoc } from '@/libs/document';
import { parseAudiobook } from './metadata';

/**
 * What the importer needs from an audio file: title, author, language and cover.
 * An audiobook has no text sections, so the reader is replaced by the player.
 */
export const makeAudioBook = async (file: File): Promise<BookDoc> => {
  const info = await parseAudiobook(file);
  return {
    metadata: {
      title: info.title,
      author: info.author,
      language: info.language ?? 'en',
      ...(info.narrator ? { editor: info.narrator } : {}),
    },
    rendition: {},
    dir: 'ltr',
    toc: [],
    sections: [],
    splitTOCHref: () => [],
    getCover: async () => info.cover ?? null,
  };
};

/** Audio files Readest opens as audiobooks. Each is its own format so the stored file keeps its extension. */
export const AUDIO_FORMATS = ['M4B', 'M4A', 'MP3', 'AAC', 'OGG', 'OPUS', 'FLAC', 'WAV'] as const;

export type AudioFormat = (typeof AUDIO_FORMATS)[number];

export const AUDIO_EXTS: Record<AudioFormat, string> = {
  M4B: 'm4b',
  M4A: 'm4a',
  MP3: 'mp3',
  AAC: 'aac',
  OGG: 'ogg',
  OPUS: 'opus',
  FLAC: 'flac',
  WAV: 'wav',
};

export const AUDIO_MIMETYPES: Record<AudioFormat, string[]> = {
  M4B: ['audio/x-m4b', 'audio/mp4a-latm'],
  M4A: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
  MP3: ['audio/mpeg', 'audio/mp3'],
  AAC: ['audio/aac', 'audio/aacp'],
  OGG: ['audio/ogg', 'application/ogg'],
  OPUS: ['audio/opus'],
  FLAC: ['audio/flac', 'audio/x-flac'],
  WAV: ['audio/wav', 'audio/x-wav', 'audio/wave'],
};

export const isAudioFormat = (format: string): format is AudioFormat =>
  (AUDIO_FORMATS as readonly string[]).includes(format);

/** The audio format of a file, from its extension first and its MIME type second. */
export const audioFormatOf = (name: string | undefined, type: string | undefined) => {
  const ext = name?.toLowerCase().split('.').pop();
  const byExt = AUDIO_FORMATS.find((f) => AUDIO_EXTS[f] === ext);
  if (byExt) return byExt;
  return AUDIO_FORMATS.find((f) => AUDIO_MIMETYPES[f].includes(type ?? '')) ?? null;
};

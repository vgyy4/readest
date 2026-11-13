import { describe, expect, it } from 'vitest';
import { audioMimeType, blobFromFile, describeMediaError } from '@/libs/audiobook/source';

describe('audioMimeType', () => {
  it('gives WebKit a type it knows, including for .m4b', () => {
    expect(audioMimeType('M4B')).toBe('audio/mp4');
    expect(audioMimeType('M4A')).toBe('audio/mp4');
    expect(audioMimeType('MP3')).toBe('audio/mpeg');
    expect(audioMimeType('OPUS')).toBe('audio/ogg; codecs=opus');
    expect(audioMimeType('FLAC')).toBe('audio/flac');
    expect(audioMimeType('WAV')).toBe('audio/wav');
  });
});

describe('blobFromFile', () => {
  it('reads a file in chunks into one typed blob', async () => {
    const bytes = new Uint8Array(25).map((_, i) => i);
    const file = new File([bytes], 'a.m4b');
    const blob = await blobFromFile(file, 'audio/mp4', 10);
    expect(blob.type).toBe('audio/mp4');
    expect(blob.size).toBe(25);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });
});

describe('describeMediaError', () => {
  it('says what went wrong', () => {
    expect(describeMediaError(4)).toContain('not supported');
    expect(describeMediaError(3)).toContain('decod');
    expect(describeMediaError(2)).toContain('network');
    expect(describeMediaError(undefined)).toContain('could not be played');
  });
});

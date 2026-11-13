import { beforeEach, describe, expect, it } from 'vitest';
import { readAudioInfo, writeAudioInfo, forgetAudioInfo } from '@/libs/audiobook/infoCache';
import { fitChapters } from '@/libs/audiobook/player';

describe('audiobook info cache', () => {
  beforeEach(() => localStorage.clear());

  it('returns nothing for a book that was never opened', () => {
    expect(readAudioInfo('abc')).toBeNull();
  });

  it('remembers duration, chapters and size, and merges the cover look in later', () => {
    const chapters = [{ title: 'One', start: 0, end: 60 }];
    writeAudioInfo('abc', { duration: 60, size: 1234, chapters });
    writeAudioInfo('abc', {
      color: { hue: 120, saturation: 0.6 },
      blur: 'data:image/jpeg;base64,xx',
    });
    expect(readAudioInfo('abc')).toEqual({
      v: 1,
      duration: 60,
      size: 1234,
      chapters,
      color: { hue: 120, saturation: 0.6 },
      blur: 'data:image/jpeg;base64,xx',
    });
  });

  it('ignores a cache entry that is damaged or from another version', () => {
    localStorage.setItem('readest-audio-info:bad', '{nope');
    localStorage.setItem('readest-audio-info:old', JSON.stringify({ v: 0, duration: 5 }));
    expect(readAudioInfo('bad')).toBeNull();
    expect(readAudioInfo('old')).toBeNull();
  });

  it('can be forgotten', () => {
    writeAudioInfo('abc', { duration: 60, size: 1, chapters: [] });
    forgetAudioInfo('abc');
    expect(readAudioInfo('abc')).toBeNull();
  });
});

describe('fitChapters', () => {
  it('stretches the last chapter to the real duration', () => {
    const list = [
      { title: 'A', start: 0, end: 100 },
      { title: 'B', start: 100, end: 17998 },
    ];
    expect(fitChapters(list, 18000)[1]!.end).toBe(18000);
    expect(fitChapters(list, 18000)[0]).toBe(list[0]);
  });

  it('returns the same list when nothing changes', () => {
    const list = [{ title: 'A', start: 0, end: 100 }];
    expect(fitChapters(list, 100)).toBe(list);
    expect(fitChapters(list, 0)).toBe(list);
    expect(fitChapters([], 50)).toEqual([]);
  });
});

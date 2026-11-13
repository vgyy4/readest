import { describe, expect, it } from 'vitest';
import {
  chapterIndexAt,
  clampPosition,
  formatClock,
  nextSpeed,
  normalizeChapters,
  PLAYBACK_SPEEDS,
  progressFromPosition,
  sleepDeadline,
  sleepSecondsLeft,
} from '@/libs/audiobook/player';
import { isAudioFormat } from '@/libs/audiobook/formats';
import { parseAudiobook } from '@/libs/audiobook/metadata';

describe('normalizeChapters', () => {
  it('turns tagged chapters into seconds, sorted, each ending where the next starts', () => {
    const chapters = normalizeChapters(
      [
        { title: 'Two', start: 2000, timeScale: 1000 },
        { title: 'One', start: 0, end: 2000, timeScale: 1000 },
        { title: '', start: 30, end: 60 },
      ],
      90,
    );
    expect(chapters).toEqual([
      { title: 'One', start: 0, end: 2 },
      { title: 'Two', start: 2, end: 30 },
      { title: 'Chapter 3', start: 30, end: 90 },
    ]);
  });

  it('falls back to one chapter for the whole book', () => {
    expect(normalizeChapters(undefined, 100, 'My Book')).toEqual([
      { title: 'My Book', start: 0, end: 100 },
    ]);
    expect(normalizeChapters([], 100)[0]).toMatchObject({ start: 0, end: 100 });
  });
});

describe('player helpers', () => {
  const chapters = [
    { title: 'A', start: 0, end: 10 },
    { title: 'B', start: 10, end: 20 },
  ];

  it('finds the chapter a position is in', () => {
    expect(chapterIndexAt(chapters, 0)).toBe(0);
    expect(chapterIndexAt(chapters, 9.9)).toBe(0);
    expect(chapterIndexAt(chapters, 10)).toBe(1);
    expect(chapterIndexAt(chapters, 99)).toBe(1);
  });

  it('formats a clock as m:ss or h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('keeps a position inside the book', () => {
    expect(clampPosition(-3, 100)).toBe(0);
    expect(clampPosition(150, 100)).toBe(100);
    expect(clampPosition(40, 100)).toBe(40);
  });

  it('steps through the playback speeds and wraps around', () => {
    expect(PLAYBACK_SPEEDS).toContain(1);
    expect(nextSpeed(1)).toBeGreaterThan(1);
    expect(nextSpeed(PLAYBACK_SPEEDS[PLAYBACK_SPEEDS.length - 1]!)).toBe(PLAYBACK_SPEEDS[0]);
    expect(nextSpeed(1.1)).toBe(PLAYBACK_SPEEDS.find((s) => s > 1.1));
  });

  it('keeps progress as whole seconds, so it fits the books table and syncs', () => {
    expect(progressFromPosition(61.9, 3600.4)).toEqual([61, 3600]);
    expect(progressFromPosition(0, 0)).toEqual([0, 0]);
  });
});

describe('sleep timer', () => {
  it('counts down from minutes, or to the end of the chapter', () => {
    const now = 1_000_000;
    expect(sleepDeadline({ kind: 'minutes', minutes: 15 }, now, 0, 0)).toBe(now + 15 * 60_000);
    expect(sleepDeadline({ kind: 'chapter' }, now, 100, 130)).toBe(now + 30_000);
    expect(sleepDeadline(null, now, 0, 0)).toBeNull();
  });

  it('reports what is left, never below zero', () => {
    expect(sleepSecondsLeft(10_000, 4_000)).toBe(6);
    expect(sleepSecondsLeft(10_000, 20_000)).toBe(0);
    expect(sleepSecondsLeft(null, 1)).toBeNull();
  });

  it('adjusts for the playback speed when ending at a chapter', () => {
    expect(sleepDeadline({ kind: 'chapter' }, 0, 0, 60, 2)).toBe(30_000);
  });
});

describe('isAudioFormat', () => {
  it('recognizes the audio formats and nothing else', () => {
    for (const f of ['M4B', 'M4A', 'MP3', 'AAC', 'OGG', 'OPUS', 'FLAC', 'WAV']) {
      expect(isAudioFormat(f)).toBe(true);
    }
    for (const f of ['EPUB', 'PDF', 'TXT', 'CBZ']) expect(isAudioFormat(f)).toBe(false);
  });
});

// A real, valid one-second mono 8 kHz WAV (PCM silence).
const makeWav = (seconds: number) => {
  const sampleRate = 8000;
  const dataSize = sampleRate * seconds * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const write = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  write(36, 'data');
  v.setUint32(40, dataSize, true);
  return buf;
};

describe('parseAudiobook', () => {
  it('reads the duration and names an untagged file after its file name', async () => {
    const file = new File([makeWav(3)], 'My Great Book.wav', { type: 'audio/wav' });
    const info = await parseAudiobook(file);
    expect(info.duration).toBeCloseTo(3, 1);
    expect(info.title).toBe('My Great Book');
    expect(info.chapters).toHaveLength(1);
    expect(info.chapters[0]).toMatchObject({ start: 0 });
  });
});

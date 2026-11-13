import { describe, expect, it } from 'vitest';
import {
  bookPercent,
  chapterSegments,
  clampSkip,
  clampSpeed,
  DEFAULT_SKIP_SECONDS,
  formatRemainingInChapter,
  isUndoableJump,
  jumpPill,
  JUMP_VISIBLE_MS,
  remainingAtSpeed,
  SPEED_PRESETS,
} from '@/libs/audiobook/player';
import { buildPalette, dominantColor } from '@/libs/audiobook/palette';
import { playButtonPolygon } from '@/libs/audiobook/shapes';

const chapters = [
  { title: 'A', start: 0, end: 100 },
  { title: 'B', start: 100, end: 400 },
  { title: 'C', start: 400, end: 500 },
];

describe('book progress', () => {
  it('splits the book into one segment per chapter, sized by its length', () => {
    expect(chapterSegments(chapters, 500)).toEqual([0.2, 0.6, 0.2]);
    expect(chapterSegments([], 0)).toEqual([]);
  });

  it('rounds the percentage of the book', () => {
    expect(bookPercent(125, 500)).toBe(25);
    expect(bookPercent(0, 0)).toBe(0);
    expect(bookPercent(999, 500)).toBe(100);
  });

  it('shows the time left at the playback speed', () => {
    expect(remainingAtSpeed(100, 500, 1)).toBe(400);
    expect(remainingAtSpeed(100, 500, 2)).toBe(200);
    expect(remainingAtSpeed(600, 500, 1)).toBe(0);
    expect(remainingAtSpeed(0, 100, 0)).toBe(1000);
  });

  it('shows the time left in the chapter with a minus sign', () => {
    expect(formatRemainingInChapter(17 * 60 + 35, 29 * 60)).toBe('-11:25');
    expect(formatRemainingInChapter(10, 5)).toBe('-0:00');
  });
});

describe('"Back to" after a jump', () => {
  it('offers it for a chapter change, a bookmark, or a seek of 30 seconds or more', () => {
    expect(isUndoableJump('chapter', 50, 150, chapters)).toBe(true);
    expect(isUndoableJump('bookmark', 10, 12, chapters)).toBe(true);
    expect(isUndoableJump('seek', 10, 60, chapters)).toBe(true);
    expect(isUndoableJump('seek', 10, 39, chapters)).toBe(false);
  });

  it('treats a seek into another chapter as a jump, and the skip buttons as none', () => {
    expect(isUndoableJump('seek', 95, 105, chapters)).toBe(true);
    expect(isUndoableJump('skip', 10, 30, chapters)).toBe(false);
  });

  it('names the place to go back to, with the chapter only when it differs', () => {
    const jump = { id: 1, from: 6 * 60 + 43, at: 1000 };
    expect(jumpPill(jump, 2000, [{ title: 'A', start: 0, end: 900 }], 0)).toMatchObject({
      time: '6:43',
      chapterNumber: undefined,
    });
    const far = { id: 2, from: 120, at: 1000 };
    expect(jumpPill(far, 2000, chapters, 2)).toMatchObject({ time: '0:20', chapterNumber: 2 });
  });

  it('disappears after ten seconds', () => {
    const jump = { id: 1, from: 50, at: 0 };
    expect(jumpPill(jump, JUMP_VISIBLE_MS - 1, chapters, 0)).not.toBeNull();
    expect(jumpPill(jump, JUMP_VISIBLE_MS, chapters, 0)).toBeNull();
    expect(jumpPill(null, 0, chapters, 0)).toBeNull();
  });
});

describe('settings ranges', () => {
  it('keeps the speed between 0.5 and 3 in steps of 0.05', () => {
    expect(clampSpeed(0.2)).toBe(0.5);
    expect(clampSpeed(4)).toBe(3);
    expect(clampSpeed(1.234)).toBe(1.25);
    expect(SPEED_PRESETS).toEqual([0.75, 1, 1.25, 1.5, 2]);
  });

  it('keeps the skip amount between 5 and 60 seconds, defaulting to 20', () => {
    expect(DEFAULT_SKIP_SECONDS).toBe(20);
    expect(clampSkip(1)).toBe(5);
    expect(clampSkip(99)).toBe(60);
    expect(clampSkip(23)).toBe(25);
  });
});

describe('cover colors', () => {
  const pixels = (...rgb: [number, number, number][]) =>
    new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r, g, b, 255]));

  it('picks the colorful part of the cover and ignores gray', () => {
    const color = dominantColor(
      pixels([128, 128, 128], [130, 130, 130], [250, 120, 20], [245, 125, 25], [240, 118, 30]),
    );
    expect(color.hue).toBeGreaterThan(15);
    expect(color.hue).toBeLessThan(35);
    expect(color.saturation).toBeGreaterThan(0.5);
  });

  it('falls back to blue for a cover with no color', () => {
    expect(dominantColor(pixels([20, 20, 20], [200, 200, 200])).hue).toBe(215);
    expect(dominantColor(new Uint8ClampedArray()).hue).toBe(215);
  });

  it('makes a light palette and a dark palette from the same hue', () => {
    const light = buildPalette({ hue: 40, saturation: 0.9 }, false);
    const dark = buildPalette({ hue: 40, saturation: 0.9 }, true);
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    expect(light['--ab-primary']).toMatch(/^hsl\(40,/);
    expect(light['--ab-bg-top']).not.toBe(dark['--ab-bg-top']);
    const lightness = (v: string) => Number(v.match(/(\d+(?:\.\d+)?)%\)$/)![1]);
    expect(lightness(light['--ab-bg-top']!)).toBeGreaterThan(lightness(dark['--ab-bg-top']!));
  });
});

describe('play button shape', () => {
  it('has the same number of points paused and playing, so the shape can morph', () => {
    const count = (s: string) => s.match(/%/g)!.length / 2;
    expect(count(playButtonPolygon(false))).toBe(count(playButtonPolygon(true)));
    expect(playButtonPolygon(false)).not.toBe(playButtonPolygon(true));
    expect(playButtonPolygon(true)).toMatch(/^polygon\(/);
  });
});

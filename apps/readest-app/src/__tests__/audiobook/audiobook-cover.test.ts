import { describe, expect, it } from 'vitest';
import { fitWithin, shrinkCover } from '@/libs/audiobook/cover';

describe('fitWithin', () => {
  it('scales the longer side down to the limit and keeps the proportions', () => {
    expect(fitWithin(3000, 3000, 720)).toEqual({ width: 720, height: 720 });
    expect(fitWithin(4000, 2000, 800)).toEqual({ width: 800, height: 400 });
    expect(fitWithin(1000, 2000, 500)).toEqual({ width: 250, height: 500 });
  });

  it('never makes a small picture bigger', () => {
    expect(fitWithin(300, 400, 720)).toEqual({ width: 300, height: 400 });
  });

  it('never returns a zero-sized picture', () => {
    expect(fitWithin(1, 5000, 100)).toEqual({ width: 1, height: 100 });
  });
});

describe('shrinkCover', () => {
  it('hands back the original when the picture cannot be decoded here', async () => {
    const cover = new Blob(['not really a picture'], { type: 'image/jpeg' });
    expect(await shrinkCover(cover)).toBe(cover);
  });
});

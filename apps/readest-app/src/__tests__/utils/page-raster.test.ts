import { describe, expect, it } from 'vitest';
import { fontFor, isTransparent, transformText } from '@/utils/pageRaster';

describe('page raster helpers', () => {
  it('builds a canvas font from the computed style', () => {
    expect(
      fontFor({
        fontStyle: 'italic',
        fontVariantCaps: 'small-caps',
        fontWeight: '700',
        fontSize: '20px',
        fontFamily: 'Georgia, serif',
      }),
    ).toBe('italic small-caps 700 20px Georgia, serif');
    expect(
      fontFor({ fontStyle: 'normal', fontWeight: '400', fontSize: '16px', fontFamily: 'serif' }),
    ).toBe('400 16px serif');
  });

  it('applies text-transform', () => {
    expect(transformText('hello world', 'uppercase')).toBe('HELLO WORLD');
    expect(transformText('HELLO', 'lowercase')).toBe('hello');
    expect(transformText('hello big world', 'capitalize')).toBe('Hello Big World');
    expect(transformText('hello', 'none')).toBe('hello');
  });

  it('knows a see-through colour', () => {
    expect(isTransparent('transparent')).toBe(true);
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true);
    expect(isTransparent('rgba(10, 20, 30, 0.5)')).toBe(false);
    expect(isTransparent('rgb(10, 20, 30)')).toBe(false);
  });
});

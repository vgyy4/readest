import { describe, expect, it } from 'vitest';
import { bookFontOf, FONT_FACE_KEYS, isFontFaceKey, pickBookFont } from '@/utils/fontChoice';

const known = { serif: ['Lora', 'Georgia'], sans: ['Lato', 'Roboto'] };

describe('the font a book is shown in', () => {
  it('is the face of the style in use', () => {
    const faces = { serifFont: 'Lora', sansSerifFont: 'Lato' };
    expect(bookFontOf({ defaultFont: 'Serif', ...faces })).toBe('Lora');
    expect(bookFontOf({ defaultFont: 'Sans-serif', ...faces })).toBe('Lato');
  });
});

describe('choosing a font in the one Book Font field', () => {
  it('a serif font sets the serif style and its face', () => {
    expect(pickBookFont('Lora', { defaultFont: 'Sans-serif' }, known)).toEqual({
      defaultFont: 'Serif',
      serifFont: 'Lora',
    });
  });

  it('a sans-serif font sets the sans-serif style and its face', () => {
    expect(pickBookFont('Lato', { defaultFont: 'Serif' }, known)).toEqual({
      defaultFont: 'Sans-serif',
      sansSerifFont: 'Lato',
    });
  });

  it('any other font becomes the face of the style already in use', () => {
    expect(pickBookFont('My Font', { defaultFont: 'Serif' }, known)).toEqual({
      defaultFont: 'Serif',
      serifFont: 'My Font',
    });
    expect(pickBookFont('My Font', { defaultFont: 'Sans-serif' }, known)).toEqual({
      defaultFont: 'Sans-serif',
      sansSerifFont: 'My Font',
    });
  });
});

describe('the settings that decide the font', () => {
  it('knows them, and leaves the size and the rest to the global settings', () => {
    expect(isFontFaceKey('serifFont')).toBe(true);
    expect(isFontFaceKey('overrideFont')).toBe(true);
    expect(isFontFaceKey('defaultFontSize')).toBe(false);
    expect(isFontFaceKey('theme')).toBe(false);
    expect(FONT_FACE_KEYS).toContain('monospaceFont');
  });
});

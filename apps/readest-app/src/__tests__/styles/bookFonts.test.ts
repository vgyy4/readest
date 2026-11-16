import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOOK_FONTS,
  BOOK_SANS_SERIF_FONTS,
  BOOK_SERIF_FONTS,
  getBookFontFaces,
} from '@/styles/bookFonts';
import { mountAdditionalFonts } from '@/styles/fonts';
import { SANS_SERIF_FONTS, SERIF_FONTS } from '@/services/constants';

const dir = join(process.cwd(), 'public', 'fonts', 'book');

describe('bundled book fonts', () => {
  it('has every file it lists', () => {
    for (const { family, faces } of BOOK_FONTS) {
      expect(faces.length, family).toBeGreaterThan(0);
      for (const [, , , file] of faces) expect(existsSync(join(dir, file)), file).toBe(true);
    }
  });

  it('offers the faces people look for in a book font', () => {
    for (const family of [
      'EB Garamond', // Garamond
      'Libre Baskerville', // Baskerville
      'Libre Caslon Text', // Caslon
      'Gelasio', // Georgia's open twin
      'Source Serif 4',
      'Charis SIL', // Charter's cousin
      'Zilla Slab', // a Caecilia-like slab
      'Lora',
      'Cardo', // Palatino-like
    ]) {
      expect(BOOK_SERIF_FONTS, family).toContain(family);
    }
    expect(BOOK_SANS_SERIF_FONTS).toEqual(
      expect.arrayContaining(['Lato', 'Montserrat', 'Atkinson Hyperlegible', 'OpenDyslexic']),
    );
  });

  it('lists each family once, and none the app already offers', () => {
    const names = BOOK_FONTS.map((f) => f.family);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(SERIF_FONTS).not.toContain(name);
      expect(SANS_SERIF_FONTS).not.toContain(name);
    }
  });

  it('writes a face for each file, from the address given, with the weights it can do', () => {
    const css = getBookFontFaces('https://app.example');
    expect(css).toContain('font-family: "EB Garamond"');
    expect(css).toContain(
      'src: url("https://app.example/fonts/book/eb-garamond-latin-wght-normal.woff2")',
    );
    expect(css).toContain('font-weight: 400 800');
    expect(css.match(/@font-face/g)).toHaveLength(BOOK_FONTS.flatMap((f) => f.faces).length);
    // A file is fetched only when text needs it.
    expect(css).toContain('unicode-range: U+0100-02BA');
  });

  it("is mounted in a book's document", async () => {
    const doc = document.implementation.createHTMLDocument('book');
    await mountAdditionalFonts(doc);
    const styles = Array.from(doc.head.querySelectorAll('style'))
      .map((s) => s.textContent)
      .join('');
    expect(styles).toContain('font-family: "Libre Baskerville"');
  });
});

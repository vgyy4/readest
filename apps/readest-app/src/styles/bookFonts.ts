/**
 * Fonts bundled with the app for reading (all under the SIL Open Font License; see
 * public/fonts/book/LICENSES.md). They work offline, unlike the ones the app fetches from Google, and
 * cover the faces people ask for in a book font: Garamond, Baskerville, Caslon, Georgia's open
 * twin (Gelasio), Source Serif, Literata-like Newsreader, Charter's open cousin (Charis SIL),
 * a slab like Caecilia (Zilla Slab), and sans faces for reference books, with Atkinson Hyperlegible
 * and OpenDyslexic for readers who need them. Only the Latin subsets are bundled; the browser
 * downloads a file only when text in that family needs it.
 *
 * Face: [subset, style, weight (a range for variable fonts), file in /fonts/book/].
 *
 * Generated from the fontsource packages; keep the list and the files in step.
 */
export type BookFontFace = [
  subset: 'latin' | 'latin-ext',
  style: 'normal' | 'italic',
  weight: string,
  file: string,
];

export interface BookFont {
  family: string;
  kind: 'serif' | 'sans';
  faces: BookFontFace[];
}

export const BOOK_FONTS: BookFont[] = [
  {
    family: 'EB Garamond',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400 800', 'eb-garamond-latin-wght-italic.woff2'],
      ['latin', 'normal', '400 800', 'eb-garamond-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '400 800', 'eb-garamond-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '400 800', 'eb-garamond-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Libre Baskerville',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400 700', 'libre-baskerville-latin-wght-italic.woff2'],
      ['latin', 'normal', '400 700', 'libre-baskerville-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '400 700', 'libre-baskerville-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '400 700', 'libre-baskerville-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Libre Caslon Text',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400', 'libre-caslon-text-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'libre-caslon-text-latin-400-normal.woff2'],
      ['latin', 'normal', '700', 'libre-caslon-text-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'libre-caslon-text-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'libre-caslon-text-latin-ext-400-normal.woff2'],
      ['latin-ext', 'normal', '700', 'libre-caslon-text-latin-ext-700-normal.woff2'],
    ],
  },
  {
    family: 'Gelasio',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400 700', 'gelasio-latin-wght-italic.woff2'],
      ['latin', 'normal', '400 700', 'gelasio-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '400 700', 'gelasio-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '400 700', 'gelasio-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Source Serif 4',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '200 900', 'source-serif-4-latin-wght-italic.woff2'],
      ['latin', 'normal', '200 900', 'source-serif-4-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '200 900', 'source-serif-4-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '200 900', 'source-serif-4-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Crimson Pro',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '200 900', 'crimson-pro-latin-wght-italic.woff2'],
      ['latin', 'normal', '200 900', 'crimson-pro-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '200 900', 'crimson-pro-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '200 900', 'crimson-pro-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Lora',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400 700', 'lora-latin-wght-italic.woff2'],
      ['latin', 'normal', '400 700', 'lora-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '400 700', 'lora-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '400 700', 'lora-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Spectral',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400', 'spectral-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'spectral-latin-400-normal.woff2'],
      ['latin', 'italic', '700', 'spectral-latin-700-italic.woff2'],
      ['latin', 'normal', '700', 'spectral-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'spectral-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'spectral-latin-ext-400-normal.woff2'],
      ['latin-ext', 'italic', '700', 'spectral-latin-ext-700-italic.woff2'],
      ['latin-ext', 'normal', '700', 'spectral-latin-ext-700-normal.woff2'],
    ],
  },
  {
    family: 'Cardo',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400', 'cardo-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'cardo-latin-400-normal.woff2'],
      ['latin', 'normal', '700', 'cardo-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'cardo-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'cardo-latin-ext-400-normal.woff2'],
      ['latin-ext', 'normal', '700', 'cardo-latin-ext-700-normal.woff2'],
    ],
  },
  {
    family: 'Alegreya',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400 900', 'alegreya-latin-wght-italic.woff2'],
      ['latin', 'normal', '400 900', 'alegreya-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '400 900', 'alegreya-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '400 900', 'alegreya-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Noto Serif',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '100 900', 'noto-serif-latin-wght-italic.woff2'],
      ['latin', 'normal', '100 900', 'noto-serif-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '100 900', 'noto-serif-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '100 900', 'noto-serif-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Playfair Display',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400 900', 'playfair-display-latin-wght-italic.woff2'],
      ['latin', 'normal', '400 900', 'playfair-display-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '400 900', 'playfair-display-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '400 900', 'playfair-display-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Cormorant Garamond',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '300 700', 'cormorant-garamond-latin-wght-italic.woff2'],
      ['latin', 'normal', '300 700', 'cormorant-garamond-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '300 700', 'cormorant-garamond-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '300 700', 'cormorant-garamond-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Newsreader',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '200 800', 'newsreader-latin-wght-italic.woff2'],
      ['latin', 'normal', '200 800', 'newsreader-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '200 800', 'newsreader-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '200 800', 'newsreader-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Charis SIL',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400', 'charis-sil-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'charis-sil-latin-400-normal.woff2'],
      ['latin', 'italic', '700', 'charis-sil-latin-700-italic.woff2'],
      ['latin', 'normal', '700', 'charis-sil-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'charis-sil-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'charis-sil-latin-ext-400-normal.woff2'],
      ['latin-ext', 'italic', '700', 'charis-sil-latin-ext-700-italic.woff2'],
      ['latin-ext', 'normal', '700', 'charis-sil-latin-ext-700-normal.woff2'],
    ],
  },
  {
    family: 'Gentium Book Plus',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400', 'gentium-book-plus-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'gentium-book-plus-latin-400-normal.woff2'],
      ['latin', 'italic', '700', 'gentium-book-plus-latin-700-italic.woff2'],
      ['latin', 'normal', '700', 'gentium-book-plus-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'gentium-book-plus-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'gentium-book-plus-latin-ext-400-normal.woff2'],
      ['latin-ext', 'italic', '700', 'gentium-book-plus-latin-ext-700-italic.woff2'],
      ['latin-ext', 'normal', '700', 'gentium-book-plus-latin-ext-700-normal.woff2'],
    ],
  },
  {
    family: 'Zilla Slab',
    kind: 'serif',
    faces: [
      ['latin', 'italic', '400', 'zilla-slab-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'zilla-slab-latin-400-normal.woff2'],
      ['latin', 'italic', '700', 'zilla-slab-latin-700-italic.woff2'],
      ['latin', 'normal', '700', 'zilla-slab-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'zilla-slab-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'zilla-slab-latin-ext-400-normal.woff2'],
      ['latin-ext', 'italic', '700', 'zilla-slab-latin-ext-700-italic.woff2'],
      ['latin-ext', 'normal', '700', 'zilla-slab-latin-ext-700-normal.woff2'],
    ],
  },
  {
    family: 'Atkinson Hyperlegible',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '400', 'atkinson-hyperlegible-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'atkinson-hyperlegible-latin-400-normal.woff2'],
      ['latin', 'italic', '700', 'atkinson-hyperlegible-latin-700-italic.woff2'],
      ['latin', 'normal', '700', 'atkinson-hyperlegible-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'atkinson-hyperlegible-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'atkinson-hyperlegible-latin-ext-400-normal.woff2'],
      ['latin-ext', 'italic', '700', 'atkinson-hyperlegible-latin-ext-700-italic.woff2'],
      ['latin-ext', 'normal', '700', 'atkinson-hyperlegible-latin-ext-700-normal.woff2'],
    ],
  },
  {
    family: 'OpenDyslexic',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '400', 'opendyslexic-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'opendyslexic-latin-400-normal.woff2'],
      ['latin', 'italic', '700', 'opendyslexic-latin-700-italic.woff2'],
      ['latin', 'normal', '700', 'opendyslexic-latin-700-normal.woff2'],
    ],
  },
  {
    family: 'Lato',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '400', 'lato-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'lato-latin-400-normal.woff2'],
      ['latin', 'italic', '700', 'lato-latin-700-italic.woff2'],
      ['latin', 'normal', '700', 'lato-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'lato-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'lato-latin-ext-400-normal.woff2'],
      ['latin-ext', 'italic', '700', 'lato-latin-ext-700-italic.woff2'],
      ['latin-ext', 'normal', '700', 'lato-latin-ext-700-normal.woff2'],
    ],
  },
  {
    family: 'Montserrat',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '100 900', 'montserrat-latin-wght-italic.woff2'],
      ['latin', 'normal', '100 900', 'montserrat-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '100 900', 'montserrat-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '100 900', 'montserrat-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Jost',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '100 900', 'jost-latin-wght-italic.woff2'],
      ['latin', 'normal', '100 900', 'jost-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '100 900', 'jost-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '100 900', 'jost-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Lexend',
    kind: 'sans',
    faces: [
      ['latin', 'normal', '100 900', 'lexend-latin-wght-normal.woff2'],
      ['latin-ext', 'normal', '100 900', 'lexend-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Nunito Sans',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '200 1000', 'nunito-sans-latin-wght-italic.woff2'],
      ['latin', 'normal', '200 1000', 'nunito-sans-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '200 1000', 'nunito-sans-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '200 1000', 'nunito-sans-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Source Sans 3',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '200 900', 'source-sans-3-latin-wght-italic.woff2'],
      ['latin', 'normal', '200 900', 'source-sans-3-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '200 900', 'source-sans-3-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '200 900', 'source-sans-3-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Libre Franklin',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '100 900', 'libre-franklin-latin-wght-italic.woff2'],
      ['latin', 'normal', '100 900', 'libre-franklin-latin-wght-normal.woff2'],
      ['latin-ext', 'italic', '100 900', 'libre-franklin-latin-ext-wght-italic.woff2'],
      ['latin-ext', 'normal', '100 900', 'libre-franklin-latin-ext-wght-normal.woff2'],
    ],
  },
  {
    family: 'Arimo',
    kind: 'sans',
    faces: [
      ['latin', 'italic', '400', 'arimo-latin-400-italic.woff2'],
      ['latin', 'normal', '400', 'arimo-latin-400-normal.woff2'],
      ['latin', 'italic', '700', 'arimo-latin-700-italic.woff2'],
      ['latin', 'normal', '700', 'arimo-latin-700-normal.woff2'],
      ['latin-ext', 'italic', '400', 'arimo-latin-ext-400-italic.woff2'],
      ['latin-ext', 'normal', '400', 'arimo-latin-ext-400-normal.woff2'],
      ['latin-ext', 'italic', '700', 'arimo-latin-ext-700-italic.woff2'],
      ['latin-ext', 'normal', '700', 'arimo-latin-ext-700-normal.woff2'],
    ],
  },
];

export const BOOK_SERIF_FONTS = BOOK_FONTS.filter((f) => f.kind === 'serif').map((f) => f.family);
export const BOOK_SANS_SERIF_FONTS = BOOK_FONTS.filter((f) => f.kind === 'sans').map(
  (f) => f.family,
);

const UNICODE_RANGES: Record<BookFontFace[0], string> = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

/**
 * The @font-face rules of the bundled fonts. `base` is where /fonts/book/ is served from: a book's
 * iframe cannot resolve a relative address, so callers pass the app's own origin.
 */
export const getBookFontFaces = (base: string): string =>
  BOOK_FONTS.flatMap(({ family, faces }) =>
    faces.map(
      ([subset, style, weight, file]) => `@font-face {
  font-family: "${family}";
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url("${base}/fonts/book/${file}") format("woff2");
  unicode-range: ${UNICODE_RANGES[subset]};
}`,
    ),
  ).join('\n');

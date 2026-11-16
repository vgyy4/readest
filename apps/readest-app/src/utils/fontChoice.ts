import type { ViewSettings } from '@/types/book';

/**
 * The view settings that decide which font a book is shown in. A book can have its own values for
 * these (see `ownFonts`) while everything else still follows the global settings.
 */
export const FONT_FACE_KEYS = [
  'defaultFont',
  'serifFont',
  'sansSerifFont',
  'monospaceFont',
  'defaultCJKFont',
  'overrideFont',
  'fontWeight',
] as const satisfies readonly (keyof ViewSettings)[];

export type FontFaceKey = (typeof FONT_FACE_KEYS)[number];

export const isFontFaceKey = (key: string): key is FontFaceKey =>
  (FONT_FACE_KEYS as readonly string[]).includes(key);

type FontKind = 'Serif' | 'Sans-serif';

/** The font the text of a book is shown in: the face of the style (serif or sans-serif) in use. */
export const bookFontOf = (
  settings: Pick<ViewSettings, 'defaultFont' | 'serifFont' | 'sansSerifFont'>,
): string => (settings.defaultFont === 'Serif' ? settings.serifFont : settings.sansSerifFont);

/**
 * What picking `font` in the single "Book Font" field changes. A font known to be serif (or
 * sans-serif) sets that style and its face; any other (a font the user added, one of the system's)
 * becomes the face of the style already in use, so choosing it never switches the style by surprise.
 */
export const pickBookFont = (
  font: string,
  current: Pick<ViewSettings, 'defaultFont'>,
  known: { serif: readonly string[]; sans: readonly string[] },
): { defaultFont: FontKind } & Partial<Pick<ViewSettings, 'serifFont' | 'sansSerifFont'>> => {
  const kind: FontKind = known.serif.includes(font)
    ? 'Serif'
    : known.sans.includes(font)
      ? 'Sans-serif'
      : current.defaultFont === 'Serif'
        ? 'Serif'
        : 'Sans-serif';
  return kind === 'Serif'
    ? { defaultFont: kind, serifFont: font }
    : { defaultFont: kind, sansSerifFont: font };
};

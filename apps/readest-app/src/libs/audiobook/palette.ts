export interface CoverColor {
  /** 0 to 360. */
  hue: number;
  /** 0 to 1. */
  saturation: number;
}

const FALLBACK: CoverColor = { hue: 215, saturation: 0.7 };

/**
 * The most colorful hue in a cover's pixels (RGBA), weighting each pixel by how
 * saturated and how bright it is, so gray and near-black borders do not count.
 * A cover with no color gets Voice's blue.
 */
export const dominantColor = (rgba: Uint8ClampedArray): CoverColor => {
  const buckets = new Float64Array(36);
  const saturationSum = new Float64Array(36);
  let weightSum = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i]! / 255;
    const g = rgba[i + 1]! / 255;
    const b = rgba[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (max < 0.15 || delta < 0.12) continue;
    const saturation = delta / max;
    let hue = 0;
    if (delta !== 0) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
    }
    hue = (hue * 60 + 360) % 360;
    const weight = saturation * max;
    const bucket = Math.min(35, Math.floor(hue / 10));
    buckets[bucket]! += weight;
    saturationSum[bucket]! += saturation * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return FALLBACK;
  let best = 0;
  for (let i = 1; i < 36; i++) if (buckets[i]! > buckets[best]!) best = i;
  return {
    hue: best * 10 + 5,
    saturation: Math.min(0.95, Math.max(0.5, saturationSum[best]! / buckets[best]!)),
  };
};

const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

/** The player's colors, as CSS variables, tinted from the cover like Voice's dynamic scheme. */
export const buildPalette = ({ hue, saturation }: CoverColor, dark: boolean) => {
  const s = Math.max(0.55, saturation);
  return dark
    ? {
        '--ab-bg-top': hsl(hue, s * 0.8, 0.12),
        '--ab-bg-bottom': hsl(hue + 8, s * 0.6, 0.26),
        '--ab-text': hsl(hue, 0.3, 0.92),
        '--ab-text-muted': hsl(hue, 0.25, 0.7),
        '--ab-primary': hsl(hue, 1, 0.72),
        '--ab-on-primary': hsl(hue, 0.9, 0.12),
        '--ab-container': hsl(hue, s * 0.75, 0.3),
        '--ab-container-high': hsl(hue, s * 0.7, 0.2),
        '--ab-track': hsl(hue, s * 0.5, 0.32),
        '--ab-toolbar': hsl(hue, 1, 0.55),
        '--ab-on-toolbar': hsl(hue, 0.9, 0.1),
        '--ab-pill': hsl(hue + 50, 0.95, 0.65),
        '--ab-on-pill': hsl(hue + 50, 0.9, 0.12),
      }
    : {
        '--ab-bg-top': hsl(hue, 1, 0.78),
        '--ab-bg-bottom': hsl(hue + 8, 0.95, 0.9),
        '--ab-text': hsl(hue, 0.7, 0.14),
        '--ab-text-muted': hsl(hue, 0.4, 0.3),
        '--ab-primary': hsl(hue, 0.95, 0.24),
        '--ab-on-primary': hsl(hue, 0.9, 0.96),
        '--ab-container': hsl(hue, 0.9, 0.8),
        '--ab-container-high': hsl(hue, 0.85, 0.86),
        '--ab-track': hsl(hue, 0.7, 0.72),
        '--ab-toolbar': hsl(hue, 1, 0.5),
        '--ab-on-toolbar': hsl(hue, 0.9, 0.1),
        '--ab-pill': hsl(hue + 50, 0.95, 0.65),
        '--ab-on-pill': hsl(hue + 50, 0.9, 0.12),
      };
};

/** Colors of the image at `url`; a cover the browser will not let us read gets the blue fallback. */
export const sampleCoverColor = async (url: string): Promise<CoverColor> => {
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return FALLBACK;
    context.drawImage(image, 0, 0, size, size);
    return dominantColor(context.getImageData(0, 0, size, size).data);
  } catch {
    return FALLBACK;
  }
};

/**
 * Liquid-glass colors: light text over a blurred, darkened copy of the cover, with
 * translucent white surfaces. Same variable names as the Material palette, so every
 * component works in either style.
 */
export const buildGlassPalette = ({ hue, saturation }: CoverColor, dark: boolean) => {
  const s = Math.max(0.5, saturation);
  return {
    '--ab-bg-top': hsl(hue, s * 0.7, dark ? 0.16 : 0.34),
    '--ab-bg-bottom': hsl(hue + 12, s * 0.6, dark ? 0.08 : 0.2),
    '--ab-text': 'rgba(255, 255, 255, 0.96)',
    '--ab-text-muted': 'rgba(255, 255, 255, 0.68)',
    '--ab-primary': 'rgba(255, 255, 255, 0.96)',
    '--ab-on-primary': hsl(hue, 0.6, 0.14),
    '--ab-container': 'rgba(255, 255, 255, 0.16)',
    '--ab-container-high': 'rgba(255, 255, 255, 0.22)',
    '--ab-track': 'rgba(255, 255, 255, 0.28)',
    '--ab-toolbar': 'rgba(255, 255, 255, 0.2)',
    '--ab-on-toolbar': 'rgba(255, 255, 255, 0.96)',
    '--ab-pill': 'rgba(255, 255, 255, 0.9)',
    '--ab-on-pill': hsl(hue, 0.6, 0.14),
  };
};

/** Black on white for e-ink: no tints, no gradients, borders do the separating. */
export const buildEinkPalette = () => ({
  '--ab-bg-top': '#ffffff',
  '--ab-bg-bottom': '#ffffff',
  '--ab-text': '#000000',
  '--ab-text-muted': '#000000',
  '--ab-primary': '#000000',
  '--ab-on-primary': '#ffffff',
  '--ab-container': '#ffffff',
  '--ab-container-high': '#ffffff',
  '--ab-track': '#bdbdbd',
  '--ab-toolbar': '#ffffff',
  '--ab-on-toolbar': '#000000',
  '--ab-pill': '#000000',
  '--ab-on-pill': '#ffffff',
});

/**
 * A tiny, heavily downscaled copy of the cover as a data URL. Stretched over the screen it
 * looks like a blurred cover, for the price of drawing a 24-pixel image: a CSS `blur(60px)`
 * on a full-screen picture takes an old iPad whole seconds per frame.
 */
export const blurredCoverUrl = async (url: string): Promise<string | null> => {
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, 24, 24);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
};

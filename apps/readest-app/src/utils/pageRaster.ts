/**
 * Draws what is on screen, from the page's own content, into a canvas: the text word by word where
 * the layout put it, in its font and colour, the pictures, the backgrounds and the borders of the
 * boxes. It exists so the page turn can show the page it is turning *to* (on the back of the sheet,
 * or coming in) with its real text, while that page is not yet on screen and a screenshot of it
 * cannot be taken without a flash.
 *
 * It follows the layout the browser already worked out (`getClientRects`), so every word lands
 * where it will be on the page, justified and hyphenated as it is. It does not try to be a full
 * browser: no shadows, gradients, transforms or vertical text. The turn dissolves into the real
 * page at its very end, so a small difference is not seen.
 */

export interface RasterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RasterOptions {
  /** Device pixels per CSS pixel of the canvas. */
  dpr: number;
  /** The paper (the theme's background and texture), drawn first. */
  paper?: CanvasImageSource | null;
  /** Used when there is no paper. */
  background?: string;
  /** Give up (returning null) after this many milliseconds. */
  budgetMs?: number;
  /** Elements to leave out, with everything inside them (the turn's own overlay). */
  skip?: (element: Element) => boolean;
  /** Stop (resolving null) as soon as this says so; only the sliced version looks at it. */
  isCancelled?: () => boolean;
}

class OutOfTime extends Error {}

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'TITLE', 'META', 'LINK']);

export const transformText = (text: string, transform: string) => {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(
        /(^|[\s"'([{-])(\p{L})/gu,
        (_, before: string, letter: string) => before + letter.toUpperCase(),
      );
    default:
      return text;
  }
};

/** The canvas `font` for a computed style. */
export const fontFor = (style: {
  fontStyle: string;
  fontVariantCaps?: string;
  fontWeight: string;
  fontSize: string;
  fontFamily: string;
}) =>
  [
    style.fontStyle === 'italic' || style.fontStyle === 'oblique' ? 'italic' : '',
    style.fontVariantCaps === 'small-caps' ? 'small-caps' : '',
    style.fontWeight,
    style.fontSize,
    style.fontFamily,
  ]
    .filter(Boolean)
    .join(' ');

/** Whether a CSS colour is see-through (`transparent` or any `rgba(..., 0)`). */
export const isTransparent = (color: string) => {
  if (!color || color === 'transparent') return true;
  const match = /rgba?\(([^)]+)\)/.exec(color);
  if (!match) return false;
  const parts = match[1]!.split(/[ ,/]+/).filter(Boolean);
  return parts.length >= 4 && parseFloat(parts[3]!) === 0;
};

/** The work as a generator that gives way (`yield`) whenever `due()` says its slice of time is up. */
function* rasterSteps(
  root: Element,
  rect: RasterRect,
  options: RasterOptions,
  due: () => boolean,
): Generator<void, HTMLCanvasElement | null> {
  const { dpr, paper = null, background = '#ffffff', budgetMs = 400, skip } = options;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ctx: CanvasRenderingContext2D = context;
  ctx.scale(dpr, dpr);
  if (paper) {
    ctx.drawImage(paper, 0, 0, rect.width, rect.height);
  } else {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  const started = performance.now();
  let counter = 0;
  const checkTime = () => {
    // Reading the clock is cheap but not free: once in a few dozen steps is enough.
    if ((counter += 1) % 32 === 0 && performance.now() - started > budgetMs) throw new OutOfTime();
  };

  const width = rect.width;
  const height = rect.height;
  const inside = (left: number, top: number, w: number, h: number) =>
    left + w > 0 && left < width && top + h > 0 && top < height;

  /** Draw one element's box, its text and its children; `ox`, `oy` place its document on the canvas. */
  function* visit(element: Element, win: Window, ox: number, oy: number): Generator<void> {
    checkTime();
    if (due()) yield;
    if (skip?.(element) || SKIPPED_TAGS.has(element.tagName)) return;
    const style = win.getComputedStyle(element);
    if (style.display === 'none' || style.opacity === '0') return;

    const isHtml = element === element.ownerDocument.documentElement;
    const isBody = element === element.ownerDocument.body;
    const rects = Array.from(element.getClientRects());
    const boxless = style.display === 'contents' || rects.length === 0;
    if (!boxless) {
      const touches = rects.some((r) => inside(r.left + ox, r.top + oy, r.width, r.height));
      // A box that is nowhere near the page holds nothing on it (a block cut into columns has a box
      // in each of them, so its rects, or their union, still reach the page when part of it is here).
      if (!touches && !isHtml && !isBody) return;
    }

    if (element.tagName === 'IFRAME') {
      const frame = element as HTMLIFrameElement;
      let doc: Document | null = null;
      try {
        doc = frame.contentDocument;
      } catch {
        doc = null;
      }
      const box = rects[0];
      if (doc?.documentElement && frame.contentWindow && box) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.left + ox, box.top + oy, box.width, box.height);
        ctx.clip();
        yield* visit(doc.documentElement, frame.contentWindow, ox + box.left, oy + box.top);
        ctx.restore();
      }
      return;
    }

    if (!boxless && !isHtml && !isBody) paintBox(element, style, rects, ox, oy);

    const tag = element.tagName;
    if (tag === 'IMG') {
      paintImage(element as HTMLImageElement, style, rects[0], ox, oy);
      return;
    }
    if (tag === 'CANVAS') {
      const box = rects[0];
      if (box) {
        try {
          ctx.drawImage(
            element as HTMLCanvasElement,
            box.left + ox,
            box.top + oy,
            box.width,
            box.height,
          );
        } catch {
          // A canvas that cannot be read is left out.
        }
      }
      return;
    }

    if (element.shadowRoot) {
      for (const child of Array.from(element.shadowRoot.children)) yield* visit(child, win, ox, oy);
    }
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3) yield* paintText(node as Text, element, style, ox, oy);
      else if (node.nodeType === 1) yield* visit(node as Element, win, ox, oy);
    }
  }

  const paintBox = (
    _element: Element,
    style: CSSStyleDeclaration,
    rects: DOMRect[],
    ox: number,
    oy: number,
  ) => {
    const fill = !isTransparent(style.backgroundColor);
    const bt = parseFloat(style.borderTopWidth) || 0;
    const bb = parseFloat(style.borderBottomWidth) || 0;
    const bl = parseFloat(style.borderLeftWidth) || 0;
    const br = parseFloat(style.borderRightWidth) || 0;
    const borders = bt + bb + bl + br > 0;
    if (!fill && !borders) return;
    for (const r of rects) {
      const x = r.left + ox;
      const y = r.top + oy;
      if (!inside(x, y, r.width, r.height)) continue;
      // A box as big as the page itself is the page's own background: the paper already shows it.
      if (r.width >= width * 0.97 && r.height >= height * 0.9) continue;
      if (fill) {
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(x, y, r.width, r.height);
      }
      if (borders && rects.length === 1) {
        const side = (w: number, color: string, sx: number, sy: number, sw: number, sh: number) => {
          if (w > 0 && !isTransparent(color)) {
            ctx.fillStyle = color;
            ctx.fillRect(sx, sy, sw, sh);
          }
        };
        side(bt, style.borderTopColor, x, y, r.width, bt);
        side(bb, style.borderBottomColor, x, y + r.height - bb, r.width, bb);
        side(bl, style.borderLeftColor, x, y, bl, r.height);
        side(br, style.borderRightColor, x + r.width - br, y, br, r.height);
      }
    }
  };

  const paintImage = (
    image: HTMLImageElement,
    style: CSSStyleDeclaration,
    box: DOMRect | undefined,
    ox: number,
    oy: number,
  ) => {
    if (!box || !image.complete || !image.naturalWidth) return;
    let x = box.left + ox;
    let y = box.top + oy;
    let w = box.width;
    let h = box.height;
    if (!inside(x, y, w, h)) return;
    if (style.objectFit === 'contain' || style.objectFit === 'scale-down') {
      const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      x += (w - dw) / 2;
      y += (h - dh) / 2;
      w = dw;
      h = dh;
    }
    try {
      ctx.globalAlpha = parseFloat(style.opacity) || 1;
      ctx.drawImage(image, x, y, w, h);
    } catch {
      // An image that cannot be read is left out.
    } finally {
      ctx.globalAlpha = 1;
    }
  };

  function* paintText(
    node: Text,
    parent: Element,
    style: CSSStyleDeclaration,
    ox: number,
    oy: number,
  ): Generator<void> {
    const data = node.data;
    if (!data.trim()) return;
    if (style.visibility === 'hidden') return;
    if (style.writingMode && style.writingMode !== 'horizontal-tb') return;
    const doc = parent.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const whole = Array.from(range.getClientRects());
    if (!whole.some((r) => inside(r.left + ox, r.top + oy, r.width, r.height))) return;

    ctx.font = fontFor(style);
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.direction = style.direction === 'rtl' ? 'rtl' : 'ltr';
    const metrics = ctx.measureText('Hxg');
    const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * 0.8;
    const underline = (style.textDecorationLine || '').includes('underline');
    const strike = (style.textDecorationLine || '').includes('line-through');
    const decoration = style.textDecorationColor || style.color;
    const lineWidth = Math.max(1, parseFloat(style.fontSize) / 16);

    const draw = (text: string, box: DOMRect) => {
      const x = box.left + ox;
      const y = box.top + oy;
      if (!inside(x, y, box.width, box.height)) return;
      const baseline = y + ascent;
      ctx.fillText(transformText(text, style.textTransform), x, baseline, box.width * 1.04);
      if (underline || strike) {
        ctx.fillStyle = decoration;
        ctx.fillRect(
          x,
          underline ? baseline + lineWidth * 1.5 : y + box.height * 0.55,
          box.width,
          lineWidth,
        );
        ctx.fillStyle = style.color;
      }
    };

    const words = /\S+/g;
    let match: RegExpExecArray | null = words.exec(data);
    while (match) {
      checkTime();
      if (due()) yield;
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const boxes = Array.from(range.getClientRects());
      if (boxes.length === 1) {
        draw(match[0], boxes[0]!);
      } else if (boxes.length > 1) {
        // A word broken across lines (a hyphen): each letter where it landed.
        for (let i = 0; i < match[0].length; i++) {
          range.setStart(node, match.index + i);
          range.setEnd(node, match.index + i + 1);
          const box = range.getClientRects()[0];
          if (box) draw(match[0][i]!, box);
        }
      }
      match = words.exec(data);
    }
  }

  try {
    yield* visit(root, root.ownerDocument.defaultView ?? window, -rect.x, -rect.y);
  } catch (error) {
    if (error instanceof OutOfTime) return null;
    throw error;
  }
  return canvas;
}

/** All at once: the page as a canvas, or null if it could not be drawn in time. */
export const rasterizeView = (
  root: Element,
  rect: RasterRect,
  options: RasterOptions,
): HTMLCanvasElement | null => {
  const steps = rasterSteps(root, rect, options, () => false);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
};

/**
 * The part of a cell-sized paper picture that lies under `part` of the cell, as something
 * `drawImage` can draw over a canvas of that part's size.
 */
export const cropPaper = (
  paper: CanvasImageSource,
  width: number,
  height: number,
  part: 'left' | 'right' | 'all',
): CanvasImageSource => {
  if (part === 'all') return paper;
  const half = Math.round(width / 2);
  const crop = document.createElement('canvas');
  crop.width = half;
  crop.height = Math.round(height);
  crop
    .getContext('2d')
    ?.drawImage(paper, part === 'right' ? half : 0, 0, half, crop.height, 0, 0, half, crop.height);
  return crop;
};

const SLICE_MS = 7;

/**
 * The same, in slices of a few milliseconds between animation frames, so a slow screen keeps
 * moving while it is drawn. Resolves null when it ran out of time or was cancelled.
 */
export const rasterizeViewAsync = (
  root: Element,
  rect: RasterRect,
  options: RasterOptions,
): Promise<HTMLCanvasElement | null> =>
  new Promise((resolve) => {
    let sliceStart = 0;
    const steps = rasterSteps(root, rect, options, () => performance.now() - sliceStart > SLICE_MS);
    const run = () => {
      if (options.isCancelled?.()) return resolve(null);
      sliceStart = performance.now();
      try {
        const step = steps.next();
        if (step.done) return resolve(step.value);
        requestAnimationFrame(run);
      } catch {
        resolve(null);
      }
    };
    requestAnimationFrame(run);
  });

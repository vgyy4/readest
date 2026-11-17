import { afterEach, describe, expect, it } from 'vitest';
import { rasterizeView, rasterizeViewAsync } from '@/utils/pageRaster';
import { BookFlipRenderer } from '@/utils/bookFlip';

const W = 400;
const H = 300;

let host: HTMLDivElement;
afterEach(() => host?.remove());

const mount = (html: string) => {
  host = document.createElement('div');
  host.style.cssText = `position:absolute;left:30px;top:20px;width:${W}px;height:${H}px;background:#fff;font:24px/32px sans-serif;color:#000`;
  host.innerHTML = html;
  document.body.appendChild(host);
  const r = host.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};

const pixel = (canvas: HTMLCanvasElement, x: number, y: number) =>
  Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);

/** How many pixels in a region are dark. */
const dark = (canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number) => {
  const data = canvas.getContext('2d')!.getImageData(x, y, w, h).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i]! < 100) count += 1;
  return count;
};

describe('rasterizeView', () => {
  it('puts the text where the layout put it', () => {
    const rect = mount('<p style="margin:0;position:absolute;left:40px;top:100px">Hello world</p>');
    const canvas = rasterizeView(host, rect, { dpr: 1 })!;
    expect(dark(canvas, 40, 100, 130, 34)).toBeGreaterThan(80);
    expect(dark(canvas, 250, 10, 100, 30)).toBe(0);
  });

  it('draws backgrounds, borders and images', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const rect = mount(
      `<div style="position:absolute;left:10px;top:10px;width:60px;height:40px;background:rgb(255,0,0)"></div>` +
        `<div style="position:absolute;left:100px;top:10px;width:60px;height:40px;border-bottom:4px solid rgb(0,0,255)"></div>` +
        `<img id="i" src="${png}" style="position:absolute;left:200px;top:10px;width:50px;height:50px">`,
    );
    await (host.querySelector('#i') as HTMLImageElement).decode();
    const canvas = rasterizeView(host, rect, { dpr: 1 })!;
    expect(pixel(canvas, 30, 30)).toEqual([255, 0, 0, 255]);
    expect(pixel(canvas, 130, 52)).toEqual([0, 0, 255, 255]);
    // The one-pixel picture is stretched over its box: not the white page any more.
    expect(pixel(canvas, 220, 30)).not.toEqual([255, 255, 255, 255]);
  });

  it('draws what is inside a frame, shifted to where the frame is', async () => {
    const rect = mount(
      '<iframe id="f" style="position:absolute;left:60px;top:50px;width:200px;height:100px;border:0" srcdoc="<body style=\'margin:0;font:28px sans-serif\'>Frame text</body>"></iframe>',
    );
    const frame = host.querySelector('#f') as HTMLIFrameElement;
    await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    const canvas = rasterizeView(host, rect, { dpr: 1 })!;
    expect(dark(canvas, 60, 50, 150, 40)).toBeGreaterThan(60);
    expect(dark(canvas, 0, 0, 50, 40)).toBe(0);
  });

  it('leaves out what it is told to', () => {
    const rect = mount(
      '<p style="margin:0;position:absolute;left:10px;top:10px">Shown</p><p data-skip style="margin:0;position:absolute;left:10px;top:100px">Hidden</p>',
    );
    const canvas = rasterizeView(host, rect, {
      dpr: 1,
      skip: (el) => el.hasAttribute('data-skip'),
    })!;
    expect(dark(canvas, 10, 10, 100, 34)).toBeGreaterThan(60);
    expect(dark(canvas, 10, 100, 100, 34)).toBe(0);
  });

  it('does not draw what is off the page, or hidden', () => {
    const rect = mount(
      '<p style="margin:0;position:absolute;left:600px;top:10px">Away</p><p style="margin:0;position:absolute;left:10px;top:10px;visibility:hidden">Invisible</p>',
    );
    const canvas = rasterizeView(host, rect, { dpr: 1 })!;
    expect(dark(canvas, 0, 0, W, H)).toBe(0);
  });

  it('gives up, resolving null, when it runs out of time', () => {
    const rect = mount('<p>' + 'word '.repeat(400) + '</p>');
    expect(rasterizeView(host, rect, { dpr: 1, budgetMs: 0 })).toBeNull();
  });

  it('can run in slices between frames, and be cancelled', async () => {
    const rect = mount('<p style="margin:0;position:absolute;left:10px;top:10px">Sliced</p>');
    const canvas = await rasterizeViewAsync(host, rect, { dpr: 1 });
    expect(dark(canvas!, 10, 10, 100, 34)).toBeGreaterThan(40);
    expect(await rasterizeViewAsync(host, rect, { dpr: 1, isCancelled: () => true })).toBeNull();
  });
});

describe('BookFlipRenderer', () => {
  const solid = (r: number, g: number, b: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, W, H);
    return canvas;
  };
  const make = (spread: boolean, forward: boolean, rtl = false, withIncoming = true) => {
    host = document.createElement('div');
    host.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
    document.body.appendChild(host);
    const renderer = new BookFlipRenderer({ preserveDrawingBuffer: true });
    renderer.attach(host, W, H, 1);
    renderer.setSpread(spread);
    renderer.setTurn(forward, rtl);
    renderer.setTexture(solid(220, 20, 20));
    if (withIncoming) renderer.setIncoming(solid(20, 20, 220));
    return renderer;
  };
  const near = (a: number[], b: number[], tolerance = 12) =>
    a.every((v, i) => Math.abs(v - b[i]!) <= tolerance);

  it('covers the page exactly with the old page at the start', () => {
    const renderer = make(true, true);
    renderer.render(0);
    expect(near(renderer.readPixel(40, 150), [220, 20, 20, 255])).toBe(true);
    expect(near(renderer.readPixel(360, 150), [220, 20, 20, 255])).toBe(true);
    renderer.dispose();
  });

  it('turns the right page over the middle: its back, the new page, lands on the left', () => {
    const renderer = make(true, true);
    renderer.render(0.8);
    // The sheet is over on the left showing its back: the incoming page (blue-ish, a little shaded).
    const onTheLeft = renderer.readPixel(120, 150);
    expect(onTheLeft[2]).toBeGreaterThan(onTheLeft[0] + 80);
    // The right side is open: nothing drawn but the shadow, so the live page shows.
    expect(renderer.readPixel(380, 150)[3]).toBeLessThan(60);
    renderer.dispose();
  });

  it('leaves nothing on screen when it has turned, so the live page shows', () => {
    const renderer = make(true, true);
    renderer.render(1);
    expect(renderer.readPixel(100, 150)[3]).toBe(0);
    expect(renderer.readPixel(300, 150)[3]).toBe(0);
    renderer.dispose();
  });

  it('mirrors in a right-to-left book: the left page turns over onto the right', () => {
    const renderer = make(true, true, true);
    renderer.render(0.8);
    const onTheRight = renderer.readPixel(280, 150);
    expect(onTheRight[2]).toBeGreaterThan(onTheRight[0] + 80);
    renderer.dispose();
  });

  it('brings the previous page in going back in one-page view, and ends on it', () => {
    const renderer = make(false, false);
    renderer.render(0);
    // Starts as the old page, untouched.
    expect(near(renderer.readPixel(200, 150), [220, 20, 20, 255])).toBe(true);
    // Near the end the incoming page (blue) lies over the old one.
    renderer.render(0.9);
    expect(renderer.readPixel(200, 150)[2]).toBeGreaterThan(150);
    renderer.dispose();
  });

  it('maps a half-page picture onto the back of the sheet, and frees the canvas', () => {
    const renderer = make(true, true, false, false);
    // Only the left half of the new page was drawn: a half-width canvas.
    const half = document.createElement('canvas');
    half.width = W / 2;
    half.height = H;
    const ctx = half.getContext('2d')!;
    ctx.fillStyle = 'rgb(20,20,220)';
    ctx.fillRect(0, 0, W / 2, H);
    renderer.setIncoming(half, 'left');
    expect(half.width).toBe(0);
    renderer.render(0.8);
    const onTheLeft = renderer.readPixel(120, 150);
    expect(onTheLeft[2]).toBeGreaterThan(onTheLeft[0] + 80);
    renderer.dispose();
  });

  it('without a picture of the other page the back is paper, not an empty hole', () => {
    const renderer = make(true, true, false, false);
    renderer.render(0.8);
    expect(renderer.readPixel(120, 150)[3]).toBeGreaterThan(200);
    renderer.dispose();
  });
});

const POINTS = 72;
const LOBES = 9;

type Outline = [number, number][];

/** Voice's Cookie9Sided: a circle with nine soft lobes, in a 0..100 box. */
const cookie = (): Outline => {
  const points: Outline = [];
  for (let i = 0; i < POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2;
    const radius = 0.93 * (1 + 0.055 * Math.cos(LOBES * (angle + Math.PI / 2)));
    points.push([50 + 50 * radius * Math.cos(angle), 50 + 50 * radius * Math.sin(angle)]);
  }
  return points;
};

/** Voice's Square: a rounded square (a superellipse), same number of points as the cookie. */
const square = (): Outline => {
  const points: Outline = [];
  for (let i = 0; i < POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const radius = 1 / Math.pow(Math.pow(Math.abs(cos), 4) + Math.pow(Math.abs(sin), 4), 1 / 4);
    points.push([50 + 50 * 0.86 * radius * cos, 50 + 50 * 0.86 * radius * sin]);
  }
  return points;
};

const COOKIE = cookie();
const SQUARE = square();

/**
 * The play button's outline between the cookie (`t` = 0, paused) and the rounded square
 * (`t` = 1, playing), as a CSS polygon. A spring can drive `t` past 1 and back, which is the
 * bounce of Voice's morph. Both shapes have the same points, so every `t` in between is valid.
 */
export const morphPolygon = (t: number) => {
  const points = COOKIE.map(([cx, cy], i) => {
    const [sx, sy] = SQUARE[i]!;
    return `${(cx + (sx - cx) * t).toFixed(2)}% ${(cy + (sy - cy) * t).toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
};

export const playButtonPolygon = (playing: boolean) => morphPolygon(playing ? 1 : 0);

/**
 * The play and pause symbols as two four-cornered pieces each, in a 24 box, so that one turns
 * into the other when `t` goes from 0 (play) to 1 (pause). Voice does the same with a vector
 * animation. Returns the two polygons' `points` attributes.
 */
export const playPausePieces = (t: number): [string, string] => {
  const left: [number, number][][] = [
    [
      [8, 5],
      // The pieces overlap a little where they meet: edge to edge, antialiasing leaves a hairline.
      [13.9, 8.75],
      [13.9, 15.25],
      [8, 19],
    ],
    [
      [6.5, 5],
      [10.5, 5],
      [10.5, 19],
      [6.5, 19],
    ],
  ];
  const right: [number, number][][] = [
    [
      [13.1, 8.25],
      [19, 12],
      [19, 12],
      [13.1, 15.75],
    ],
    [
      [13.5, 5],
      [17.5, 5],
      [17.5, 19],
      [13.5, 19],
    ],
  ];
  const mix = (pair: [number, number][][]) =>
    pair[0]!
      .map(([x, y], i) => {
        const [x2, y2] = pair[1]![i]!;
        return `${(x + (x2 - x) * t).toFixed(2)},${(y + (y2 - y) * t).toFixed(2)}`;
      })
      .join(' ');
  return [mix(left), mix(right)];
};

/** A soft many-lobed burst (the bookmark save flourish), as a CSS polygon. */
export const burstPolygon = (lobes = 12) => {
  const count = 96;
  const points: string[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 0.78 + 0.22 * Math.cos(lobes * angle);
    points.push(
      `${(50 + 50 * radius * Math.cos(angle)).toFixed(2)}% ${(50 + 50 * radius * Math.sin(angle)).toFixed(2)}%`,
    );
  }
  return `polygon(${points.join(', ')})`;
};

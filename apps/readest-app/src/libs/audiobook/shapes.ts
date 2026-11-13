const POINTS = 72;

/**
 * The play button's outline as a CSS polygon: a scalloped cookie while paused,
 * a rounded square while playing. Both have the same number of points, so a CSS
 * transition between them morphs one into the other.
 */
export const playButtonPolygon = (playing: boolean) => {
  const points: string[] = [];
  for (let i = 0; i < POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Squircle (|x|^n + |y|^n = 1) of radius 1, or a circle with 10 soft lobes.
    const radius = playing
      ? 1 / Math.pow(Math.pow(Math.abs(cos), 4) + Math.pow(Math.abs(sin), 4), 1 / 4)
      : 1 + 0.07 * Math.cos(10 * angle);
    const scale = playing ? 0.94 : 0.92;
    const x = 50 + 50 * scale * radius * cos * (playing ? 0.92 : 1);
    const y = 50 + 50 * scale * radius * sin * (playing ? 0.92 : 1);
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${points.join(', ')})`;
};

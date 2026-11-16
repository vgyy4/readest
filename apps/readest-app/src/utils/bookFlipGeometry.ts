/**
 * The shape of a page that is being turned in a book, side-on: one sheet hinged at the spine, lifted
 * and bent, as a list of points. No GPU in here, so the form can be tested and tuned on its own.
 *
 * The sheet is `SEGMENTS` pieces long and one unit wide. Each piece points at angle `phi` from the
 * flat resting page (0) up and over (pi / 2 is upright) to lying on the other side (pi). The hinge
 * angle follows the progress; the free edge leads the hinge on the way up and trails it on the way
 * down (`BEND`), so the page arches the way paper does and settles last at its edge.
 */
export const SEGMENTS = 36;
const BEND = 0.62;
const BEND_CURVE = 1.45;
const UPRIGHT_LEAN = 0.3;

export interface SheetPoint {
  /** Along the page from the spine (0) to the free edge (1), in sheet widths. */
  s: number;
  /** Distance from the spine across the book, in sheet widths (negative once past the spine). */
  x: number;
  /** Height above the resting page, toward the viewer, in sheet widths. */
  z: number;
  /** The piece's angle: 0 flat, pi / 2 upright, pi flat again on the other side. */
  phi: number;
}

/** The hinge angle at the spine for a turn that is `progress` (0 to 1) of the way done. */
export const hingeAngle = (progress: number) => Math.min(1, Math.max(0, progress)) * Math.PI;

export const sheetProfile = (progress: number): SheetPoint[] => {
  const theta = hingeAngle(progress);
  // Positive while the page goes up (0 to pi / 2), negative while it comes down.
  // A little of it stays at the top of the turn, so the sheet is never a flat wall seen edge-on.
  const bend = BEND * Math.sin(2 * theta) - UPRIGHT_LEAN * Math.sin(theta);
  const points: SheetPoint[] = [];
  let x = 0;
  let z = 0;
  let previous = theta;
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = i / SEGMENTS;
    const phi = Math.min(Math.PI, Math.max(0, theta + bend * Math.pow(s, BEND_CURVE)));
    if (i > 0) {
      // Trapezoid rule on the angle keeps the length of every piece exactly one segment.
      const mid = (phi + previous) / 2;
      x += Math.cos(mid) / SEGMENTS;
      z += Math.sin(mid) / SEGMENTS;
    }
    points.push({ s, x, z, phi });
    previous = phi;
  }
  return points;
};

/** How much a point at height `z` is magnified for a viewer `distance` sheet widths above the page. */
export const perspective = (z: number, distance: number) => distance / Math.max(0.05, distance - z);

/** Smooth 0 to 1 between `a` and `b`. */
export const smoothstep = (a: number, b: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Light on one piece, relative to the flat page (1 = as bright as at rest). The light comes from
 * above and slightly the spine side, so a page standing up toward it is brighter and one turned
 * away from it is darker. `back` is for the side that faces down at rest.
 */
const LIGHT = { x: -0.45, z: 0.89 };
export const shade = (phi: number, back: boolean) => {
  // Normal of the front side: (-sin phi, cos phi); the back side faces the other way.
  const nx = -Math.sin(phi);
  const nz = Math.cos(phi);
  const facing = (back ? -1 : 1) * (nx * LIGHT.x + nz * LIGHT.z);
  const relative = facing / LIGHT.z;
  if (back) return Math.min(1, Math.max(0.8, 0.93 + 0.1 * facing));
  return Math.min(1.04, Math.max(0.62, 1 - 0.38 * (1 - relative)));
};

import { describe, expect, it } from 'vitest';
import {
  hingeAngle,
  perspective,
  SEGMENTS,
  shade,
  sheetProfile,
  smoothstep,
} from '@/utils/bookFlipGeometry';

describe('the turning sheet', () => {
  it('lies flat on the right at the start and flat on the left at the end', () => {
    const start = sheetProfile(0);
    expect(start[0]).toMatchObject({ x: 0, z: 0 });
    expect(start[SEGMENTS]!.x).toBeCloseTo(1, 5);
    expect(start[SEGMENTS]!.z).toBeCloseTo(0, 5);
    const end = sheetProfile(1);
    expect(end[SEGMENTS]!.x).toBeCloseTo(-1, 5);
    expect(end[SEGMENTS]!.z).toBeCloseTo(0, 5);
  });

  it('keeps the sheet as long as it was, however it is bent', () => {
    for (const progress of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const points = sheetProfile(progress);
      for (let i = 1; i < points.length; i++) {
        const length = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
        expect(length).toBeCloseTo(1 / SEGMENTS, 3);
      }
    }
  });

  it('never goes below the page it rests on', () => {
    for (let progress = 0; progress <= 1; progress += 0.05) {
      for (const point of sheetProfile(progress)) expect(point.z).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('is hinged at the spine and the hinge follows the progress', () => {
    expect(hingeAngle(0)).toBe(0);
    expect(hingeAngle(0.5)).toBeCloseTo(Math.PI / 2, 9);
    expect(hingeAngle(1)).toBeCloseTo(Math.PI, 9);
    for (const progress of [0.2, 0.5, 0.8]) {
      expect(sheetProfile(progress)[0]!.phi).toBeCloseTo(hingeAngle(progress), 9);
    }
  });

  it('arches: the free edge leads on the way up and trails on the way down', () => {
    const rising = sheetProfile(0.2);
    expect(rising[SEGMENTS]!.phi).toBeGreaterThan(rising[0]!.phi);
    const falling = sheetProfile(0.8);
    expect(falling[SEGMENTS]!.phi).toBeLessThan(falling[0]!.phi);
  });

  it('is never a flat wall seen edge-on at the top of the turn', () => {
    const top = sheetProfile(0.5);
    expect(Math.abs(top[SEGMENTS]!.x)).toBeGreaterThan(0.05);
  });
});

describe('seeing the sheet', () => {
  it('magnifies what is nearer the viewer, and leaves the page as it is', () => {
    expect(perspective(0, 4)).toBe(1);
    expect(perspective(1, 4)).toBeGreaterThan(1);
    expect(perspective(2, 4)).toBeGreaterThan(perspective(1, 4));
  });

  it('is as bright as the resting page when it lies flat, darker as it turns away', () => {
    expect(shade(0, false)).toBeCloseTo(1, 5);
    expect(shade(Math.PI / 2, false)).toBeLessThan(1);
    expect(shade(Math.PI * 0.9, false)).toBeLessThan(shade(Math.PI * 0.2, false));
  });

  it('keeps the back of the sheet light, as paper', () => {
    for (const phi of [Math.PI / 2, Math.PI * 0.7, Math.PI]) {
      expect(shade(phi, true)).toBeGreaterThanOrEqual(0.8);
      expect(shade(phi, true)).toBeLessThanOrEqual(1);
    }
  });

  it('smoothstep goes from 0 to 1', () => {
    expect(smoothstep(0.9, 1, 0.5)).toBe(0);
    expect(smoothstep(0.9, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 9);
  });
});

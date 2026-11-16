import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  easeOutBack,
  entranceStyle,
  lerp,
  Spring,
  simulateSpring,
  STIFFNESS,
} from '@/libs/audiobook/spring';

describe('simulateSpring', () => {
  it('settles on the target', () => {
    const { values } = simulateSpring({ damping: 1, stiffness: STIFFNESS.Medium }, 0, 1, 3);
    expect(values.at(-1)).toBeCloseTo(1, 3);
  });

  it('does not overshoot when critically damped, and does when bouncy', () => {
    const calm = simulateSpring({ damping: 1, stiffness: STIFFNESS.Low }, 0, 1, 3).values;
    expect(Math.max(...calm)).toBeLessThanOrEqual(1.0001);
    const bouncy = simulateSpring({ damping: 0.4, stiffness: STIFFNESS.Medium }, 0, 1, 3).values;
    expect(Math.max(...bouncy)).toBeGreaterThan(1.1);
    // ...and comes back to rest.
    expect(bouncy.at(-1)).toBeCloseTo(1, 2);
  });

  it('is faster when stiffer', () => {
    const settle = (stiffness: number) =>
      simulateSpring({ damping: 1, stiffness }, 0, 1, 6).settledAt;
    expect(settle(STIFFNESS.Medium)).toBeLessThan(settle(STIFFNESS.Low));
    expect(settle(STIFFNESS.Low)).toBeLessThan(settle(STIFFNESS.VeryLow));
  });

  it("overshoots as much as a damped oscillator should (Voice's play button: 0.4 / Medium)", () => {
    // Peak overshoot of an underdamped spring: exp(-pi * z / sqrt(1 - z^2)).
    const z = 0.4;
    const expected = Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
    const peak = Math.max(
      ...simulateSpring({ damping: z, stiffness: STIFFNESS.Medium }, 0, 1, 2).values,
    );
    expect(peak - 1).toBeCloseTo(expected, 2);
  });
});

describe('Spring', () => {
  let now = 0;
  let frames: ((time: number) => void)[] = [];
  beforeEach(() => {
    now = 0;
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 16) {
      now += 16;
      const pending = frames;
      frames = [];
      pending.forEach((f) => f(now));
    }
  };

  it('moves to a new target, reporting each step, and stops asking for frames at rest', () => {
    const seen: number[] = [];
    const spring = new Spring(0, { damping: 1, stiffness: STIFFNESS.Medium }, (v) => seen.push(v));
    spring.to(1);
    run(1500);
    expect(seen.at(-1)).toBeCloseTo(1, 3);
    expect(spring.value).toBeCloseTo(1, 3);
    expect(frames).toHaveLength(0);
  });

  it('can be set instantly, and picks up from there', () => {
    const spring = new Spring(0, { damping: 1, stiffness: STIFFNESS.Medium }, () => {});
    spring.snap(5);
    expect(spring.value).toBe(5);
    spring.to(0);
    run(1500);
    expect(spring.value).toBeCloseTo(0, 3);
  });

  it('keeps its speed when the target changes mid-flight (so a spring feels continuous)', () => {
    const spring = new Spring(0, { damping: 0.5, stiffness: STIFFNESS.Medium }, () => {});
    spring.to(1);
    run(64);
    const speed = spring.velocity;
    expect(Math.abs(speed)).toBeGreaterThan(0.1);
    spring.to(2);
    expect(spring.velocity).toBe(speed);
  });

  it('can be stopped', () => {
    const spring = new Spring(0, { damping: 1, stiffness: STIFFNESS.Low }, () => {});
    spring.to(1);
    spring.stop();
    expect(frames).toHaveLength(0);
  });
});

describe('easing and entrance', () => {
  it('ease-out-back overshoots then settles at 1', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 5);
    expect(easeOutBack(1)).toBeCloseTo(1, 5);
    expect(Math.max(...[0.4, 0.5, 0.6, 0.7].map(easeOutBack))).toBeGreaterThan(1.05);
  });

  it('lerp', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it("an element's entrance starts 40 px low and invisible, and ends at rest", () => {
    expect(entranceStyle(0, 0).opacity).toBe(0);
    expect(entranceStyle(0, 0).translateY).toBeCloseTo(40, 5);
    const done = entranceStyle(1, 0);
    expect(done.opacity).toBe(1);
    expect(done.translateY).toBeCloseTo(0, 5);
  });

  it('each later element starts 72 ms (0.08 of 900 ms) after the one before', () => {
    // At 72 ms the first element is under way and the second has not started.
    expect(entranceStyle(72 / 900, 0).opacity).toBeGreaterThan(0);
    expect(entranceStyle(72 / 900, 1).opacity).toBe(0);
    // Each element's own motion takes half the timeline (450 ms): done at 450 ms for index 0.
    expect(entranceStyle(450 / 900, 0).opacity).toBe(1);
    expect(entranceStyle(450 / 900, 1).opacity).toBeLessThan(1);
  });

  it('overshoots a little past its place on the way (ease-out-back)', () => {
    const lows = [0.25, 0.3, 0.35, 0.4].map((p) => entranceStyle(p, 0).translateY);
    expect(Math.min(...lows)).toBeLessThan(0);
  });
});

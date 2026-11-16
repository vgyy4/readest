import { describe, expect, it } from 'vitest';
import { AdaptiveLimit } from '@/libs/adaptiveLimit';

/** A link whose speed (bytes a second) depends on how many are sent at once. */
const run = (limit: AdaptiveLimit, speedAt: (n: number) => number, windows: number) => {
  const seen: number[] = [];
  for (let i = 0; i < windows; i++) {
    limit.step(speedAt(limit.limit));
    seen.push(limit.limit);
  }
  return seen;
};

describe('how many to send at once', () => {
  it('goes up while each one more makes it clearly faster', () => {
    const limit = new AdaptiveLimit({ start: 1, max: 6 });
    // Each connection adds its own 100: nothing is full yet.
    run(limit, (n) => 100 * n, 12);
    expect(limit.limit).toBe(6);
  });

  it('settles where one more stops helping', () => {
    const limit = new AdaptiveLimit({ start: 1, max: 8 });
    // The link tops out at 300 (three connections).
    run(limit, (n) => Math.min(100 * n, 300), 14);
    expect(limit.limit).toBeLessThanOrEqual(4);
    expect(limit.limit).toBeGreaterThanOrEqual(3);
  });

  it('comes down when too many make everything slower', () => {
    const limit = new AdaptiveLimit({ start: 1, max: 8 });
    // Best at 3; every connection past that costs speed (they compete and drop requests).
    const speed = (n: number) => (n <= 3 ? 100 * n : 300 - 80 * (n - 3));
    run(limit, speed, 30);
    expect(limit.limit).toBeLessThanOrEqual(4);
    expect(limit.limit).toBeGreaterThanOrEqual(2);
  });

  it('follows the network as it changes: fewer when it slows, more when it recovers', () => {
    const limit = new AdaptiveLimit({ start: 1, max: 8 });
    // Roomy link: climbs.
    run(limit, (n) => 100 * n, 12);
    const high = limit.limit;
    expect(high).toBeGreaterThanOrEqual(5);
    // The link drops to a third, and more connections now only make it worse.
    run(limit, (n) => Math.max(40, 100 - 25 * (n - 1)), 40);
    expect(limit.limit).toBeLessThan(high);
    // It recovers: it climbs again.
    run(limit, (n) => 100 * n, 40);
    expect(limit.limit).toBeGreaterThanOrEqual(5);
  });

  it('halves on a failed request, and tries again later', () => {
    const limit = new AdaptiveLimit({ start: 4, max: 8 });
    expect(limit.failed()).toBe(2);
    expect(limit.failed()).toBe(1);
    expect(limit.failed()).toBe(1);
    run(limit, (n) => 100 * n, 30);
    expect(limit.limit).toBeGreaterThan(1);
  });

  it('stays within its limits', () => {
    const limit = new AdaptiveLimit({ min: 2, start: 99, max: 5 });
    expect(limit.limit).toBe(5);
    for (let i = 0; i < 5; i++) limit.failed();
    expect(limit.limit).toBe(2);
    const seen = run(new AdaptiveLimit({ min: 2, start: 2, max: 5 }), (n) => 1000 * n, 40);
    expect(Math.max(...seen)).toBe(5);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(2);
  });

  it('ignores the window in which it changed', () => {
    const limit = new AdaptiveLimit({ start: 1, max: 4 });
    limit.step(100); // gains: 1 -> 2
    expect(limit.limit).toBe(2);
    // This window mixed the old and the new number; whatever it measured is not acted on.
    expect(limit.step(0)).toBe(2);
  });
});

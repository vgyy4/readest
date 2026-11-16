import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCombinedProgress,
  PARALLEL_MAX,
  PARALLEL_START,
  runInParallel,
} from '@/libs/parallelDownload';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('combined progress of files downloading together', () => {
  it('weighs each file by its share, so the percentage does not jump between files', () => {
    const seen: number[] = [];
    const combined = createCombinedProgress([100, 300], (p) => seen.push(p.progress));
    combined.handler(0)({ progress: 50, total: 100, transferSpeed: 0 }); // 50 of 400 bytes
    combined.handler(1)({ progress: 150, total: 300, transferSpeed: 0 }); // +150: 200 of 400
    expect(seen.at(-1)).toBeCloseTo(50, 5);
    combined.handler(0)({ progress: 100, total: 100, transferSpeed: 0 });
    expect(seen.at(-1)).toBeCloseTo(62.5, 5);
    // Never goes back when the files report in another order.
    combined.handler(1)({ progress: 300, total: 300, transferSpeed: 0 });
    expect(seen.at(-1)).toBeCloseTo(100, 5);
  });

  it('counts a finished file as whole, and weighs equally when no size is known', () => {
    const seen: number[] = [];
    const combined = createCombinedProgress([0, 0], (p) => seen.push(p.progress));
    combined.finish(0);
    expect(seen.at(-1)).toBeCloseTo(50, 5);
  });

  it('measures the speed over everything that arrives', () => {
    let now = 1000;
    const speeds: number[] = [];
    const combined = createCombinedProgress(
      [100, 100],
      (p) => speeds.push(p.transferSpeed),
      () => now,
    );
    combined.handler(0)({ progress: 0, total: 100, transferSpeed: 0 });
    now = 2000;
    combined.handler(0)({ progress: 40, total: 100, transferSpeed: 999 });
    combined.handler(1)({ progress: 60, total: 100, transferSpeed: 999 });
    // 100 bytes in a second, from the two files together (not the 999 one file claimed).
    expect(speeds.at(-1)).toBeCloseTo(100, 5);
    expect(combined.bytes()).toBe(100);
  });
});

describe('running the files of a book together', () => {
  const never = () => new Promise<void>(() => {});

  it('starts two, and no more than there are', () => {
    const started: number[] = [];
    void runInParallel(
      5,
      (i) => {
        started.push(i);
        return never();
      },
      { bytes: () => 0 },
    );
    expect(started).toEqual([0, 1].slice(0, PARALLEL_START));
    const few: number[] = [];
    void runInParallel(
      1,
      (i) => {
        few.push(i);
        return never();
      },
      { bytes: () => 0 },
    );
    expect(few).toEqual([0]);
  });

  it('starts the next file as soon as one ends', async () => {
    const releases: Record<number, () => void> = {};
    const started: number[] = [];
    const done = runInParallel(
      3,
      (i) =>
        new Promise<void>((resolve) => {
          started.push(i);
          releases[i] = resolve;
        }),
      { bytes: () => 0 },
    );
    expect(started).toEqual([0, 1]);
    releases[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1, 2]);
    releases[1]!();
    releases[2]!();
    await done;
  });

  it('adds one more file while each addition makes the link clearly faster', async () => {
    let received = 0;
    let running = 0;
    const rate = 1000; // bytes per second, per file running
    const started: number[] = [];
    void runInParallel(
      8,
      (i) => {
        started.push(i);
        running++;
        return never();
      },
      { bytes: () => received, sampleMs: 1000 },
    );
    // Every file adds its own speed: the link is not full.
    for (let t = 0; t < 4; t++) {
      received += rate * running;
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(started.length).toBe(PARALLEL_MAX);
  });

  it('stops adding files when one more does not make it faster', async () => {
    let received = 0;
    const started: number[] = [];
    void runInParallel(
      8,
      (i) => {
        started.push(i);
        return never();
      },
      {
        bytes: () => received,
        sampleMs: 1000,
      },
    );
    // The link gives 1000 bytes a second whatever the number of files.
    for (let t = 0; t < 6; t++) {
      received += 1000;
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(started.length).toBe(3);
  });

  it('stops starting files after a failure, and reports it once the others have ended', async () => {
    const started: number[] = [];
    let finishOther: () => void = () => {};
    const done = runInParallel(
      5,
      (i) => {
        started.push(i);
        if (i === 0) return Promise.reject(new Error('refused'));
        return new Promise<void>((resolve) => (finishOther = resolve));
      },
      { bytes: () => 0 },
    );
    const outcome = done.then(
      () => 'resolved',
      (e: Error) => e.message,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([0, 1]);
    finishOther();
    expect(await outcome).toBe('refused');
  });
});

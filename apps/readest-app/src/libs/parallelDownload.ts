import type { ProgressHandler, ProgressPayload } from '@/utils/transfer';
import { AdaptiveLimit } from './adaptiveLimit';

/** How many files of one book start together, and the most that may run at once. */
export const PARALLEL_START = 2;
export const PARALLEL_MAX = 4;
/** How often the speed is looked at. */
const SAMPLE_MS = 2000;

export interface CombinedProgress {
  /** The progress handler for file `index`. */
  handler: (index: number) => ProgressHandler;
  /** File `index` is complete. */
  finish: (index: number) => void;
  /** Bytes received so far, over all files. */
  bytes: () => number;
}

/**
 * One progress for several files downloading at once. Each file counts for its share of the
 * whole (`weights`, normally its size); the percentage is the sum of those shares, and the speed is
 * measured over everything that arrives, not taken from one file. The old way (finished files plus
 * the current one's fraction) assumed one file at a time, so with several it jumped between them.
 */
export const createCombinedProgress = (
  weights: number[],
  onProgress?: ProgressHandler,
  now: () => number = Date.now,
): CombinedProgress => {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  const share = weights.map((w) => (sum > 0 ? Math.max(0, w) / sum : 1 / weights.length));
  const fraction = weights.map(() => 0);
  const received = weights.map(() => 0);
  // Recent (time, bytes) readings, for a speed that is not one burst's.
  const readings: { at: number; bytes: number }[] = [];
  const total = () => received.reduce((a, b) => a + b, 0);

  const emit = () => {
    const at = now();
    readings.push({ at, bytes: total() });
    while (readings.length > 2 && at - readings[0]!.at > 3000) readings.shift();
    const first = readings[0]!;
    const seconds = (at - first.at) / 1000;
    const speed = seconds > 0 ? (total() - first.bytes) / seconds : 0;
    const progress = fraction.reduce((acc, f, i) => acc + f * share[i]!, 0) * 100;
    onProgress?.({ progress, total: 100, transferSpeed: speed });
  };

  return {
    handler: (index) => (p: ProgressPayload) => {
      fraction[index] = p.total > 0 ? Math.min(1, p.progress / p.total) : 0;
      received[index] = p.progress;
      emit();
    },
    finish: (index) => {
      fraction[index] = 1;
      emit();
    },
    bytes: total,
  };
};

interface PoolOptions {
  /**
   * How many run at once, adjusted while they go. Pass one to react to failures (call `failed()`
   * when a request had to be repeated) or to share it between pools.
   */
  limit?: AdaptiveLimit;
  /** Bytes received so far over all the jobs: how the speed is read. */
  bytes: () => number;
  sampleMs?: number;
  now?: () => number;
}

/**
 * Run `count` jobs a few at a time, and keep adjusting how many while they go (see
 * {@link AdaptiveLimit}): one more when that makes the transfer faster, one fewer when it gets
 * slower, one more tried again now and then. Jobs already running are never cut short; the
 * number only decides when the next one starts. Once one job fails no more are started, and the
 * first failure is thrown when the ones running have ended.
 */
export const runInParallel = (
  count: number,
  run: (index: number) => Promise<void>,
  {
    limit = new AdaptiveLimit({ min: 1, start: PARALLEL_START, max: PARALLEL_MAX }),
    bytes,
    sampleMs = SAMPLE_MS,
    now = Date.now,
  }: PoolOptions,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (count === 0) return resolve();
    let next = 0;
    let running = 0;
    let failure: { error: unknown } | null = null;
    let last = { at: now(), bytes: bytes() };
    let timer: ReturnType<typeof setInterval> | null = null;

    const settle = () => {
      if (running > 0 || (next < count && !failure)) return;
      if (timer) clearInterval(timer);
      if (failure) reject(failure.error);
      else resolve();
    };

    const launch = () => {
      while (!failure && running < limit.limit && next < count) {
        const index = next++;
        running++;
        run(index)
          .catch((error) => {
            failure ??= { error };
          })
          .finally(() => {
            running--;
            launch();
            settle();
          });
      }
    };

    const sample = () => {
      const at = now();
      const seconds = (at - last.at) / 1000;
      const received = bytes();
      const rate = seconds > 0 ? (received - last.bytes) / seconds : 0;
      last = { at, bytes: received };
      if (failure || running === 0) return;
      limit.step(rate);
      launch();
    };

    timer = setInterval(sample, sampleMs);
    launch();
  });

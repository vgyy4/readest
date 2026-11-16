import type { ProgressHandler, ProgressPayload } from '@/utils/transfer';

/** How many files of one book start together, and the most that may run at once. */
export const PARALLEL_START = 2;
export const PARALLEL_MAX = 4;
/** How often the speed is looked at, and how much faster it must get for one more file to be added. */
const SAMPLE_MS = 2000;
const GAIN_TO_GROW = 1.2;

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
  start?: number;
  max?: number;
  /** Bytes received so far over all the files: how the speed is read. */
  bytes: () => number;
  sampleMs?: number;
  now?: () => number;
}

/**
 * Run `count` jobs a few at a time. It starts with `start` and adds one more whenever the link
 * clearly still has room: the speed (bytes over the last window) is a fifth better than it was
 * before the previous file was added. A link that two files already fill stops there; a slow
 * connection per file (latency, a throttled host) goes on to the most. Once one job fails no
 * more are started, and the first failure is thrown when the ones running have ended.
 */
export const runInParallel = (
  count: number,
  run: (index: number) => Promise<void>,
  {
    start = PARALLEL_START,
    max = PARALLEL_MAX,
    bytes,
    sampleMs = SAMPLE_MS,
    now = Date.now,
  }: PoolOptions,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (count === 0) return resolve();
    let next = 0;
    let running = 0;
    let limit = Math.max(1, Math.min(start, count));
    let failure: { error: unknown } | null = null;
    let baseline: number | null = null;
    let last = { at: now(), bytes: bytes() };
    let timer: ReturnType<typeof setInterval> | null = null;

    const settle = () => {
      if (running > 0 || (next < count && !failure)) return;
      if (timer) clearInterval(timer);
      if (failure) reject(failure.error);
      else resolve();
    };

    const launch = () => {
      while (!failure && running < limit && next < count) {
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
      const speed = seconds > 0 ? (bytes() - last.bytes) / seconds : 0;
      last = { at, bytes: bytes() };
      if (failure || next >= count || limit >= max || speed <= 0) return;
      if (baseline === null || speed >= baseline * GAIN_TO_GROW) {
        baseline = speed;
        limit += 1;
        launch();
      } else {
        // One more file did not make it faster: the link is full.
        limit = max;
        if (timer) clearInterval(timer);
        timer = null;
      }
    };

    timer = setInterval(sample, sampleMs);
    launch();
  });

/**
 * How many things (files, parts of a file) to send at the same time, adjusted while they go.
 *
 * Too few leave the link idle (one connection rarely fills a fast one: each waits for its own
 * round trips); too many compete with each other, make every one slow, and fail. Where the best
 * number is depends on the network, and changes while it is used (Wi-Fi to mobile data, a busy
 * hour, another device on the link). So it is found by trying: every window the speed is
 * measured, one more is added while that clearly makes it faster, one fewer is used when the
 * speed falls, and from time to time one more is tried again. A failed request halves it.
 *
 * The same rules run in the native downloader (src-tauri/src/download_parts.rs); keep them alike.
 */
export interface AdaptiveOptions {
  min?: number;
  start?: number;
  max?: number;
}

/** One more is kept when the speed is at least this much better than before it. */
const GAIN = 1.1;
/** The speed falling below this share of the best seen means there are too many (or the link got worse). */
const DROP = 0.7;
/** Windows to stay at a number that works before trying one more. */
const HOLD_WINDOWS = 4;

export class AdaptiveLimit {
  readonly min: number;
  readonly max: number;
  private current: number;
  private mode: 'probe' | 'hold' = 'probe';
  /** The speed before the last increase, which the increase has to beat. */
  private beforeProbe = 0;
  /** The best recent speed at a number that works, decaying so an old peak does not stay. */
  private best = 0;
  private held = 0;
  /** Windows to skip after a change: the speed of the window it happened in is not the new number's. */
  private settling = 0;

  constructor({ min = 1, start = 2, max = 4 }: AdaptiveOptions = {}) {
    this.min = Math.max(1, min);
    this.max = Math.max(this.min, max);
    this.current = Math.min(this.max, Math.max(this.min, start));
  }

  get limit(): number {
    return this.current;
  }

  /** Look at the speed (bytes a second, over the last window); returns the number to use now. */
  step(rate: number): number {
    if (this.settling > 0) {
      this.settling -= 1;
      return this.current;
    }
    if (this.mode === 'probe') {
      if (rate >= this.beforeProbe * GAIN) {
        // The one more helped.
        this.best = rate;
        if (this.current < this.max) {
          this.beforeProbe = rate;
          this.change(this.current + 1);
        } else {
          this.hold();
        }
      } else {
        // It did not: go back to the number that was as fast, and stay there a while.
        this.best = Math.max(rate, this.beforeProbe);
        this.change(Math.max(this.min, this.current - 1));
        this.hold();
      }
      return this.current;
    }
    // Holding at a number that works.
    if (rate > this.best) {
      this.best = rate;
    } else {
      this.best = Math.max(rate, this.best * 0.98);
    }
    if (rate < this.best * DROP && this.current > this.min) {
      // Slower than it was: too many for the link now.
      this.best = rate;
      this.change(this.current - 1);
      this.held = 0;
    } else if (++this.held >= HOLD_WINDOWS && this.current < this.max) {
      // The link may have room again: try one more.
      this.mode = 'probe';
      this.beforeProbe = rate;
      this.change(this.current + 1);
    }
    return this.current;
  }

  /** A request failed (a reset, a timeout): halve the number, and stay there a while. */
  failed(): number {
    const lower = Math.max(this.min, Math.floor(this.current / 2));
    if (lower < this.current) this.change(lower);
    this.hold();
    this.best = 0;
    return this.current;
  }

  private hold() {
    this.mode = 'hold';
    this.held = 0;
  }

  private change(next: number) {
    this.current = next;
    this.settling = 1;
  }
}

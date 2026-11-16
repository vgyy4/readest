/**
 * Springs, as the Voice app uses them (Jetpack Compose `spring(dampingRatio, stiffness)`): a mass
 * of 1 on a spring, so a value moves to its target with the bounce a damping ratio below 1 gives.
 * A CSS curve cannot be interrupted with its speed kept, nor drive a shape morph or a swipe that
 * follows the finger, so these run a few lines of physics on requestAnimationFrame and write the
 * result straight to the element (no React render per frame).
 */

/** E-ink screens are too slow for motion: nothing is animated there, everything just arrives. */
export const motionOff = () =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-eink') === 'true';

export interface SpringSpec {
  /** 1 settles without overshoot; below 1 it overshoots and bounces. */
  damping: number;
  stiffness: number;
}

/** Compose's named stiffnesses. */
export const STIFFNESS = {
  VeryLow: 50,
  Low: 200,
  MediumLow: 400,
  Medium: 1500,
} as const;

/** Compose's default damping ratio is 1 (no bounce). */
export const spring = (stiffness: number, damping = 1): SpringSpec => ({ damping, stiffness });

const STEP = 1 / 240;
const REST_DISTANCE = 0.0005;
const REST_SPEED = 0.002;

interface Motion {
  x: number;
  v: number;
}

/**
 * Advance `motion` towards `target` by `seconds`, with the exact solution of a damped spring (the
 * same maths Compose uses), so it is right for any frame length and needs no tiny steps.
 */
const advance = (motion: Motion, target: number, spec: SpringSpec, seconds: number) => {
  if (seconds <= 0) return;
  const w0 = Math.sqrt(spec.stiffness);
  const zeta = Math.min(spec.damping, 1);
  const d0 = motion.x - target;
  const v0 = motion.v;
  const decay = Math.exp(-zeta * w0 * seconds);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const cos = Math.cos(wd * seconds);
    const sin = Math.sin(wd * seconds);
    motion.x = target + decay * (d0 * cos + ((v0 + zeta * w0 * d0) / wd) * sin);
    motion.v = decay * (v0 * cos - ((zeta * w0 * v0 + w0 * w0 * d0) / wd) * sin);
  } else {
    const c = v0 + w0 * d0;
    motion.x = target + decay * (d0 + c * seconds);
    motion.v = decay * (v0 - w0 * c * seconds);
  }
};

const atRest = (motion: Motion, target: number, scale: number) =>
  Math.abs(motion.x - target) < REST_DISTANCE * scale && Math.abs(motion.v) < REST_SPEED * scale;

/** The path of a spring from `from` to `to`, one value per physics step (1/240 s), for tests and tuning. */
export const simulateSpring = (spec: SpringSpec, from: number, to: number, seconds: number) => {
  const motion = { x: from, v: 0 };
  const values: number[] = [];
  let settledAt = seconds;
  for (let t = 0; t < seconds; t += STEP) {
    advance(motion, to, spec, STEP);
    values.push(motion.x);
    if (settledAt === seconds && atRest(motion, to, Math.abs(to - from) || 1)) settledAt = t;
  }
  return { values, settledAt };
};

/**
 * One animated number. `to` sets a new target and keeps the current speed, `snap` jumps. `onChange`
 * is called with every new value while it moves; frames are only requested while it moves.
 */
export class Spring {
  value: number;
  velocity = 0;
  private target: number;
  private frame = 0;
  private last = 0;

  constructor(
    initial: number,
    private spec: SpringSpec,
    private onChange: (value: number) => void,
  ) {
    this.value = initial;
    this.target = initial;
  }

  to(target: number, spec?: SpringSpec) {
    if (motionOff()) return this.snap(target);
    if (spec) this.spec = spec;
    this.target = target;
    if (!this.frame) {
      this.last = 0;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  snap(value: number) {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onChange(value);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick = (time: number) => {
    // The first frame only starts the clock; a long gap (a hidden tab) must not become a leap.
    const seconds = this.last ? Math.min((time - this.last) / 1000, 1 / 20) : 0;
    this.last = time;
    const motion = { x: this.value, v: this.velocity };
    advance(motion, this.target, this.spec, seconds);
    this.value = motion.x;
    this.velocity = motion.v;
    if (atRest(motion, this.target, 1)) {
      this.value = this.target;
      this.velocity = 0;
      this.frame = 0;
      this.onChange(this.value);
      return;
    }
    this.onChange(this.value);
    this.frame = requestAnimationFrame(this.tick);
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Compose's EaseOutBack: overshoots a little, then settles at 1. */
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** How long the whole entrance of the player takes. */
export const ENTRANCE_MS = 900;
const ENTRANCE_DELAY = 0.08; // of the timeline, per element
const ENTRANCE_WINDOW = 0.5; // of the timeline, each element's own motion
export const ENTRANCE_RISE_PX = 40;

/**
 * Where an element is during the entrance of the player, `progress` (0..1) of the whole timeline
 * in: it starts `index` x 72 ms after the first, takes 450 ms, fades in linearly and rises from
 * 40 px below with a small overshoot (EaseOutBack), exactly as Voice does.
 */
export const entranceStyle = (progress: number, index: number) => {
  const local = Math.min(1, Math.max(0, (progress - index * ENTRANCE_DELAY) / ENTRANCE_WINDOW));
  return {
    opacity: local,
    translateY: (1 - easeOutBack(local)) * ENTRANCE_RISE_PX,
  };
};

/** A CSS/Compose cubic-bezier easing curve (x1, y1, x2, y2), solved with Newton's method. */
export const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const sample = (a: number, b: number, c: number, t: number) => ((a * t + b) * t + c) * t;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sample(ax, bx, cx, t) - x;
      if (Math.abs(error) < 1e-6) break;
      const slope = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    return sample(ay, by, cy, Math.min(1, Math.max(0, t)));
  };
};

/** Compose's FastOutSlowInEasing and FastOutLinearInEasing. */
export const fastOutSlowIn = cubicBezier(0.4, 0, 0.2, 1);
export const fastOutLinearIn = cubicBezier(0.4, 0, 1, 1);

/** Run `onUpdate(eased progress)` over `ms`; `cancel()` stops it, `done` resolves when it ends. */
export const tween = (
  ms: number,
  ease: (t: number) => number,
  onUpdate: (value: number) => void,
) => {
  if (motionOff()) {
    onUpdate(ease(1));
    return { done: Promise.resolve(), cancel: () => {} };
  }
  let frame = 0;
  let cancelled = false;
  const done = new Promise<void>((resolve) => {
    let start = 0;
    const tick = (time: number) => {
      if (cancelled) return resolve();
      if (!start) start = time;
      const p = Math.min(1, (time - start) / ms);
      onUpdate(ease(p));
      if (p >= 1) return resolve();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  return {
    done,
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    },
  };
};

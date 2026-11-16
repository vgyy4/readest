import React, { useEffect, useRef, useState } from 'react';
import { spring, STIFFNESS } from '@/libs/audiobook/spring';
import { moveTo, useSpringValue } from './useSpringValue';

interface WavySliderProps {
  value: number;
  max: number;
  /** The played part waves while playing, and lies flat when paused or dragged. */
  playing: boolean;
  ariaLabel: string;
  /** Keyboard step in the slider's own units. */
  step?: number;
  /** Glass draws a straight track instead of the wave. */
  glass?: boolean;
  /** Let the wave and the thumb move. Off on e-ink and in lite mode, where it only costs time. */
  animate?: boolean;
  /** The text in the bubble over the thumb while it is dragged. */
  formatBubble: (value: number) => string;
  onCommit: (value: number) => void;
  /** The dragged position, while a finger is down (null when it lets go). */
  onDrag?: (value: number | null) => void;
}

// Voice's ProgressWave and WavySeekBar numbers (dp, here px).
const STROKE = 5;
const AMPLITUDE = 1.75;
const WAVELENGTH = 44;
const WAVES_PER_SECOND = 0.2;
const INSET = 12;
const GAP = 5;
const TOUCH_HEIGHT = 48;
const SAMPLE = 1.5;
const PENDING_HOLD_MS = 1500;

/** The wave from `from` to `to` along the middle of the track, `amplitude` px high. */
const wavePath = (from: number, to: number, amplitude: number, phase: number) => {
  const mid = TOUCH_HEIGHT / 2;
  if (to <= from) return `M ${from} ${mid}`;
  if (amplitude < 0.01) return `M ${from} ${mid} L ${to} ${mid}`;
  let d = '';
  for (let x = from; x < to + SAMPLE; x += SAMPLE) {
    const px = Math.min(x, to);
    const y = mid + amplitude * Math.sin(((px - from) / WAVELENGTH) * Math.PI * 2 - phase);
    d += `${d ? ' L' : 'M'} ${px.toFixed(1)} ${y.toFixed(2)}`;
    if (px >= to) break;
  }
  return d;
};

/**
 * Voice's seek bar: a 5 px track with a vertical thumb, whose played part is a slowly moving wave
 * while the book plays and flattens (with a spring) when it pauses or is dragged. The thumb grows
 * tall with a bounce under the finger and a bubble with the time pops up over it. Dragging only
 * moves the thumb; the book jumps when the finger lifts, and the thumb waits where it was put
 * until the playback has caught up (or 1.5 seconds have passed).
 */
const WavySlider: React.FC<WavySliderProps> = ({
  value,
  max,
  playing,
  ariaLabel,
  step = 5,
  glass = false,
  animate = true,
  formatBubble,
  onCommit,
  onDrag,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePath = useRef<SVGPathElement>(null);
  const thumb = useRef<SVGRectElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const live = useRef({ amplitude: 0, phase: 0, width: 0, fraction: 0, thumbW: 5, thumbH: 28 });

  const safeMax = Math.max(max, 1);
  const track = Math.max(1, width - INSET * 2);
  const fraction = Math.min(1, Math.max(0, (drag ?? pending ?? value) / safeMax));

  const paint = () => {
    const l = live.current;
    const trackWidth = Math.max(1, l.width - INSET * 2);
    const x = INSET + trackWidth * l.fraction;
    const mid = TOUCH_HEIGHT / 2;
    activePath.current?.setAttribute(
      'd',
      wavePath(INSET, Math.max(INSET, x - GAP), l.amplitude, l.phase),
    );
    const t = thumb.current;
    if (t) {
      t.setAttribute('x', String(x - l.thumbW / 2));
      t.setAttribute('width', String(Math.max(0, l.thumbW)));
      t.setAttribute('y', String(mid - l.thumbH / 2));
      t.setAttribute('height', String(Math.max(0, l.thumbH)));
      t.setAttribute('rx', String(Math.max(0, l.thumbW) / 2));
    }
  };
  live.current.width = width;
  live.current.fraction = fraction;

  const wave = useSpringValue(0, spring(STIFFNESS.VeryLow), (v) => {
    live.current.amplitude = AMPLITUDE * v;
    paint();
  });
  const thumbHeight = useSpringValue(28, spring(STIFFNESS.Medium, 0.45), (v) => {
    live.current.thumbH = v;
    paint();
  });
  const thumbWidth = useSpringValue(5, spring(STIFFNESS.Medium), (v) => {
    live.current.thumbW = v;
    paint();
  });
  const bubbleScale = useSpringValue(0, spring(STIFFNESS.Medium, 0.5), (v) => {
    const el = bubble.current;
    if (!el) return;
    el.style.transform = `translateX(-50%) scale(${Math.max(0, v)})`;
    el.style.opacity = String(Math.min(1, Math.max(0, v)));
  });

  const dragging = drag !== null;
  const waving = playing && !dragging && !glass && animate;
  useEffect(() => {
    moveTo(wave, waving ? 1 : 0, animate);
    moveTo(thumbHeight, dragging ? 40 : 28, animate);
    moveTo(thumbWidth, dragging ? 3 : 5, animate);
    moveTo(bubbleScale, dragging ? 1 : 0, animate);
  }, [waving, dragging, animate, wave, thumbHeight, thumbWidth, bubbleScale]);

  // The wave moves with the clock, a fifth of a wave a second; frames only while it is visible.
  useEffect(() => {
    if (!animate || glass || (!playing && live.current.amplitude < 0.01 && !waving)) return;
    let frame = 0;
    let start = 0;
    const offset = live.current.phase;
    const tick = (time: number) => {
      if (!start) start = time;
      live.current.phase = offset + ((time - start) / 1000) * Math.PI * 2 * WAVES_PER_SECOND;
      paint();
      if (live.current.amplitude > 0.01 || waving) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, glass, playing, waving]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    live.current.fraction = fraction;
    paint();
  }, [fraction, width]);

  // Playback has caught up with where the thumb was put: let it follow the book again.
  useEffect(() => {
    if (pending !== null && Math.abs(value / safeMax - pending / safeMax) < 0.01) setPending(null);
  }, [value, pending, safeMax]);
  useEffect(
    () => () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    },
    [],
  );

  const valueAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const ratio = (clientX - rect.left - INSET) / Math.max(1, rect.width - INSET * 2);
    return Math.min(safeMax, Math.max(0, ratio * safeMax));
  };

  const commit = (next: number) => {
    onCommit(next);
    setPending(next);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => setPending(null), PENDING_HOLD_MS);
  };

  const shown = drag ?? pending ?? value;
  const bubbleLeft = Math.min(Math.max(INSET + track * fraction, 28), Math.max(28, width - 28));
  const mid = TOUCH_HEIGHT / 2;
  const thumbX = INSET + track * fraction;

  return (
    <div
      ref={ref}
      role='slider'
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.floor(safeMax)}
      aria-valuenow={Math.floor(shown)}
      className='relative w-full cursor-pointer touch-none select-none outline-none'
      style={{ height: TOUCH_HEIGHT }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const next = valueAt(e.clientX);
        setDrag(next);
        onDrag?.(next);
        navigator.vibrate?.(6);
      }}
      onPointerMove={(e) => {
        if (drag === null) return;
        const next = valueAt(e.clientX);
        setDrag(next);
        onDrag?.(next);
      }}
      onPointerUp={(e) => {
        if (drag === null) return;
        commit(valueAt(e.clientX));
        setDrag(null);
        onDrag?.(null);
      }}
      onPointerCancel={() => {
        setDrag(null);
        onDrag?.(null);
      }}
      onKeyDown={(e) => {
        const delta =
          e.key === 'ArrowRight' || e.key === 'ArrowUp'
            ? step
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
              ? -step
              : 0;
        if (!delta) return;
        e.preventDefault();
        commit(Math.min(safeMax, Math.max(0, value + delta)));
      }}
    >
      <svg
        width={width}
        height={TOUCH_HEIGHT}
        className='absolute inset-0 overflow-visible'
        aria-hidden
      >
        <path
          ref={activePath}
          d={wavePath(INSET, Math.max(INSET, thumbX - GAP), 0, 0)}
          fill='none'
          stroke='var(--ab-primary)'
          strokeWidth={STROKE}
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        <line
          x1={Math.min(width - INSET, thumbX + GAP)}
          x2={width - INSET}
          y1={mid}
          y2={mid}
          stroke='var(--ab-secondary-container)'
          strokeWidth={STROKE}
          strokeLinecap='round'
        />
        <circle cx={width - INSET} cy={mid} r={1.5} fill='var(--ab-primary)' />
        <rect
          ref={thumb}
          x={thumbX - 2.5}
          y={mid - 14}
          width={5}
          height={28}
          rx={2.5}
          fill='var(--ab-primary)'
        />
      </svg>
      <div
        ref={bubble}
        aria-hidden
        className='pointer-events-none absolute rounded-full px-3.5 py-1.5 text-sm font-semibold tabular-nums'
        style={{
          left: bubbleLeft,
          bottom: TOUCH_HEIGHT + 2,
          transformOrigin: '50% 100%',
          transform: 'translateX(-50%) scale(0)',
          opacity: 0,
          background: 'var(--ab-primary)',
          color: 'var(--ab-on-primary)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatBubble(shown)}
      </div>
    </div>
  );
};

export default WavySlider;

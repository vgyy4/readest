import React, { useEffect, useRef, useState } from 'react';

interface WavySliderProps {
  value: number;
  max: number;
  /** The played part waves while playing, and lies flat when paused. */
  playing: boolean;
  ariaLabel: string;
  /** Keyboard step in the slider's own units. */
  step?: number;
  /** Glass draws a straight track with a round, glassy thumb instead of the wave. */
  glass?: boolean;
  onCommit: (value: number) => void;
}

const HEIGHT = 40;
const STROKE = 4;
const WAVELENGTH = 26;
const AMPLITUDE = 3;
const THUMB_GAP = 8;

/**
 * Voice's seek bar: a thin track with a vertical thumb, whose played part is a
 * moving wave while the book plays. Drag or tap to seek; the new place is applied
 * when the finger lifts, and the arrow keys step it for keyboards and screen readers.
 */
const WavySlider: React.FC<WavySliderProps> = ({
  value,
  max,
  playing,
  ariaLabel,
  step = 5,
  glass = false,
  onCommit,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [phase, setPhase] = useState(0);
  const safeMax = Math.max(max, 1);
  const shown = drag ?? value;
  const thumbX = Math.min(width, Math.max(0, (shown / safeMax) * width));

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
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (time: number) => {
      setPhase((p) => (p + ((time - last) / 1000) * 5) % (Math.PI * 2));
      last = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const valueAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(safeMax, Math.max(0, ratio * safeMax));
  };

  const mid = HEIGHT / 2;
  const waveEnd = Math.max(0, thumbX - THUMB_GAP);
  const amplitude = playing && !glass ? AMPLITUDE : 0;
  let wave = `M ${STROKE / 2} ${mid}`;
  for (let x = STROKE / 2; x <= waveEnd; x += 2) {
    wave += ` L ${x} ${mid + amplitude * Math.sin((x / WAVELENGTH) * Math.PI * 2 + phase)}`;
  }

  return (
    <div
      ref={ref}
      role='slider'
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.floor(safeMax)}
      aria-valuenow={Math.floor(shown)}
      className='relative h-10 w-full cursor-pointer touch-none select-none outline-none'
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDrag(valueAt(e.clientX));
      }}
      onPointerMove={(e) => drag !== null && setDrag(valueAt(e.clientX))}
      onPointerUp={(e) => {
        if (drag === null) return;
        onCommit(valueAt(e.clientX));
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        const delta =
          e.key === 'ArrowRight' || e.key === 'ArrowUp'
            ? step
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
              ? -step
              : 0;
        if (!delta) return;
        e.preventDefault();
        onCommit(Math.min(safeMax, Math.max(0, value + delta)));
      }}
    >
      <svg width={width} height={HEIGHT} className='absolute inset-0 overflow-visible' aria-hidden>
        <path
          d={glass ? `M ${STROKE / 2} ${mid} L ${thumbX} ${mid}` : wave}
          fill='none'
          stroke='var(--ab-primary)'
          strokeWidth={glass ? 6 : STROKE}
          strokeLinecap='round'
        />
        <line
          x1={glass ? thumbX : Math.min(width, thumbX + THUMB_GAP)}
          x2={Math.max(0, width - STROKE)}
          y1={mid}
          y2={mid}
          stroke='var(--ab-track)'
          strokeWidth={glass ? 6 : STROKE}
          strokeLinecap='round'
        />
        {glass ? (
          <circle
            cx={thumbX}
            cy={mid}
            r={10}
            fill='var(--ab-primary)'
            stroke='rgba(255,255,255,0.6)'
            strokeWidth={3}
            style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}
          />
        ) : (
          <>
            <circle
              cx={Math.max(0, width - STROKE / 2)}
              cy={mid}
              r={2.5}
              fill='var(--ab-primary)'
            />
            <rect
              x={thumbX - 2}
              y={mid - 14}
              width={4}
              height={28}
              rx={2}
              fill='var(--ab-primary)'
            />
          </>
        )}
      </svg>
    </div>
  );
};

export default WavySlider;

import React, { useEffect, useRef } from 'react';
import { spring, STIFFNESS } from '@/libs/audiobook/spring';
import { moveTo, useSpringValue } from './useSpringValue';

interface BookProgressBarProps {
  /** One fraction of the book per chapter, as wide as the chapter is long. */
  segments: number[];
  /** Which segment is playing, and how far (0 to 1) the book is through it. */
  current: number;
  currentFraction: number;
  animate?: boolean;
}

// Voice's BookBar: dp here px.
const MAX_SEGMENTS = 120;
const BAR_HEIGHT = 12;
const GAP = 3;
const MIN_SEGMENT_WIDTH = 3;
const PLAYED_TRACK_ALPHA = 0.18;
const CURRENT_TRACK_ALPHA = 0.32;

/**
 * Voice's book progress: a pill per chapter, as wide as the chapter is long, with the one that
 * is playing twice as tall as the others. The part played is the primary color on a faint track
 * of it (a bit stronger on the current chapter). The fill glides to its place with a soft spring.
 * A book with more chapters than fit becomes a single thin bar.
 */
const BookProgressBar: React.FC<BookProgressBarProps> = ({
  segments,
  current,
  currentFraction,
  animate = true,
}) => {
  const fills = useRef<(HTMLDivElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const continuous = segments.length > MAX_SEGMENTS;
  const total = segments.reduce((a, b) => a + b, 0) || 1;
  const before = segments.slice(0, current).reduce((a, b) => a + b, 0);
  const overall = Math.min(1, (before + (segments[current] ?? 0) * currentFraction) / total);

  const starts = segments.map(
    (_, index) => segments.slice(0, index).reduce((sum, part) => sum + part, 0) / total,
  );

  const apply = (progress: number) => {
    if (continuous) {
      const el = fills.current[0];
      if (el) el.style.width = `${Math.min(1, Math.max(0, progress)) * 100}%`;
      return;
    }
    segments.forEach((fraction, index) => {
      const el = fills.current[index];
      if (!el) return;
      const share = fraction / total || 1;
      const filled = Math.min(1, Math.max(0, (progress - starts[index]!) / share));
      el.style.width = `${Math.round(filled * 10000) / 100}%`;
    });
  };
  const glide = useSpringValue(overall, spring(STIFFNESS.Low), apply);
  useEffect(() => {
    moveTo(glide, overall, animate);
  }, [overall, animate, glide]);
  // A new set of chapters (or a different current one) must be drawn at once.
  useEffect(() => {
    glide.snap(glide.value);
  }, [segments.length, current]);

  if (segments.length === 0) return null;
  const parts = continuous ? [1] : segments;

  return (
    <div
      ref={root}
      className='flex w-full items-center'
      style={{ height: BAR_HEIGHT, gap: continuous ? 0 : GAP }}
      aria-hidden
    >
      {parts.map((fraction, index) => {
        const isCurrent = !continuous && index === current;
        const height = continuous ? 6 : isCurrent ? BAR_HEIGHT : BAR_HEIGHT / 2;
        return (
          <div
            key={index}
            className='relative overflow-hidden'
            style={{
              flexGrow: fraction,
              flexBasis: 0,
              minWidth: MIN_SEGMENT_WIDTH,
              height,
              borderRadius: height / 2,
              transition: animate ? 'height 420ms cubic-bezier(0.34, 1.56, 0.64, 1)' : undefined,
            }}
          >
            <div
              className='absolute inset-0'
              style={{
                background: 'var(--ab-primary)',
                opacity: isCurrent ? CURRENT_TRACK_ALPHA : PLAYED_TRACK_ALPHA,
              }}
            />
            <div
              ref={(el) => {
                fills.current[index] = el;
              }}
              className='absolute inset-y-0 left-0'
              style={{ width: '0%', background: 'var(--ab-primary)' }}
            />
          </div>
        );
      })}
    </div>
  );
};

export default BookProgressBar;

import React from 'react';

interface BookProgressBarProps {
  /** One fraction of the book per chapter, as wide as the chapter is long. */
  segments: number[];
  /** Which segment is playing, and how far (0 to 1) the book is through it. */
  current: number;
  currentFraction: number;
}

const MAX_SEGMENTS = 120;

/**
 * Voice's book progress: a row of rounded pills, one per chapter and as wide as
 * the chapter is long. Finished chapters are filled, the one playing is part
 * filled with a round thumb, the rest wait. A book with very many chapters
 * becomes one continuous bar.
 */
const BookProgressBar: React.FC<BookProgressBarProps> = ({
  segments,
  current,
  currentFraction,
}) => {
  if (segments.length === 0) return null;
  const continuous = segments.length > MAX_SEGMENTS;
  const before = segments.slice(0, current).reduce((a, b) => a + b, 0);
  const overall = before + (segments[current] ?? 0) * currentFraction;
  const parts = continuous ? [1] : segments;
  return (
    <div className='flex h-3 w-full items-center gap-[3px]' aria-hidden>
      {parts.map((fraction, index) => {
        const done = continuous ? 0 : index < current;
        const active = continuous ? true : index === current;
        const fill = continuous ? overall : active ? currentFraction : done ? 1 : 0;
        return (
          <div
            key={index}
            className='relative h-2 min-w-[6px] overflow-visible rounded-full'
            style={{
              flexGrow: fraction,
              flexBasis: 0,
              background: 'var(--ab-track)',
            }}
          >
            <div
              className='absolute inset-y-0 left-0 rounded-full'
              style={{ width: `${Math.min(1, fill) * 100}%`, background: 'var(--ab-primary)' }}
            />
            {active && (
              <div
                className='absolute top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-r-full'
                style={{
                  left: `${Math.min(1, fill) * 100}%`,
                  background: 'var(--ab-primary)',
                  transform: 'translate(-1px, -50%)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BookProgressBar;

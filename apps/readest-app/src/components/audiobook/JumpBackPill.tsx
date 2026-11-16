import React from 'react';
import { MdUndo } from 'react-icons/md';
import { JUMP_VISIBLE_MS } from '@/libs/audiobook/player';
import { usePresence } from './usePresence';

interface JumpBackPillProps {
  /** Null while there is nothing to go back to. */
  pill: { id: number; text: string; visibleMs: number } | null;
  animate: boolean;
  onClick: () => void;
}

const RING = 22;
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Voice's "go back" pill: a capsule on the tertiary container with a ring around an undo arrow
 * that runs down over the ten seconds it stays. It pops in with a bounce and shrinks to 80% as it
 * leaves.
 */
const JumpBackPill: React.FC<JumpBackPillProps> = ({ pill, animate, onClick }) => {
  const [last, setLast] = React.useState(pill);
  React.useEffect(() => {
    if (pill) setLast(pill);
  }, [pill]);
  const present = usePresence(!!pill, 220);
  const shown = pill ?? last;
  if (!present || !shown) return null;
  const elapsed = Math.max(0, JUMP_VISIBLE_MS - shown.visibleMs);
  return (
    <button
      key={shown.id}
      type='button'
      className={`flex min-h-8 min-w-0 items-center gap-1.5 rounded-full pe-3 ps-1.5 text-sm font-semibold tabular-nums ${
        animate ? (pill ? 'ab-pill-in' : 'ab-pill-out') : ''
      }`}
      style={{
        background: 'var(--ab-tertiary-container)',
        color: 'var(--ab-on-tertiary-container)',
      }}
      onClick={onClick}
    >
      <span
        className='relative flex shrink-0 items-center justify-center'
        style={{ width: RING, height: RING }}
      >
        <svg
          width={RING}
          height={RING}
          viewBox={`0 0 ${RING} ${RING}`}
          className='absolute inset-0'
          aria-hidden
        >
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill='none'
            stroke='currentColor'
            strokeOpacity={0.2}
            strokeWidth={2}
          />
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            strokeLinecap='round'
            strokeDasharray={CIRCUMFERENCE}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            className='ab-ring'
            style={{
              animationDuration: `${JUMP_VISIBLE_MS}ms`,
              animationDelay: `-${elapsed}ms`,
              // Without the animation (lite mode) the ring is simply full.
              ['--ab-ring-length' as string]: CIRCUMFERENCE,
            }}
          />
        </svg>
        <MdUndo size={14} />
      </span>
      <span className='truncate'>{shown.text}</span>
    </button>
  );
};

export default JumpBackPill;

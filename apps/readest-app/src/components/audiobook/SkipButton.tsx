import React, { useEffect, useRef, useState } from 'react';
import { MdReplay } from 'react-icons/md';
import { fastOutSlowIn, spring, STIFFNESS, tween } from '@/libs/audiobook/spring';
import { moveTo, useSpringValue } from './useSpringValue';

interface SkipButtonProps {
  forward: boolean;
  seconds: number;
  label: string;
  /** The height in px; the width follows (a circle, and wider while pressed). */
  height: number;
  animate: boolean;
  onClick: () => void;
}

/**
 * Voice's skip button: a round button on the secondary container that stretches to 1.3x its width
 * and squares its corners to 25% under the finger (springs with a bounce), turns its arrow 40
 * degrees and lets it swing back on a tap, and sends a "+20" up and away from the top of the button.
 */
const SkipButton: React.FC<SkipButtonProps> = ({
  forward,
  seconds,
  label,
  height,
  animate,
  onClick,
}) => {
  const button = useRef<HTMLButtonElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const [bursts, setBursts] = useState<number[]>([]);
  const burstId = useRef(0);
  const turn = useRef<{ cancel: () => void } | null>(null);

  const stretch = useSpringValue(1, spring(STIFFNESS.Medium, 0.5), (v) => {
    if (button.current) button.current.style.width = `${height * v}px`;
  });
  const rounding = useSpringValue(50, spring(STIFFNESS.Medium, 0.5), (v) => {
    if (button.current) button.current.style.borderRadius = `${Math.max(0, v)}%`;
  });
  const swing = useSpringValue(0, spring(STIFFNESS.MediumLow, 0.35), (v) => {
    if (arrow.current) {
      arrow.current.style.transform = `rotate(${v * 40 * (forward ? 1 : -1)}deg) ${forward ? 'scaleX(-1)' : ''}`;
    }
  });

  useEffect(() => {
    stretch.snap(stretch.value);
  }, [height, stretch]);
  useEffect(() => () => turn.current?.cancel(), []);

  const press = (down: boolean) => {
    moveTo(stretch, down ? 1.3 : 1, animate);
    moveTo(rounding, down ? 25 : 50, animate);
  };

  const click = () => {
    if (animate) {
      navigator.vibrate?.(6);
      turn.current?.cancel();
      swing.stop();
      swing.snap(0);
      const run = tween(90, fastOutSlowIn, (p) => swing.snap(p));
      turn.current = run;
      void run.done.then(() => {
        if (turn.current === run) swing.to(0);
      });
      setBursts((all) => [...all, (burstId.current += 1)]);
    }
    onClick();
  };

  const sign = forward ? '+' : '−';

  return (
    <button
      ref={button}
      type='button'
      aria-label={label}
      data-surface=''
      className='relative flex shrink-0 items-center justify-center outline-none'
      style={{
        height,
        width: height,
        borderRadius: '50%',
        background: 'var(--ab-secondary-container)',
        color: 'var(--ab-on-secondary-container)',
        WebkitTapHighlightColor: 'transparent',
      }}
      onPointerDown={() => press(true)}
      onPointerUp={() => press(false)}
      onPointerLeave={() => press(false)}
      onPointerCancel={() => press(false)}
      onClick={click}
    >
      <span
        ref={arrow}
        className='flex items-center justify-center'
        style={{ transform: forward ? 'scaleX(-1)' : undefined }}
      >
        <MdReplay size={Math.round(height * 0.5)} />
      </span>
      {bursts.map((id) => (
        <span
          key={id}
          aria-hidden
          className='ab-skip-burst pointer-events-none absolute left-1/2 top-0 font-semibold'
          style={{ color: 'var(--ab-primary)' }}
          onAnimationEnd={() => setBursts((all) => all.filter((x) => x !== id))}
        >
          {sign}
          {seconds}
        </span>
      ))}
    </button>
  );
};

export default SkipButton;

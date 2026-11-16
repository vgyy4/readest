import React, { useEffect, useRef } from 'react';
import { morphPolygon, playPausePieces } from '@/libs/audiobook/shapes';
import { spring, STIFFNESS } from '@/libs/audiobook/spring';
import { moveTo, useSpringValue } from './useSpringValue';

interface PlayButtonProps {
  playing: boolean;
  label: string;
  /** Glass is a round frosted button instead of the morphing cookie. */
  glass?: boolean;
  /** A plain round button with no morphing (e-ink, lite mode). */
  flat?: boolean;
  /** Width and height in px: Voice uses 104, and 80 when the screen is short. */
  size?: number;
  onClick: () => void;
}

/**
 * Voice's play button: a nine-lobed cookie that morphs into a rounded square while playing (a
 * spring with a bounce), turns a quarter turn on every tap while the symbol inside stays upright,
 * shrinks to 86% under the finger and springs back, and the play triangle becomes the pause bars.
 */
const PlayButton: React.FC<PlayButtonProps> = ({
  playing,
  label,
  glass = false,
  flat = false,
  size = 104,
  onClick,
}) => {
  const shape = useRef<HTMLSpanElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const left = useRef<SVGPolygonElement>(null);
  const right = useRef<SVGPolygonElement>(null);
  const state = useRef({ morph: playing ? 1 : 0, turns: 0, press: 1 });
  const plain = glass || flat;

  const flush = () => {
    const { morph, turns, press } = state.current;
    if (shape.current) {
      if (!plain) shape.current.style.clipPath = morphPolygon(morph);
      shape.current.style.transform = `rotate(${turns * 90}deg) scale(${press})`;
    }
    // The symbol turns back by the same amount, so it never leans.
    if (icon.current) icon.current.style.transform = `rotate(${-turns * 90}deg)`;
    if (left.current && right.current) {
      const [a, b] = playPausePieces(Math.min(1.15, Math.max(-0.1, morph)));
      left.current.setAttribute('points', a);
      right.current.setAttribute('points', b);
    }
  };

  const morph = useSpringValue(playing ? 1 : 0, spring(STIFFNESS.MediumLow, 0.6), (v) => {
    state.current.morph = v;
    flush();
  });
  const turn = useSpringValue(0, spring(STIFFNESS.Low, 0.55), (v) => {
    state.current.turns = v;
    flush();
  });
  const press = useSpringValue(1, spring(STIFFNESS.Medium, 0.4), (v) => {
    state.current.press = v;
    flush();
  });
  const motion = !flat;
  const taps = useRef(0);

  useEffect(() => {
    moveTo(morph, playing ? 1 : 0, motion);
  }, [playing, motion, morph]);

  const down = () => moveTo(press, 0.86, motion);
  const up = () => moveTo(press, 1, motion);

  return (
    <button
      type='button'
      aria-label={label}
      data-surface={glass ? '' : undefined}
      className='relative flex shrink-0 items-center justify-center outline-none'
      style={{ width: size, height: size, WebkitTapHighlightColor: 'transparent' }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onClick={() => {
        taps.current += 1;
        moveTo(turn, taps.current, motion);
        onClick();
      }}
    >
      <span
        ref={shape}
        className='absolute inset-0 flex items-center justify-center'
        style={{
          background: glass ? 'var(--ab-container-high)' : 'var(--ab-primary)',
          color: glass ? 'var(--ab-text)' : 'var(--ab-on-primary)',
          borderRadius: plain ? '50%' : undefined,
          clipPath: plain ? undefined : morphPolygon(playing ? 1 : 0),
        }}
      >
        <span
          ref={icon}
          className='flex items-center justify-center'
          style={{ width: size * 0.4, height: size * 0.4 }}
        >
          <svg viewBox='4 4 16 16' width='100%' height='100%' aria-hidden fill='currentColor'>
            <polygon ref={left} points={playPausePieces(playing ? 1 : 0)[0]} />
            <polygon ref={right} points={playPausePieces(playing ? 1 : 0)[1]} />
          </svg>
        </span>
      </span>
    </button>
  );
};

export default PlayButton;

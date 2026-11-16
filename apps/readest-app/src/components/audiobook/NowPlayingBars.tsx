import React, { useEffect, useRef } from 'react';
import { Spring, spring, STIFFNESS } from '@/libs/audiobook/spring';

interface NowPlayingBarsProps {
  playing: boolean;
  /** Width and height in px (Voice draws them in 20 dp). */
  size?: number;
  color?: string;
  /** Let the bars move. Off on e-ink and in lite mode: they sit at the paused height. */
  animate?: boolean;
}

const BARS = 3;
/** One wave of the first bar takes this long (the others run 1.35x and 1.7x faster). */
const PERIOD = 1.1;

/**
 * Voice's "now playing" bars: three rounded bars that dance while the book plays and sink to a
 * short, even height when it is paused. The wave only runs while playing (no frames when paused).
 */
const NowPlayingBars: React.FC<NowPlayingBarsProps> = ({
  playing,
  size = 20,
  color = 'currentColor',
  animate = true,
}) => {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const amplitude = useRef<Spring | null>(null);
  const clock = useRef(0);
  const frame = useRef(0);
  const last = useRef(0);

  const draw = () => {
    const amp = amplitude.current?.value ?? 0;
    for (let i = 0; i < BARS; i++) {
      const bar = bars.current[i];
      if (!bar) continue;
      const phase = ((clock.current * Math.PI * 2) / PERIOD) * (1 + i * 0.35) + i * 2.1;
      const wave = 0.5 + 0.5 * Math.sin(phase);
      bar.style.height = `${size * (0.3 + 0.7 * amp * wave)}px`;
    }
  };

  useEffect(() => {
    amplitude.current = new Spring(0, spring(STIFFNESS.Medium), draw);
    draw();
    return () => {
      amplitude.current?.stop();
      cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on = playing && animate;
    amplitude.current?.to(on ? 1 : 0);
    if (!on) return;
    last.current = 0;
    const tick = (time: number) => {
      if (last.current) clock.current += (time - last.current) / 1000;
      last.current = time;
      draw();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, animate]);

  return (
    <span
      aria-hidden
      className='inline-flex items-center justify-between'
      style={{ width: size, height: size }}
    >
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          className='block'
          style={{
            width: size / 5,
            height: size * 0.3,
            borderRadius: size / 10,
            background: color,
          }}
        />
      ))}
    </span>
  );
};

export default NowPlayingBars;

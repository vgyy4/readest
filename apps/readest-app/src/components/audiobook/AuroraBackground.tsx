import React, { useEffect, useRef } from 'react';

interface AuroraBackgroundProps {
  /** The blobs drift while the book plays and hold still when it is paused. */
  playing: boolean;
  /** Off on e-ink and in lite mode: a plain surface. */
  animate: boolean;
}

// The blobs' paths, as in Voice's AuroraBackground (t in seconds of playing).
const blobs = (t: number) => [
  {
    x: 0.25 + 0.2 * Math.sin(0.21 * t),
    y: 0.18 + 0.1 * Math.cos(0.17 * t),
    scale: 1 + 0.08 * Math.sin(0.5 * t),
    color: 'var(--ab-aurora-1)',
    clear: 'var(--ab-aurora-1-clear)',
  },
  {
    x: 0.85 + 0.15 * Math.cos(0.19 * t + 1),
    y: 0.5 + 0.12 * Math.sin(0.23 * t),
    scale: 0.85,
    color: 'var(--ab-aurora-2)',
    clear: 'var(--ab-aurora-2-clear)',
  },
  {
    x: 0.2 + 0.25 * Math.sin(0.13 * t + 2),
    y: 0.95 + 0.06 * Math.cos(0.29 * t),
    scale: 1 + 0.1 * Math.cos(0.4 * t),
    color: 'var(--ab-aurora-3)',
    clear: 'var(--ab-aurora-3-clear)',
  },
];

/**
 * The surface behind the player with three big soft color blobs that drift slowly while the book
 * plays, tinted by the cover. Each is a radial gradient from the color to clear at 0.7 of the
 * longer side; only transforms change, about 30 times a second, and only while playing.
 */
const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ playing, animate }) => {
  const root = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const clock = useRef(0);

  const draw = () => {
    const box = root.current;
    if (!box) return;
    const width = box.clientWidth || window.innerWidth;
    const height = box.clientHeight || window.innerHeight;
    const radius = Math.max(width, height) * 0.7;
    blobs(clock.current).forEach((blob, i) => {
      const el = els.current[i];
      if (!el) return;
      const r = radius * blob.scale;
      el.style.width = el.style.height = `${r * 2}px`;
      el.style.transform = `translate3d(${blob.x * width - r}px, ${blob.y * height - r}px, 0)`;
    });
  };

  useEffect(() => {
    draw();
    if (!animate || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(draw);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [animate]);

  useEffect(() => {
    if (!animate || !playing) return;
    let frame = 0;
    let last = 0;
    const tick = (time: number) => {
      if (last === 0) last = time;
      if (time - last >= 33) {
        clock.current += (time - last) / 1000;
        last = time;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, playing]);

  return (
    <div
      ref={root}
      aria-hidden
      className='pointer-events-none absolute inset-0 overflow-hidden'
      style={{ background: 'var(--ab-surface)' }}
    >
      {animate &&
        blobs(0).map((blob, i) => (
          <div
            key={i}
            data-aurora-blob=''
            ref={(el) => {
              els.current[i] = el;
            }}
            className='absolute left-0 top-0 rounded-full'
            style={{
              willChange: 'transform',
              background: `radial-gradient(closest-side, ${blob.color}, ${blob.clear})`,
            }}
          />
        ))}
    </div>
  );
};

export default AuroraBackground;

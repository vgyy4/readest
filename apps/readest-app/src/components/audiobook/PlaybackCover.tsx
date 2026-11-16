import React, { useEffect, useRef, useState } from 'react';
import { MdHeadphones, MdPause, MdPlayArrow } from 'react-icons/md';
import { fastOutLinearIn, spring, STIFFNESS, tween } from '@/libs/audiobook/spring';
import { moveTo, useSpringValue } from './useSpringValue';

interface PlaybackCoverProps {
  src: string;
  title: string;
  playing: boolean;
  chapterIndex: number;
  /** Swiping the cover changes chapter (a book with one chapter has nothing to swipe to). */
  swipeable: boolean;
  animate: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onToggle: () => void;
  label: string;
}

/** The finger must pull the cover this far (of its width) for the swipe to count. */
const SWIPE_THRESHOLD = 0.28;
const DOUBLE_TAP_MS = 320;
const TAP_SLOP_PX = 12;

/**
 * The cover, as Voice's PlaybackCover: it grows to full size with a bounce when the book plays and
 * settles back to 86% with rounder corners when paused (the glow around it breathes with it). A
 * swipe drags it along with the finger, tilted and fading; past 28% of its width it goes to the
 * next or previous chapter, flies out, and the new chapter springs in from the other side. The
 * same flight plays when the chapter changes by a button, so every chapter change shows on the
 * cover. A double tap plays or pauses, with a pop of the new state.
 */
const PlaybackCover: React.FC<PlaybackCoverProps> = ({
  src,
  title,
  playing,
  chapterIndex,
  swipeable,
  animate,
  onNext,
  onPrevious,
  onToggle,
  label,
}) => {
  const area = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // The cover is the biggest square that fits the room it is given.
  const [side, setSide] = useState(0);
  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      setSide(Math.max(0, Math.floor(Math.min(w, h)) - 16));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const card = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [popShowsPlay, setPopShowsPlay] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const drag = useRef({ x: 0, rotation: 0, alpha: 1, scale: 1, radius: 14, glow: 4 });
  const flush = () => {
    const el = card.current;
    if (!el) return;
    const d = drag.current;
    el.style.transform = `translate3d(${d.x}px,0,0) rotate(${d.rotation}deg) scale(${d.scale})`;
    el.style.opacity = String(d.alpha);
    el.style.borderRadius = `${d.radius}%`;
    // Voice's elevation, drawn as a glow in the cover's own color.
    el.style.boxShadow = `0 ${d.glow * 0.5}px ${d.glow * 1.4}px var(--ab-glow)`;
  };
  const width = () => box.current?.getBoundingClientRect().width ?? 300;
  const setX = (x: number) => {
    const w = Math.max(1, width());
    const d = drag.current;
    d.x = x;
    d.rotation = (x / w) * 12;
    d.alpha = 1 - Math.min(Math.abs(x / w), 1) * 0.5;
    flush();
  };

  const offset = useSpringValue(0, spring(STIFFNESS.MediumLow, 0.6), setX);
  const size = useSpringValue(playing ? 1 : 0.86, spring(STIFFNESS.Low, 0.55), (v) => {
    drag.current.scale = v;
    flush();
  });
  const corners = useSpringValue(playing ? 8 : 14, spring(STIFFNESS.Low, 0.7), (v) => {
    drag.current.radius = v;
    flush();
  });
  const glow = useSpringValue(playing ? 28 : 4, spring(STIFFNESS.VeryLow), (v) => {
    drag.current.glow = v;
    flush();
  });

  useEffect(() => {
    moveTo(size, playing ? 1 : 0.86, animate);
    moveTo(corners, playing ? 8 : 14, animate);
    moveTo(glow, playing ? 28 : 4, animate);
  }, [playing, animate, size, corners, glow]);

  // The flight of a chapter change: out the way it is going, in from the other side.
  const flight = useRef<{ cancel: () => void } | null>(null);
  const flying = useRef(false);
  const fly = (direction: 1 | -1) => {
    flight.current?.cancel();
    flying.current = true;
    const w = width();
    const from = drag.current.x;
    offset.stop();
    const run = tween(160, fastOutLinearIn, (p) => setX(from + (direction * 1.3 * w - from) * p));
    flight.current = run;
    void run.done.then(() => {
      if (flight.current !== run) return;
      flying.current = false;
      offset.snap(-direction * 1.3 * w);
      offset.to(0, spring(STIFFNESS.Low, 0.65));
    });
  };

  const swipedChapter = useRef(false);
  const lastChapter = useRef(chapterIndex);
  useEffect(() => {
    const previous = lastChapter.current;
    lastChapter.current = chapterIndex;
    if (previous === chapterIndex) return;
    if (swipedChapter.current) {
      swipedChapter.current = false;
      return;
    }
    // A button or the list moved the book: the cover makes the same flight (forward goes left).
    if (animate) fly(chapterIndex > previous ? -1 : 1);
  }, [chapterIndex]);

  useEffect(
    () => () => {
      flight.current?.cancel();
    },
    [],
  );

  const gesture = useRef<{ id: number; startX: number; startY: number; dragging: boolean } | null>(
    null,
  );
  const lastTap = useRef(0);
  const crossed = useRef(false);

  const pop = useRef<{ cancel: () => void } | null>(null);
  const showPop = () => {
    setPopShowsPlay(!playing);
    pop.current?.cancel();
    const el = popRef.current;
    if (!el || !animate) return;
    el.style.display = 'flex';
    const run = tween(
      650,
      (p) => p,
      (p) => {
        el.style.opacity = String(p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85);
        el.style.transform = `translate(-50%,-50%) scale(${0.5 + 0.9 * (1 - (1 - p) * (1 - p))})`;
        if (p >= 1) el.style.display = 'none';
      },
    );
    pop.current = run;
  };
  useEffect(() => () => pop.current?.cancel(), []);

  const release = (cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const x = drag.current.x;
    if (!g.dragging) return;
    crossed.current = false;
    const w = width();
    if (cancelled) {
      offset.to(0, spring(STIFFNESS.Medium, 0.6));
    } else if (Math.abs(x) > w * SWIPE_THRESHOLD) {
      swipedChapter.current = true;
      if (x < 0) onNext();
      else onPrevious();
      fly(x < 0 ? -1 : 1);
    } else {
      offset.to(0, spring(STIFFNESS.MediumLow, 0.6));
    }
  };

  return (
    <div ref={area} className='relative min-h-0 w-full flex-1'>
      <div
        ref={box}
        className='relative flex items-center justify-center'
        style={side > 0 ? { width: side, height: side } : { width: '100%', aspectRatio: '1' }}
      >
        <div
          ref={card}
          className='ab-cover-card relative h-full w-full cursor-pointer select-none overflow-hidden outline-none'
          style={{
            // The card is as wide as the box and square; a tall box leaves room above and below.
            background: 'var(--ab-container)',
            touchAction: 'pan-y',
            willChange: animate ? 'transform' : undefined,
            transform: `scale(${playing ? 1 : 0.86})`,
            borderRadius: `${playing ? 8 : 14}%`,
            boxShadow: `0 ${(playing ? 28 : 4) * 0.5}px ${(playing ? 28 : 4) * 1.4}px var(--ab-glow)`,
          }}
          role='button'
          tabIndex={0}
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            } else if (swipeable && e.key === 'ArrowRight') onNext();
            else if (swipeable && e.key === 'ArrowLeft') onPrevious();
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            gesture.current = {
              id: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              dragging: false,
            };
            flight.current?.cancel();
            flying.current = false;
          }}
          onPointerMove={(e) => {
            const g = gesture.current;
            if (!g || g.id !== e.pointerId || !swipeable) return;
            const dx = e.clientX - g.startX;
            if (!g.dragging && Math.abs(dx) > TAP_SLOP_PX) {
              g.dragging = true;
              offset.stop();
            }
            if (!g.dragging) return;
            offset.snap(dx);
            const over = Math.abs(dx) > width() * SWIPE_THRESHOLD;
            if (over !== crossed.current) {
              crossed.current = over;
              if (over) navigator.vibrate?.(8);
            }
          }}
          onPointerUp={(e) => {
            const g = gesture.current;
            if (g && !g.dragging && Math.abs(e.clientX - g.startX) <= TAP_SLOP_PX) {
              const now = Date.now();
              if (now - lastTap.current < DOUBLE_TAP_MS) {
                lastTap.current = 0;
                showPop();
                onToggle();
              } else lastTap.current = now;
            }
            release(false);
          }}
          onPointerCancel={() => release(true)}
        >
          {src && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={title}
              className='h-full w-full object-cover'
              draggable={false}
              onError={() => setFailed(true)}
            />
          ) : (
            <span className='flex h-full w-full items-center justify-center'>
              <MdHeadphones size={96} style={{ opacity: 0.35 }} />
            </span>
          )}
          <div
            ref={popRef}
            aria-hidden
            className='pointer-events-none absolute left-1/2 top-1/2 hidden h-28 w-28 items-center justify-center rounded-full'
            style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', opacity: 0 }}
          >
            {popShowsPlay ? <MdPlayArrow size={64} /> : <MdPause size={64} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaybackCover;

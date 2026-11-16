import { type RefObject, useEffect, useRef } from 'react';
import { Spring, spring, STIFFNESS } from '@/libs/audiobook/spring';

interface SwipeDownOptions {
  /** The element that follows the finger down. */
  moveRef: RefObject<HTMLElement | null>;
  /** The list inside it that scrolls: a swipe only closes it from the top of that list. */
  scrollRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
  /** Leave at the end: the sheet flies off first (`fly`), or the caller's own exit takes over. */
  exit?: 'fly' | 'handoff';
  /** Touches that start here are left to something else (a slider has its own drag). */
  ignore?: (target: EventTarget | null) => boolean;
  onDismiss: () => void;
}

/** How far (px) or fast (px/ms) a swipe down must go to close. */
const MIN_DISTANCE = 140;
const FRACTION_OF_HEIGHT = 0.2;
const MIN_VELOCITY = 0.7;
const AXIS_SLOP = 8;

/**
 * Swipe down to close, as in Voice: the sheet or player follows the finger, and past about a fifth
 * of its height (or a quick flick) it leaves; before that it springs back. It starts only from the
 * top of the list inside it, only for a mostly vertical movement, and not on the parts that take
 * their own drags. Touch events, because a scrolling list owns the pointer events once it moves.
 */
export const useSwipeDown = ({
  moveRef,
  scrollRef,
  enabled = true,
  exit = 'fly',
  ignore,
  onDismiss,
}: SwipeDownOptions) => {
  const latest = useRef({ onDismiss, ignore, exit });
  latest.current = { onDismiss, ignore, exit };

  useEffect(() => {
    const el = moveRef.current;
    if (!el || !enabled) return;

    const apply = (y: number) => {
      el.style.transform = y === 0 ? '' : `translate3d(0, ${y}px, 0)`;
    };
    const back = new Spring(0, spring(STIFFNESS.Medium, 0.75), apply);

    let gesture: {
      x: number;
      y: number;
      time: number;
      axis: 'unknown' | 'vertical' | 'other';
      dy: number;
    } | null = null;

    const onStart = (event: TouchEvent) => {
      gesture = null;
      if (event.touches.length !== 1) return;
      if (latest.current.ignore?.(event.target)) return;
      back.stop();
      const touch = event.touches[0]!;
      gesture = { x: touch.clientX, y: touch.clientY, time: Date.now(), axis: 'unknown', dy: 0 };
    };

    const onMove = (event: TouchEvent) => {
      if (!gesture) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (gesture.axis === 'unknown') {
        if (Math.abs(dx) + Math.abs(dy) < AXIS_SLOP) return;
        const atTop = (scrollRef?.current?.scrollTop ?? 0) <= 0;
        gesture.axis = atTop && dy > 0 && dy > Math.abs(dx) * 1.2 ? 'vertical' : 'other';
      }
      if (gesture.axis !== 'vertical') return;
      if (event.cancelable) event.preventDefault();
      gesture.dy = Math.max(0, dy);
      back.snap(gesture.dy);
    };

    const onEnd = () => {
      const g = gesture;
      gesture = null;
      if (!g || g.axis !== 'vertical') return;
      const height = el.offsetHeight || window.innerHeight;
      const velocity = g.dy / Math.max(1, Date.now() - g.time);
      const closes =
        g.dy > Math.min(MIN_DISTANCE, height * FRACTION_OF_HEIGHT) || velocity > MIN_VELOCITY;
      if (!closes) {
        back.to(0);
        return;
      }
      if (latest.current.exit === 'fly') {
        el.style.transition = 'transform 180ms cubic-bezier(0.4, 0, 1, 1)';
        el.style.transform = `translate3d(0, ${height}px, 0)`;
        window.setTimeout(() => latest.current.onDismiss(), 170);
      } else {
        // The caller's own exit slides it the rest of the way; the offset is cleared once it is gone.
        latest.current.onDismiss();
        window.setTimeout(() => {
          back.snap(0);
        }, 700);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      back.stop();
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [moveRef, scrollRef, enabled]);
};

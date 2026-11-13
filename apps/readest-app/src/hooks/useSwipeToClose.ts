import { useRef } from 'react';

const MIN_DISTANCE = 80;

/** A long, mostly horizontal swipe toward the edge the drawer is attached to. */
export const swipeClosesPanel = (dx: number, dy: number, edge: 'left' | 'right') => {
  if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dy) > Math.abs(dx) / 2) return false;
  return edge === 'left' ? dx < 0 : dx > 0;
};

/**
 * Swipe a side drawer (sidebar, notebook) toward its edge to close it. The phone layout
 * already closes by dragging its handle; tablets show these as side panels, where only
 * the buttons closed them. Spread the result on the panel.
 */
export const useSwipeToClose = (edge: 'left' | 'right', enabled: boolean, onClose: () => void) => {
  const start = useRef<{ x: number; y: number } | null>(null);
  if (!enabled) return {};
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const from = start.current;
      start.current = null;
      const touch = e.changedTouches[0];
      if (!from || !touch) return;
      if (swipeClosesPanel(touch.clientX - from.x, touch.clientY - from.y, edge)) onClose();
    },
  };
};

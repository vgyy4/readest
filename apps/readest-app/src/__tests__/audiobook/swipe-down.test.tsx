import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useSwipeDown } from '@/components/audiobook/useSwipeDown';
import { Sheet } from '@/components/audiobook/AudiobookSheets';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

let frames: ((time: number) => void)[] = [];
let now = 0;
beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const settle = (ms: number) => {
  for (let t = 0; t < ms; t += 16) {
    now += 16;
    const pending = frames;
    frames = [];
    act(() => pending.forEach((f) => f(now)));
  }
};

const touch = (el: Element, type: 'Start' | 'Move' | 'End', x: number, y: number) =>
  type === 'End'
    ? fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: x, clientY: y }] })
    : fireEvent[`touch${type}`](el, { touches: [{ clientX: x, clientY: y }] });

describe('swipe down to close a sheet', () => {
  const open = () => {
    const onClose = vi.fn();
    render(
      <Sheet title='Chapters' onClose={onClose}>
        <p>list</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    const mover = dialog.parentElement!;
    // jsdom has no layout: give the sheet a height.
    Object.defineProperty(mover, 'offsetHeight', { value: 600, configurable: true });
    return { onClose, dialog, mover };
  };

  it('follows the finger, and leaves when it is pulled far enough', () => {
    const { onClose, dialog, mover } = open();
    touch(dialog, 'Start', 100, 100);
    touch(dialog, 'Move', 100, 160);
    touch(dialog, 'Move', 100, 300);
    expect(mover.style.transform).toContain('translate3d(0, 200px');
    touch(dialog, 'End', 100, 300);
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves a movement alone that something inside already took', () => {
    const { onClose, dialog, mover } = open();
    const inner = document.createElement('div');
    dialog.appendChild(inner);
    inner.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    touch(inner, 'Start', 100, 100);
    touch(inner, 'Move', 100, 160);
    touch(inner, 'Move', 100, 400);
    expect(mover.style.transform).toBe('');
    touch(inner, 'End', 100, 400);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('springs back when it is let go too soon', () => {
    const { onClose, dialog, mover } = open();
    vi.setSystemTime(1000);
    touch(dialog, 'Start', 100, 100);
    touch(dialog, 'Move', 100, 150);
    vi.setSystemTime(1500); // slowly: not a flick
    touch(dialog, 'End', 100, 150);
    settle(2000);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mover.style.transform).toBe('');
  });

  it('closes on a quick flick even if it is short', () => {
    const { onClose, dialog } = open();
    vi.setSystemTime(1000);
    touch(dialog, 'Start', 100, 100);
    touch(dialog, 'Move', 100, 170);
    vi.setSystemTime(1040);
    touch(dialog, 'End', 100, 170);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not start while the list is scrolled down, and ignores sideways moves', () => {
    const { onClose, dialog, mover } = open();
    dialog.scrollTop = 80;
    touch(dialog, 'Start', 100, 100);
    touch(dialog, 'Move', 100, 300);
    touch(dialog, 'End', 100, 300);
    dialog.scrollTop = 0;
    touch(dialog, 'Start', 100, 100);
    touch(dialog, 'Move', 300, 130);
    touch(dialog, 'End', 300, 130);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mover.style.transform).toBe('');
  });
});

describe('swipe down to close the player', () => {
  const Player = ({ onDismiss }: { onDismiss: () => void }) => {
    const root = useRef<HTMLDivElement>(null);
    useSwipeDown({
      moveRef: root,
      exit: 'handoff',
      ignore: (target) => target instanceof Element && !!target.closest('[role="slider"]'),
      onDismiss,
    });
    return (
      <div ref={root} data-testid='player'>
        <button type='button'>Back</button>
        <div
          role='slider'
          tabIndex={0}
          aria-label='Seek'
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        />
      </div>
    );
  };

  it('closes on a long swipe down and hands the exit over (no fly of its own)', () => {
    const onDismiss = vi.fn();
    render(<Player onDismiss={onDismiss} />);
    const player = screen.getByTestId('player');
    Object.defineProperty(player, 'offsetHeight', { value: 800, configurable: true });
    touch(player, 'Start', 200, 100);
    touch(player, 'Move', 200, 400);
    touch(player, 'End', 200, 400);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // The offset is cleared once the host's own exit has taken it away.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(player.style.transform).toBe('');
  });

  it('leaves the seek bar to its own drag', () => {
    const onDismiss = vi.fn();
    render(<Player onDismiss={onDismiss} />);
    const slider = screen.getByRole('slider');
    touch(slider, 'Start', 200, 100);
    touch(slider, 'Move', 200, 500);
    touch(slider, 'End', 200, 500);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

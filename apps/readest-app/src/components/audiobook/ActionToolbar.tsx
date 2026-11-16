import React, { useRef, useState } from 'react';
import { spring, STIFFNESS } from '@/libs/audiobook/spring';
import { burstPolygon } from '@/libs/audiobook/shapes';
import { moveTo, useSpringValue } from './useSpringValue';

interface ToolbarItemProps {
  label: string;
  active?: boolean;
  /** Text next to the icon (the time left on the sleep timer, the speed). */
  text?: string;
  animate: boolean;
  onClick: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
}

const LONG_PRESS_MS = 500;
const BURST = burstPolygon();

/**
 * One button of Voice's floating toolbar: 48 px tall, a pill that squares its corners (24 to 12) and
 * shrinks to 90% under the finger with a bounce. The one that is on turns the colors around.
 * A long press (when the item has one) fires after half a second.
 */
export const ToolbarItem: React.FC<ToolbarItemProps> = ({
  label,
  active = false,
  text,
  animate,
  onClick,
  onLongPress,
  children,
}) => {
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [burst, setBurst] = useState(0);

  const scale = useSpringValue(1, spring(STIFFNESS.Medium, 0.4), (v) => {
    if (button.current) button.current.style.transform = `scale(${v})`;
  });
  const radius = useSpringValue(24, spring(STIFFNESS.Medium, 0.5), (v) => {
    if (button.current) button.current.style.borderRadius = `${Math.max(0, v)}px`;
  });

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const down = () => {
    moveTo(scale, 0.9, animate);
    moveTo(radius, 12, animate);
    if (!onLongPress) return;
    longPressed.current = false;
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      longPressed.current = true;
      navigator.vibrate?.(12);
      setBurst((n) => n + 1);
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const up = () => {
    moveTo(scale, 1, animate);
    moveTo(radius, 24, animate);
    cancel();
  };

  return (
    <button
      ref={button}
      type='button'
      aria-label={label}
      aria-pressed={active || undefined}
      className='relative flex h-12 min-w-12 items-center justify-center gap-1 text-sm font-semibold tabular-nums outline-none'
      style={{
        borderRadius: 24,
        paddingInline: text ? 10 : 12,
        background: active ? 'var(--ab-on-primary-container)' : 'transparent',
        color: active ? 'var(--ab-primary-container)' : 'inherit',
        WebkitTapHighlightColor: 'transparent',
        transition: animate ? 'background-color 200ms, color 200ms' : undefined,
      }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onClick();
      }}
    >
      {children}
      {text && <span>{text}</span>}
      {burst > 0 && animate && (
        <span
          key={burst}
          aria-hidden
          className='ab-burst pointer-events-none absolute left-1/2 top-1/2 h-12 w-12'
          style={{ background: 'var(--ab-tertiary-container)', clipPath: BURST }}
        />
      )}
    </button>
  );
};

/** The floating pill the toolbar buttons sit in, on the primary container. */
const ActionToolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className='inline-flex items-center gap-1 rounded-full p-2'
    data-surface=''
    style={{
      background: 'var(--ab-primary-container)',
      color: 'var(--ab-on-primary-container)',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
    }}
  >
    {children}
  </div>
);

export default ActionToolbar;

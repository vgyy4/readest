import React, { useEffect, useRef, useState } from 'react';
import { MdExpandMore, MdSkipNext, MdSkipPrevious } from 'react-icons/md';
import MarqueeText from './MarqueeText';

interface ChapterSwitcherProps {
  /** 1-based, as shown. */
  number: number;
  count: number;
  title?: string;
  counterLabel: string;
  previousLabel: string;
  nextLabel: string;
  animate: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onOpen: () => void;
}

interface Label {
  number: number;
  title?: string;
  counter: string;
}

const Content: React.FC<{ label: Label; animate: boolean }> = ({ label, animate }) => (
  <>
    <span className='block text-xs font-medium' style={{ color: 'var(--ab-primary)' }}>
      {label.counter}
    </span>
    {label.title && (
      <MarqueeText
        text={label.title}
        animate={animate}
        className='font-book text-base font-semibold leading-snug'
      />
    )}
  </>
);

/**
 * Voice's chapter switcher: previous, the chapter (tap for the list), next. When the chapter
 * changes the old name slides out and the new one slides in from the side the book is going,
 * half the width, fading as they cross.
 */
const ChapterSwitcher: React.FC<ChapterSwitcherProps> = ({
  number,
  count,
  title,
  counterLabel,
  previousLabel,
  nextLabel,
  animate,
  onPrevious,
  onNext,
  onOpen,
}) => {
  const label: Label = { number, title, counter: counterLabel };
  const [shown, setShown] = useState(label);
  const [leaving, setLeaving] = useState<{ label: Label; forward: boolean } | null>(null);
  const [entering, setEntering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (shown.number === number && shown.title === title && shown.counter === counterLabel) return;
    const forward = number >= shown.number;
    if (animate) {
      setLeaving({ label: shown, forward });
      setEntering(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setLeaving(null);
        setEntering(false);
      }, 450);
    }
    setShown({ number, title, counter: counterLabel });
  }, [number, title, counterLabel, animate]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const forward = leaving?.forward ?? true;
  return (
    <div className='flex w-full items-center gap-2'>
      <button
        type='button'
        className='ab-tonal flex h-14 w-14 shrink-0 items-center justify-center disabled:opacity-30'
        data-surface=''
        style={{
          background: 'var(--ab-secondary-container)',
          color: 'var(--ab-on-secondary-container)',
        }}
        aria-label={previousLabel}
        disabled={number <= 1}
        onClick={onPrevious}
      >
        <MdSkipPrevious size={24} />
      </button>
      <button
        type='button'
        className='ab-press flex min-h-14 min-w-0 flex-1 items-center overflow-hidden py-2 ps-4 pe-3 text-start'
        data-surface=''
        style={{ background: 'var(--ab-surface-highest)', borderRadius: 20 }}
        onClick={onOpen}
      >
        <span className='relative block min-w-0 flex-1'>
          {leaving && (
            <span
              key={`out-${leaving.label.number}`}
              aria-hidden
              className={`absolute inset-0 block ${leaving.forward ? 'ab-slide-out-forward' : 'ab-slide-out-back'}`}
            >
              <Content label={leaving.label} animate={false} />
            </span>
          )}
          <span
            key={`in-${shown.number}`}
            className={`block ${entering ? (forward ? 'ab-slide-in-forward' : 'ab-slide-in-back') : ''}`}
          >
            <Content label={shown} animate={animate} />
          </span>
        </span>
        <MdExpandMore
          size={24}
          className='ms-2 shrink-0'
          style={{ color: 'var(--ab-text-muted)' }}
        />
      </button>
      <button
        type='button'
        className='ab-tonal flex h-14 w-14 shrink-0 items-center justify-center disabled:opacity-30'
        data-surface=''
        style={{
          background: 'var(--ab-secondary-container)',
          color: 'var(--ab-on-secondary-container)',
        }}
        aria-label={nextLabel}
        disabled={number >= count}
        onClick={onNext}
      >
        <MdSkipNext size={24} />
      </button>
    </div>
  );
};

export default ChapterSwitcher;

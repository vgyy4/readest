import clsx from 'clsx';
import React, { useState } from 'react';
import { MdAdd, MdBookmarkAdd, MdDeleteOutline, MdMoreHoriz, MdRemove } from 'react-icons/md';
import { playButtonPolygon } from '@/libs/audiobook/shapes';
import { BookNote } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { type UiStyle, UI_STYLES, uiStyleLabel } from '@/libs/uiStyle';
import { bookmarkSeconds } from '@/hooks/useAudiobook';
import {
  AudioChapter,
  clampSkip,
  clampSpeed,
  formatClock,
  MAX_CUSTOM_SLEEP,
  MAX_SKIP_SECONDS,
  MAX_SPEED,
  MIN_CUSTOM_SLEEP,
  MIN_SKIP_SECONDS,
  MIN_SPEED,
  SKIP_STEP_SECONDS,
  SLEEP_MINUTES,
  SPEED_PRESETS,
  SPEED_STEP,
  type SleepOption,
} from '@/libs/audiobook/player';

export const Sheet: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Something at the right of the title (the chapter count). */
  aside?: React.ReactNode;
  /** Nearly full height, for a long list. */
  tall?: boolean;
}> = ({ title, onClose, children, aside, tall = false }) => (
  <div
    className='fixed inset-0 z-50 flex items-end bg-black/40'
    onClick={onClose}
    role='presentation'
  >
    <div
      role='dialog'
      aria-label={title}
      className={clsx(
        'ab-sheet-in mx-auto w-full max-w-md overflow-y-auto rounded-t-[28px] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
        tall ? 'h-[86vh]' : 'max-h-[78vh]',
      )}
      data-surface=''
      style={{ background: 'var(--ab-container-high)', color: 'var(--ab-text)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className='mx-auto mb-3 h-1 w-10 rounded-full'
        style={{ background: 'var(--ab-text-muted)', opacity: 0.4 }}
      />
      <div className='mb-3 flex items-baseline justify-between px-2'>
        <h2 className='font-serif text-[28px] leading-tight'>{title}</h2>
        {aside}
      </div>
      {children}
    </div>
  </div>
);

const roundButton =
  'ab-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-30';

const Stepper: React.FC<{
  value: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
}> = ({
  value,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
  canDecrease = true,
  canIncrease = true,
}) => (
  <div className='flex items-center justify-center gap-6'>
    <button
      type='button'
      aria-label={decreaseLabel}
      disabled={!canDecrease}
      className={roundButton}
      data-surface=''
      style={{ background: 'var(--ab-container)' }}
      onClick={onDecrease}
    >
      <MdRemove size={22} />
    </button>
    <span className='min-w-24 text-center font-serif text-3xl tabular-nums'>{value}</span>
    <button
      type='button'
      aria-label={increaseLabel}
      disabled={!canIncrease}
      className={roundButton}
      data-surface=''
      style={{ background: 'var(--ab-container)' }}
      onClick={onIncrease}
    >
      <MdAdd size={22} />
    </button>
  </div>
);

const chip = (active: boolean) =>
  clsx('ab-press rounded-full px-4 py-2 text-sm', active && 'ab-chosen font-semibold');

const chipStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--ab-primary)' : 'var(--ab-container)',
  color: active ? 'var(--ab-on-primary)' : 'var(--ab-text)',
});

/** The scalloped "cookie" Voice puts on the chapter that is playing. */
const COOKIE = playButtonPolygon(false);

export const ChapterSheet: React.FC<{
  chapters: AudioChapter[];
  current: number;
  onPick: (chapter: AudioChapter) => void;
  onClose: () => void;
}> = ({ chapters, current, onPick, onClose }) => {
  const _ = useTranslation();
  // Open at the chapter that is playing, not at the top of a long list.
  const scrollToCurrent = (el: HTMLLIElement | null) => el?.scrollIntoView?.({ block: 'center' });
  return (
    <Sheet
      title={_('Chapters')}
      onClose={onClose}
      aside={
        <span className='text-base tabular-nums' style={{ color: 'var(--ab-primary)' }}>
          {current + 1} / {chapters.length}
        </span>
      }
      tall
    >
      <ul className='flex flex-col gap-1.5'>
        {chapters.map((chapter, index) => {
          const playing = index === current;
          return (
            <li
              key={`${index}-${chapter.start}`}
              // The rows nearest the one playing arrive first, then the sheet settles.
              className='ab-row-in'
              style={{ '--i': Math.min(Math.abs(index - current), 12) } as React.CSSProperties}
              ref={playing ? scrollToCurrent : undefined}
            >
              <button
                type='button'
                aria-current={playing ? 'true' : undefined}
                className='ab-press flex w-full items-center gap-4 rounded-[22px] px-4 py-3.5 text-start'
                style={{
                  background: playing ? 'var(--ab-primary)' : 'var(--ab-container)',
                  color: playing ? 'var(--ab-on-primary)' : 'var(--ab-text)',
                }}
                onClick={() => onPick(chapter)}
              >
                {playing ? (
                  <span
                    data-chapter-playing=''
                    className='flex h-11 w-11 shrink-0 items-center justify-center'
                    style={{ clipPath: COOKIE, background: 'var(--ab-container-high)' }}
                  >
                    <MdMoreHoriz size={22} style={{ color: 'var(--ab-text)' }} />
                  </span>
                ) : (
                  <span
                    data-chapter-number=''
                    className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-medium tabular-nums'
                    style={{ background: 'var(--ab-container-high)', color: 'var(--ab-primary)' }}
                  >
                    {index + 1}
                  </span>
                )}
                <span className='min-w-0 flex-1 font-serif text-lg leading-snug'>
                  {chapter.title}
                </span>
                <span
                  className='shrink-0 text-sm tabular-nums'
                  style={{ color: playing ? 'var(--ab-on-primary)' : 'var(--ab-text-muted)' }}
                >
                  {formatClock(chapter.start)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
};

export const SleepSheet: React.FC<{
  active: SleepOption;
  onPick: (option: SleepOption) => void;
  onClose: () => void;
}> = ({ active, onPick, onClose }) => {
  const _ = useTranslation();
  const [custom, setCustom] = useState(45);
  return (
    <Sheet title={_('Sleep timer')} onClose={onClose}>
      <div className='flex flex-wrap gap-2 px-2'>
        {SLEEP_MINUTES.map((minutes) => {
          const on = active?.kind === 'minutes' && active.minutes === minutes;
          return (
            <button
              key={minutes}
              type='button'
              className={chip(on)}
              style={chipStyle(on)}
              onClick={() => onPick({ kind: 'minutes', minutes })}
            >
              {_('{{count}} minutes', { count: minutes })}
            </button>
          );
        })}
        <button
          type='button'
          className={chip(active?.kind === 'chapter')}
          style={chipStyle(active?.kind === 'chapter')}
          onClick={() => onPick({ kind: 'chapter' })}
        >
          {_('End of chapter')}
        </button>
      </div>
      <p className='mt-5 px-2 text-sm' style={{ color: 'var(--ab-text-muted)' }}>
        {_('Custom')}
      </p>
      <div className='mt-2 flex flex-col items-center gap-3'>
        <Stepper
          value={_('{{count}} min', { count: custom })}
          decreaseLabel={_('Fewer minutes')}
          increaseLabel={_('More minutes')}
          canDecrease={custom > MIN_CUSTOM_SLEEP}
          canIncrease={custom < MAX_CUSTOM_SLEEP}
          onDecrease={() => setCustom((c) => Math.max(MIN_CUSTOM_SLEEP, c - 5))}
          onIncrease={() => setCustom((c) => Math.min(MAX_CUSTOM_SLEEP, c + 5))}
        />
        <button
          type='button'
          className='rounded-full px-6 py-2 text-sm font-semibold'
          style={{ background: 'var(--ab-primary)', color: 'var(--ab-on-primary)' }}
          onClick={() => onPick({ kind: 'minutes', minutes: custom })}
        >
          {_('Start')}
        </button>
      </div>
    </Sheet>
  );
};

export const SpeedSheet: React.FC<{
  speed: number;
  onChange: (speed: number) => void;
  onClose: () => void;
}> = ({ speed, onChange, onClose }) => {
  const _ = useTranslation();
  const shown = `${(Math.round(speed * 100) / 100).toString()}×`;
  return (
    <Sheet title={_('Playback speed')} onClose={onClose}>
      <Stepper
        value={shown}
        decreaseLabel={_('Slower')}
        increaseLabel={_('Faster')}
        canDecrease={speed > MIN_SPEED}
        canIncrease={speed < MAX_SPEED}
        onDecrease={() => onChange(clampSpeed(speed - SPEED_STEP))}
        onIncrease={() => onChange(clampSpeed(speed + SPEED_STEP))}
      />
      <input
        type='range'
        aria-label={_('Playback speed')}
        className='range range-sm mt-4 w-full'
        min={MIN_SPEED}
        max={MAX_SPEED}
        step={SPEED_STEP}
        value={speed}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className='mt-3 flex flex-wrap justify-center gap-2'>
        {SPEED_PRESETS.map((preset) => {
          const on = Math.abs(speed - preset) < 0.01;
          return (
            <button
              key={preset}
              type='button'
              className={chip(on)}
              style={chipStyle(on)}
              onClick={() => onChange(preset)}
            >
              {preset}×
            </button>
          );
        })}
      </div>
    </Sheet>
  );
};

export const BookmarksSheet: React.FC<{
  bookmarks: BookNote[];
  onSave: () => void;
  onGo: (bookmark: BookNote) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}> = ({ bookmarks, onSave, onGo, onRemove, onClose }) => {
  const _ = useTranslation();
  const sorted = [...bookmarks].sort((a, b) => bookmarkSeconds(a) - bookmarkSeconds(b));
  return (
    <Sheet title={_('Bookmarks')} onClose={onClose}>
      {sorted.length === 0 ? (
        <p className='px-2 py-4 text-sm' style={{ color: 'var(--ab-text-muted)' }}>
          {_('No bookmarks yet. Save a moment to come back to it.')}
        </p>
      ) : (
        <ul>
          {sorted.map((bookmark) => (
            <li key={bookmark.id} className='flex items-center gap-1'>
              <button
                type='button'
                className='min-w-0 flex-1 rounded-2xl px-3 py-3 text-start'
                onClick={() => onGo(bookmark)}
              >
                <span className='block truncate font-medium'>
                  {bookmark.note || bookmark.text || _('Bookmark')}
                </span>
                <span
                  className='block text-xs tabular-nums'
                  style={{ color: 'var(--ab-text-muted)' }}
                >
                  {formatClock(bookmarkSeconds(bookmark))}
                  {bookmark.note && bookmark.text ? ` · ${bookmark.text}` : ''}
                </span>
              </button>
              <button
                type='button'
                aria-label={_('Delete bookmark')}
                className={roundButton}
                onClick={() => onRemove(bookmark.id)}
              >
                <MdDeleteOutline size={20} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className='mt-3 flex justify-end'>
        <button
          type='button'
          className='flex items-center gap-2 rounded-2xl px-5 py-3 font-medium shadow-md'
          style={{ background: 'var(--ab-primary)', color: 'var(--ab-on-primary)' }}
          onClick={onSave}
        >
          <MdBookmarkAdd size={22} />
          {_('Save this moment')}
        </button>
      </div>
    </Sheet>
  );
};

export const PlayerSettingsSheet: React.FC<{
  seconds: number;
  style: UiStyle;
  onStyleChange: (style: UiStyle) => void;
  onChange: (seconds: number) => void;
  onClose: () => void;
}> = ({ seconds, style, onStyleChange, onChange, onClose }) => {
  const _ = useTranslation();
  return (
    <Sheet title={_('Player settings')} onClose={onClose}>
      <p className='mb-2 px-2 text-sm' style={{ color: 'var(--ab-text-muted)' }}>
        {_('Style (the whole app)')}
      </p>
      <div className='mb-6 flex justify-center gap-2'>
        {UI_STYLES.map((option) => (
          <button
            key={option}
            type='button'
            aria-pressed={style === option}
            className={chip(style === option)}
            style={chipStyle(style === option)}
            onClick={() => onStyleChange(option)}
          >
            {uiStyleLabel(_, option)}
          </button>
        ))}
      </div>
      <p className='mb-4 px-2 text-sm' style={{ color: 'var(--ab-text-muted)' }}>
        {_('Skip amount: how far rewind and fast forward jump')}
      </p>
      <Stepper
        value={_('{{count}} seconds', { count: seconds })}
        decreaseLabel={_('Shorter skip')}
        increaseLabel={_('Longer skip')}
        canDecrease={seconds > MIN_SKIP_SECONDS}
        canIncrease={seconds < MAX_SKIP_SECONDS}
        onDecrease={() => onChange(clampSkip(seconds - SKIP_STEP_SECONDS))}
        onIncrease={() => onChange(clampSkip(seconds + SKIP_STEP_SECONDS))}
      />
    </Sheet>
  );
};

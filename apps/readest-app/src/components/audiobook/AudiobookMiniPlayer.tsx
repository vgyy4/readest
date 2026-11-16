import clsx from 'clsx';
import React, { useEffect, useMemo, useState } from 'react';
import { MdClose, MdHeadphones, MdPause, MdPlayArrow } from 'react-icons/md';
import type { Book } from '@/types/book';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useHtmlAttribute, useIsEink } from '@/hooks/useHtmlAttribute';
import { useUiStyle } from '@/hooks/useUiStyle';
import { buildEinkPalette, buildGlassPalette, buildPalette } from '@/libs/audiobook/palette';
import { bookPercent } from '@/libs/audiobook/player';
import type { AudiobookPlayerState } from './AudiobookPlayer';

interface AudiobookMiniPlayerProps {
  book: Book;
  player: AudiobookPlayerState;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * The audiobook that is playing, as a card at the bottom of every page (the Voice app's
 * "currently playing" bar): cover, title, the chapter, play and pause, and how far through the
 * book it is. Tap it to open the full player; the cross stops the book.
 */
const AudiobookMiniPlayer: React.FC<AudiobookMiniPlayerProps> = ({
  book,
  player,
  visible,
  onOpen,
  onClose,
}) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const [uiStyle] = useUiStyle();
  const eink = useIsEink();
  const lite = useHtmlAttribute('data-perf') === 'low';
  const glass = uiStyle === 'glass' && !eink;
  const palette = useMemo(() => {
    if (eink) return buildEinkPalette();
    const color = player.color ?? { hue: 215, saturation: 0.7 };
    return glass ? buildGlassPalette(color, isDarkMode) : buildPalette(color, isDarkMode);
  }, [player.color, isDarkMode, glass, eink]);

  // A cover that cannot be loaded gets headphones rather than a broken-picture icon.
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => setCoverFailed(false), [player.coverUrl]);

  // Mounted while it is showing and while it slides away, not for the rest of the time.
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 500);
    return () => clearTimeout(timer);
  }, [visible]);

  const percent = bookPercent(player.position, player.duration);
  const subtitle = player.chapters.length > 1 ? player.chapter?.title : book.author;

  if (!mounted && !visible) return null;

  return (
    <div
      className={clsx(
        'ab-mini fixed inset-x-3 z-[60] mx-auto max-w-md',
        'bottom-[max(0.75rem,env(safe-area-inset-bottom))]',
        visible ? 'ab-mini-in' : 'ab-mini-out',
        !lite && !eink && 'ab-spring',
      )}
      style={palette as React.CSSProperties}
      aria-hidden={!visible}
    >
      <div
        className='relative flex items-center gap-3 overflow-hidden rounded-[28px] p-2 pe-2 shadow-xl'
        data-surface=''
        style={{
          background: glass ? 'var(--ab-container)' : 'var(--ab-container-high)',
          color: 'var(--ab-text)',
          border: eink ? '1px solid #000' : undefined,
        }}
      >
        <button
          type='button'
          aria-label={_('Open the player')}
          tabIndex={visible ? 0 : -1}
          className='ab-press flex min-w-0 flex-1 items-center gap-3 rounded-[22px] text-start'
          onClick={onOpen}
        >
          <span
            className='flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px]'
            style={{ background: 'var(--ab-container)' }}
          >
            {player.coverUrl && !coverFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.coverUrl}
                alt=''
                className='h-full w-full object-cover'
                draggable={false}
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <MdHeadphones size={26} style={{ opacity: 0.5 }} />
            )}
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate font-serif text-base leading-tight'>{book.title}</span>
            {subtitle && (
              <span
                className='block truncate text-sm leading-tight'
                style={{ color: 'var(--ab-text-muted)' }}
              >
                {subtitle}
              </span>
            )}
          </span>
        </button>
        <button
          type='button'
          aria-label={player.playing ? _('Pause') : _('Play')}
          tabIndex={visible ? 0 : -1}
          className='ab-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full'
          style={{ background: 'var(--ab-primary)', color: 'var(--ab-on-primary)' }}
          onClick={player.toggle}
        >
          {player.playing ? <MdPause size={28} /> : <MdPlayArrow size={30} />}
        </button>
        <button
          type='button'
          aria-label={_('Stop and close')}
          tabIndex={visible ? 0 : -1}
          className='ab-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full'
          style={{ color: 'var(--ab-text-muted)' }}
          onClick={onClose}
        >
          <MdClose size={20} />
        </button>
        <div
          role='progressbar'
          aria-label={_('Progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className='absolute inset-x-5 bottom-0 h-[3px] overflow-hidden rounded-full'
          style={{ background: 'var(--ab-track)' }}
        >
          <div
            className='h-full rounded-full'
            style={{ width: `${percent}%`, background: 'var(--ab-primary)' }}
          />
        </div>
      </div>
    </div>
  );
};

export default AudiobookMiniPlayer;

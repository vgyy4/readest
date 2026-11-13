import clsx from 'clsx';
import React, { useMemo, useRef, useState } from 'react';
import {
  MdBedtime,
  MdBedtimeOff,
  MdCollectionsBookmark,
  MdExpandMore,
  MdHeadphones,
  MdMoreVert,
  MdReplay,
  MdSkipNext,
  MdSkipPrevious,
  MdSpeed,
  MdUndo,
  MdViewList,
} from 'react-icons/md';
import { Book } from '@/types/book';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useAudiobook } from '@/hooks/useAudiobook';
import { buildEinkPalette, buildGlassPalette, buildPalette } from '@/libs/audiobook/palette';
import { useHtmlAttribute, useIsEink } from '@/hooks/useHtmlAttribute';
import { useUiStyle } from '@/hooks/useUiStyle';
import {
  bookPercent,
  chapterSegments,
  formatClock,
  formatRemainingInChapter,
  jumpPill,
  remainingAtSpeed,
} from '@/libs/audiobook/player';
import BookProgressBar from './BookProgressBar';
import PlayButton from './PlayButton';
import WavySlider from './WavySlider';
import {
  BookmarksSheet,
  ChapterSheet,
  PlayerSettingsSheet,
  SleepSheet,
  SpeedSheet,
} from './AudiobookSheets';

interface AudiobookPlayerProps {
  book: Book;
  onBack: () => void;
}

type Sheet = 'chapters' | 'sleep' | 'speed' | 'bookmarks' | 'skip' | null;

// Liquid glass: frosted, translucent surfaces with a bright rim. backdrop-filter works on
// iOS 15 Safari only with the -webkit- prefix, and on Android System WebView from Chrome 76.
const GLASS_CSS = `
.ab-glass [data-surface] {
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  backdrop-filter: blur(22px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.32);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 -1px 0 rgba(255, 255, 255, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.18);
}
.ab-glass > header, .ab-glass > main, .ab-glass > [role='presentation'] { position: relative; z-index: 1; }
.ab-glass > [role='presentation'] { position: fixed; z-index: 50; }
`;

const SWIPE_PX = 60;
const LONG_PRESS_MS = 500;

const tonalButton = 'flex h-12 w-12 items-center justify-center rounded-full disabled:opacity-30';

/**
 * The audiobook screen, modelled on the Voice audiobook player (Voice is open
 * source, MIT): colors taken from the cover, a big rounded cover you tap to play
 * and swipe to change chapter, book progress as one pill per chapter, a chapter
 * switcher, a wavy seek bar for the chapter with a "Back to" chip after a big
 * jump, a morphing play button, and a toolbar for sleep timer, speed and
 * bookmarks. The same screen runs on Android, iOS and desktop.
 */
const AudiobookPlayer: React.FC<AudiobookPlayerProps> = ({ book, onBack }) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const player = useAudiobook(book);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saved, setSaved] = useState(false);
  const swipe = useRef<number | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { chapters, position, duration, speed, chapterIndex } = player;
  const chapter = player.chapter;
  // The player follows the app-wide style; the classic look has no player of its own, so it gets Material.
  const [uiStyle, setUiStyle] = useUiStyle();
  const eink = useIsEink();
  const lite = useHtmlAttribute('data-perf') === 'low';
  // E-ink has no gradients, tints or glass: black on white with borders.
  const glass = uiStyle === 'glass' && !eink;
  const animate = !eink && !lite;
  const palette = useMemo(() => {
    if (eink) return buildEinkPalette();
    const color = player.color ?? { hue: 215, saturation: 0.7 };
    return glass ? buildGlassPalette(color, isDarkMode) : buildPalette(color, isDarkMode);
  }, [player.color, isDarkMode, glass, eink]);
  const active = glass
    ? { background: 'var(--ab-primary)', color: 'var(--ab-on-primary)' }
    : { background: 'var(--ab-on-toolbar)', color: 'var(--ab-toolbar)' };

  const multiChapter = chapters.length > 1;
  const chapterStart = chapter?.start ?? 0;
  const chapterLength = Math.max(1, (chapter?.end ?? duration) - chapterStart);
  const inChapter = Math.max(0, position - chapterStart);
  const segments = chapterSegments(chapters, duration);
  const currentFraction = Math.min(1, inChapter / chapterLength);
  const percent = bookPercent(position, duration);
  const left = remainingAtSpeed(position, duration, speed);
  const pill = jumpPill(player.jump, player.now, chapters, chapterIndex);
  const speedChanged = Math.abs(speed - 1) > 0.01;

  const saveMoment = () => {
    void player.addBookmark();
    setSaved(true);
    setTimeout(() => setSaved(false), 900);
  };

  return (
    <div
      className={clsx(
        'audiobook-player full-height relative flex flex-col overflow-y-auto',
        glass && 'ab-glass',
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
      )}
      style={{
        ...(palette as React.CSSProperties),
        background: 'linear-gradient(180deg, var(--ab-bg-top), var(--ab-bg-bottom))',
        color: 'var(--ab-text)',
      }}
    >
      <audio {...player.audioProps} />
      {glass && (
        <>
          <style>{GLASS_CSS}</style>
          {player.coverBlur && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.coverBlur}
              alt=''
              aria-hidden
              className='pointer-events-none fixed inset-0 z-0 h-full w-full object-cover opacity-70'
              style={{ imageRendering: 'auto' }}
            />
          )}
        </>
      )}

      <header className='flex items-center justify-between px-4 pt-3'>
        <button
          type='button'
          className={tonalButton}
          data-surface=''
          style={{ background: 'var(--ab-container)' }}
          aria-label={_('Back')}
          onClick={onBack}
        >
          <MdExpandMore size={28} />
        </button>
        <div className='flex gap-2'>
          <button
            type='button'
            className={tonalButton}
            data-surface=''
            style={{ background: 'var(--ab-container)' }}
            aria-label={_('Chapters')}
            onClick={() => setSheet('chapters')}
          >
            <MdViewList size={24} />
          </button>
          <button
            type='button'
            className={tonalButton}
            data-surface=''
            style={{ background: 'var(--ab-container)' }}
            aria-label={_('More')}
            onClick={() => setSheet('skip')}
          >
            <MdMoreVert size={24} />
          </button>
        </div>
      </header>

      <main className='mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-6 pb-5 pt-4'>
        <div
          className='mx-auto flex aspect-square w-full max-w-[min(100%,42vh)] cursor-pointer select-none items-center justify-center overflow-hidden rounded-[28px] shadow-xl'
          style={{ background: 'var(--ab-container)' }}
          role='button'
          tabIndex={0}
          aria-label={_('Cover')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && player.toggle()}
          onPointerDown={(e) => {
            swipe.current = e.clientX;
          }}
          onPointerUp={(e) => {
            const start = swipe.current;
            swipe.current = null;
            if (start === null) return;
            const dx = e.clientX - start;
            if (!multiChapter || Math.abs(dx) < SWIPE_PX) player.toggle();
            else if (dx < 0) player.nextChapter();
            else player.previousChapter();
          }}
        >
          {player.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.coverUrl}
              alt={book.title}
              className='h-full w-full object-cover'
              draggable={false}
            />
          ) : (
            <MdHeadphones size={96} style={{ opacity: 0.35 }} />
          )}
        </div>

        <div>
          <h1 className='font-serif text-[28px] leading-tight'>{book.title}</h1>
          {book.author && (
            <p className='mt-1 font-serif text-lg' style={{ color: 'var(--ab-text-muted)' }}>
              {book.author}
            </p>
          )}
        </div>

        {player.error && (
          <p role='alert' className='text-error text-sm'>
            {player.error}
          </p>
        )}

        {multiChapter && (
          <div>
            <BookProgressBar
              segments={segments}
              current={chapterIndex}
              currentFraction={currentFraction}
            />
            <div className='mt-1.5 flex justify-between text-sm tabular-nums'>
              <span className='font-medium' style={{ color: 'var(--ab-primary)' }}>
                {_('{{percent}}% of book', { percent })}
              </span>
              <span style={{ color: 'var(--ab-text-muted)' }}>
                {speedChanged
                  ? _('{{time}} left at {{speed}}×', {
                      time: formatClock(left),
                      speed: Math.round(speed * 100) / 100,
                    })
                  : _('{{time}} left', { time: formatClock(left) })}
              </span>
            </div>
          </div>
        )}

        {multiChapter && (
          <div className='flex items-center gap-2'>
            <button
              type='button'
              className={tonalButton}
              data-surface=''
              style={{ background: 'var(--ab-container)' }}
              aria-label={_('Previous chapter')}
              onClick={player.previousChapter}
            >
              <MdSkipPrevious size={26} />
            </button>
            <button
              type='button'
              className='flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl px-4 py-2 text-start'
              data-surface=''
              style={{ background: 'var(--ab-container-high)' }}
              onClick={() => setSheet('chapters')}
            >
              <span className='min-w-0 flex-1'>
                <span className='block text-xs' style={{ color: 'var(--ab-primary)' }}>
                  {_('Chapter {{number}} of {{count}}', {
                    number: chapterIndex + 1,
                    count: chapters.length,
                  })}
                </span>
                <span className='block truncate font-serif text-lg'>{chapter?.title}</span>
              </span>
              <MdExpandMore size={22} style={{ color: 'var(--ab-text-muted)' }} />
            </button>
            <button
              type='button'
              className={tonalButton}
              data-surface=''
              style={{ background: 'var(--ab-container)' }}
              aria-label={_('Next chapter')}
              disabled={chapterIndex >= chapters.length - 1}
              onClick={player.nextChapter}
            >
              <MdSkipNext size={26} />
            </button>
          </div>
        )}

        <div>
          <WavySlider
            glass={glass}
            animate={animate}
            ariaLabel={_('Seek')}
            value={multiChapter ? inChapter : position}
            max={multiChapter ? chapterLength : duration}
            playing={player.playing}
            onCommit={(value) => player.seekTo(multiChapter ? chapterStart + value : value)}
          />
          <div className='relative flex min-h-8 items-center justify-between text-sm tabular-nums'>
            <span style={{ color: 'var(--ab-text-muted)' }}>
              {formatClock(multiChapter ? inChapter : position)}
            </span>
            {pill ? (
              <button
                type='button'
                className='mx-2 flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium'
                style={{ background: 'var(--ab-pill)', color: 'var(--ab-on-pill)' }}
                onClick={player.undoJump}
              >
                <MdUndo size={18} />
                <span className='truncate'>
                  {pill.chapterNumber
                    ? _('Back to Ch. {{chapter}} · {{time}}', {
                        chapter: pill.chapterNumber,
                        time: pill.time,
                      })
                    : _('Back to {{time}}', { time: pill.time })}
                </span>
              </button>
            ) : (
              !multiChapter && (
                <span style={{ color: 'var(--ab-primary)' }}>
                  {_('{{percent}}% of book', { percent })}
                </span>
              )
            )}
            <span style={{ color: 'var(--ab-text-muted)' }}>
              {multiChapter
                ? formatRemainingInChapter(inChapter, chapterLength)
                : formatRemainingInChapter(position, duration)}
            </span>
          </div>
        </div>

        <div className='flex items-center justify-center gap-5 py-1'>
          <button
            type='button'
            className='flex h-[68px] w-[68px] items-center justify-center rounded-full transition-transform active:scale-90'
            data-surface=''
            style={{ background: 'var(--ab-container)' }}
            aria-label={_('Back {{count}} seconds', { count: player.skipSeconds })}
            onClick={player.skipBack}
          >
            <MdReplay size={32} />
          </button>
          <PlayButton
            glass={glass}
            flat={!animate}
            playing={player.playing}
            label={player.playing ? _('Pause') : _('Play')}
            onClick={player.toggle}
          />
          <button
            type='button'
            className='flex h-[68px] w-[68px] items-center justify-center rounded-full transition-transform active:scale-90'
            data-surface=''
            style={{ background: 'var(--ab-container)' }}
            aria-label={_('Forward {{count}} seconds', { count: player.skipSeconds })}
            onClick={player.skipForward}
          >
            <MdReplay size={32} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>

        <div className='mt-auto flex justify-center pt-2'>
          <div
            className='flex items-center gap-1 rounded-full p-1.5'
            data-surface=''
            style={{ background: 'var(--ab-toolbar)', color: 'var(--ab-on-toolbar)' }}
          >
            <button
              type='button'
              className='flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-full px-3'
              style={player.sleep ? active : undefined}
              aria-label={_('Sleep timer')}
              onClick={() => (player.sleep ? player.setSleep(null) : setSheet('sleep'))}
            >
              {player.sleep ? <MdBedtimeOff size={24} /> : <MdBedtime size={24} />}
              {player.sleepLeft !== null && (
                <span className='tabular-nums'>{formatClock(player.sleepLeft)}</span>
              )}
            </button>
            <button
              type='button'
              className='flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-full px-3'
              style={speedChanged ? active : undefined}
              aria-label={_('Playback speed')}
              onClick={() => setSheet('speed')}
            >
              <MdSpeed size={24} />
              {speedChanged && (
                <span className='tabular-nums'>{Math.round(speed * 100) / 100}×</span>
              )}
            </button>
            <button
              type='button'
              className='relative flex h-12 min-w-12 items-center justify-center rounded-full px-3'
              aria-label={_('Bookmarks')}
              onClick={() => setSheet('bookmarks')}
              onPointerDown={() => {
                press.current = setTimeout(() => {
                  press.current = null;
                  saveMoment();
                }, LONG_PRESS_MS);
              }}
              onPointerUp={() => press.current && clearTimeout(press.current)}
              onPointerLeave={() => press.current && clearTimeout(press.current)}
            >
              <MdCollectionsBookmark
                size={24}
                className={clsx('transition-transform', saved && 'scale-125')}
              />
            </button>
          </div>
        </div>
      </main>

      {sheet === 'chapters' && (
        <ChapterSheet
          chapters={chapters}
          current={chapterIndex}
          onClose={() => setSheet(null)}
          onPick={(picked) => {
            player.seekTo(picked.start, 'chapter');
            setSheet(null);
          }}
        />
      )}
      {sheet === 'sleep' && (
        <SleepSheet
          active={player.sleep}
          onClose={() => setSheet(null)}
          onPick={(option) => {
            player.setSleep(option);
            setSheet(null);
          }}
        />
      )}
      {sheet === 'speed' && (
        <SpeedSheet speed={speed} onChange={player.setSpeed} onClose={() => setSheet(null)} />
      )}
      {sheet === 'bookmarks' && (
        <BookmarksSheet
          bookmarks={player.bookmarks}
          onSave={() => void player.addBookmark()}
          onGo={(bookmark) => {
            player.goToBookmark(bookmark);
            setSheet(null);
          }}
          onRemove={(id) => void player.removeBookmark(id)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'skip' && (
        <PlayerSettingsSheet
          seconds={player.skipSeconds}
          style={uiStyle}
          onStyleChange={setUiStyle}
          onChange={player.setSkipSeconds}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
};

export default AudiobookPlayer;

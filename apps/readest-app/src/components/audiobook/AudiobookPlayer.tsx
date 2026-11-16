import clsx from 'clsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MdBedtime,
  MdBedtimeOff,
  MdBookmarkAdd,
  MdCollectionsBookmark,
  MdKeyboardArrowDown,
  MdMoreVert,
  MdSpeed,
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
import ActionToolbar, { ToolbarItem } from './ActionToolbar';
import AuroraBackground from './AuroraBackground';
import BookProgressBar from './BookProgressBar';
import ChapterSwitcher from './ChapterSwitcher';
import JumpBackPill from './JumpBackPill';
import PlaybackCover from './PlaybackCover';
import PlayButton from './PlayButton';
import SkipButton from './SkipButton';
import WavySlider from './WavySlider';
import { useEntrance } from './useEntrance';
import {
  BookmarksSheet,
  ChapterSheet,
  PlayerSettingsSheet,
  SleepSheet,
  SpeedSheet,
} from './AudiobookSheets';

export type AudiobookPlayerState = ReturnType<typeof useAudiobook>;

interface AudiobookPlayerViewProps {
  book: Book;
  player: AudiobookPlayerState;
  onBack: () => void;
  /** The view renders the <audio> element itself; the app-wide host renders it once, outside. */
  ownsAudio?: boolean;
  /** The player is on screen. Off while it slides away, so nothing animates unseen. */
  onScreen?: boolean;
}

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
.ab-glass > .ab-scroll { position: relative; z-index: 1; }
.ab-glass > [role='presentation'] { position: fixed; z-index: 50; }
`;

/** Below this height (px) the controls get Voice's compact spacing and a smaller play button. */
const COMPACT_HEIGHT = 700;
const MAX_CONTENT_WIDTH = 520;

const topButton =
  'ab-tonal relative flex h-10 w-10 items-center justify-center before:absolute before:-inset-1 before:content-[""]';

/**
 * The audiobook screen, laid out and animated after the Voice app (read from its source): colors
 * from the cover, a soft drifting aurora behind, a cover that grows and glows while playing and
 * flies away when the chapter changes, the title, the book as a pill per chapter, a chapter
 * switcher, a wavy seek bar, Voice's play button and skip buttons, a floating toolbar, and an
 * entrance in which each part rises into place in turn. The same screen runs on Android, iOS and
 * desktop; every motion is off on e-ink, in lite mode and for people who ask for less motion.
 */
export const AudiobookPlayerView: React.FC<AudiobookPlayerViewProps> = ({
  book,
  player,
  onBack,
  ownsAudio = false,
  onScreen = true,
}) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saved, setSaved] = useState(false);
  const [showTotal, setShowTotal] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });

  const { chapters, position, duration, speed, chapterIndex } = player;
  const chapter = player.chapter;
  // The player follows the app-wide style; the classic look has no player of its own, so it gets Material.
  const [uiStyle, setUiStyle] = useUiStyle();
  const eink = useIsEink();
  const lite = useHtmlAttribute('data-perf') === 'low';
  // E-ink has no gradients, tints or glass: black on white with borders.
  const glass = uiStyle === 'glass' && !eink;
  const animate = !eink && !lite && onScreen;
  const palette = useMemo(() => {
    if (eink) return buildEinkPalette();
    const color = player.color ?? { hue: 215, saturation: 0.7 };
    return glass ? buildGlassPalette(color, isDarkMode) : buildPalette(color, isDarkMode);
  }, [player.color, isDarkMode, glass, eink]);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setRoom({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Voice puts the cover beside the controls on a wide, tall-enough screen, and squeezes the
  // controls on a short one.
  const sideBySide = room.width > room.height && room.width >= 600 && room.height >= 360;
  const compact = room.height > 0 && room.height < COMPACT_HEIGHT;
  const playSize = compact ? 80 : 104;

  const entrance = useEntrance(animate);

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
  const elapsed = dragging ?? (multiChapter ? inChapter : position);
  const total = multiChapter ? chapterLength : duration;

  const saveMoment = () => {
    void player.addBookmark();
    setSaved(true);
    setTimeout(() => setSaved(false), 900);
  };

  const topBar = (
    <div className='flex items-center justify-between px-3 py-2'>
      <button
        type='button'
        className={topButton}
        data-surface=''
        style={{ background: 'var(--ab-surface-highest)' }}
        aria-label={_('Back')}
        onClick={onBack}
      >
        <MdKeyboardArrowDown size={24} />
      </button>
      <div className='flex gap-2'>
        {multiChapter && (
          <button
            type='button'
            className={topButton}
            data-surface=''
            style={{ background: 'var(--ab-surface-highest)' }}
            aria-label={_('Chapters')}
            onClick={() => setSheet('chapters')}
          >
            <MdViewList size={24} />
          </button>
        )}
        <button
          type='button'
          className={topButton}
          data-surface=''
          style={{ background: 'var(--ab-surface-highest)' }}
          aria-label={_('More')}
          onClick={() => setSheet('skip')}
        >
          <MdMoreVert size={24} />
        </button>
      </div>
    </div>
  );

  const title = (
    <div ref={entrance(0)} className='pt-1'>
      <h1 className='font-book text-2xl font-semibold leading-tight'>{book.title}</h1>
      {book.author && (
        <p className='font-book mt-0.5 text-base' style={{ color: 'var(--ab-text-muted)' }}>
          {book.author}
        </p>
      )}
    </div>
  );

  const bookProgress = multiChapter && (
    <div ref={entrance(1)} className={compact ? 'mt-2' : 'mt-3'}>
      <BookProgressBar
        segments={segments}
        current={chapterIndex}
        currentFraction={currentFraction}
        animate={animate}
      />
      <div className='mt-1.5 flex justify-between gap-2 text-sm tabular-nums'>
        <span className='shrink-0 font-semibold' style={{ color: 'var(--ab-primary)' }}>
          {_('{{percent}}% of book', { percent })}
        </span>
        <span className='truncate' style={{ color: 'var(--ab-text-muted)' }}>
          {speedChanged
            ? _('{{time}} left at {{speed}}×', {
                time: formatClock(left),
                speed: Math.round(speed * 100) / 100,
              })
            : _('{{time}} left', { time: formatClock(left) })}
        </span>
      </div>
    </div>
  );

  const switcher = multiChapter && (
    <div ref={entrance(2)} className={compact ? 'mt-3' : 'mt-4'}>
      <ChapterSwitcher
        number={chapterIndex + 1}
        count={chapters.length}
        title={chapter?.title}
        counterLabel={_('Chapter {{number}} of {{count}}', {
          number: chapterIndex + 1,
          count: chapters.length,
        })}
        previousLabel={_('Previous chapter')}
        nextLabel={_('Next chapter')}
        animate={animate}
        onPrevious={player.previousChapter}
        onNext={player.nextChapter}
        onOpen={() => setSheet('chapters')}
      />
    </div>
  );

  const seek = (
    <div ref={entrance(3)} className='mt-3'>
      <WavySlider
        glass={glass}
        animate={animate}
        ariaLabel={_('Seek')}
        value={multiChapter ? inChapter : position}
        max={total}
        playing={player.playing}
        formatBubble={formatClock}
        onDrag={setDragging}
        onCommit={(value) => player.seekTo(multiChapter ? chapterStart + value : value)}
      />
      <div className='relative flex min-h-8 items-center justify-between px-1 text-sm tabular-nums'>
        <span
          className='font-semibold'
          style={{
            color: dragging !== null ? 'var(--ab-primary)' : 'var(--ab-text-muted)',
            transition: animate ? 'color 200ms' : undefined,
          }}
        >
          {formatClock(elapsed)}
        </span>
        <span className='mx-2 flex min-w-0 flex-1 items-center justify-center'>
          <JumpBackPill
            animate={animate}
            onClick={player.undoJump}
            pill={
              pill && {
                id: pill.id,
                visibleMs: pill.visibleMs,
                text: pill.chapterNumber
                  ? _('Back to Ch. {{chapter}} · {{time}}', {
                      chapter: pill.chapterNumber,
                      time: pill.time,
                    })
                  : _('Back to {{time}}', { time: pill.time }),
              }
            }
          />
          {!pill && !multiChapter && (
            <span className='font-semibold' style={{ color: 'var(--ab-primary)' }}>
              {_('{{percent}}% of book', { percent })}
            </span>
          )}
        </span>
        <button
          type='button'
          className='-me-1 px-1'
          style={{ color: 'var(--ab-text-muted)' }}
          onClick={() => setShowTotal((v) => !v)}
        >
          {showTotal ? formatClock(total) : formatRemainingInChapter(elapsed, total)}
        </button>
      </div>
    </div>
  );

  const transport = (
    <div className='mt-2 flex items-center justify-center gap-4' style={{ height: playSize }}>
      <SkipButton
        forward={false}
        seconds={player.skipSeconds}
        height={Math.round(playSize * 0.72)}
        animate={animate}
        label={_('Back {{count}} seconds', { count: player.skipSeconds })}
        onClick={player.skipBack}
      />
      <PlayButton
        glass={glass}
        flat={!animate}
        size={playSize}
        playing={player.playing}
        label={player.playing ? _('Pause') : _('Play')}
        onClick={player.toggle}
      />
      <SkipButton
        forward
        seconds={player.skipSeconds}
        height={Math.round(playSize * 0.72)}
        animate={animate}
        label={_('Forward {{count}} seconds', { count: player.skipSeconds })}
        onClick={player.skipForward}
      />
    </div>
  );

  const toolbar = (
    <div ref={entrance(4)} className={clsx('flex justify-center', compact ? 'mt-3' : 'mt-5')}>
      <ActionToolbar>
        <ToolbarItem
          label={_('Sleep timer')}
          active={!!player.sleep}
          text={player.sleepLeft !== null ? formatClock(player.sleepLeft) : undefined}
          animate={animate}
          onClick={() => (player.sleep ? player.setSleep(null) : setSheet('sleep'))}
        >
          {player.sleep ? <MdBedtimeOff size={24} /> : <MdBedtime size={24} />}
        </ToolbarItem>
        <ToolbarItem
          label={_('Playback speed')}
          active={speedChanged}
          text={speedChanged ? `${Math.round(speed * 100) / 100}×` : undefined}
          animate={animate}
          onClick={() => setSheet('speed')}
        >
          <MdSpeed size={24} />
        </ToolbarItem>
        <ToolbarItem
          label={_('Bookmarks')}
          animate={animate}
          onClick={() => setSheet('bookmarks')}
          onLongPress={saveMoment}
        >
          {saved ? <MdCollectionsBookmark size={24} /> : <MdBookmarkAdd size={24} />}
        </ToolbarItem>
      </ActionToolbar>
    </div>
  );

  const cover = (
    <PlaybackCover
      src={player.coverUrl}
      title={book.title}
      label={_('Cover')}
      playing={player.playing}
      chapterIndex={chapterIndex}
      swipeable={multiChapter}
      animate={animate}
      onNext={player.nextChapter}
      onPrevious={player.previousChapter}
      onToggle={player.toggle}
    />
  );

  const error = player.error && (
    <p role='alert' className='text-error mt-2 text-sm'>
      {player.error}
    </p>
  );

  return (
    <div
      ref={root}
      className={clsx('audiobook-player full-height relative overflow-hidden', glass && 'ab-glass')}
      style={{
        ...(palette as React.CSSProperties),
        background: glass
          ? 'linear-gradient(180deg, var(--ab-bg-top), var(--ab-bg-bottom))'
          : 'var(--ab-surface)',
        color: 'var(--ab-text)',
      }}
    >
      {ownsAudio && <audio {...player.audioProps} />}
      {glass ? (
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
      ) : (
        <AuroraBackground playing={player.playing} animate={animate} />
      )}

      <div className='ab-scroll absolute inset-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'>
        {sideBySide ? (
          <div className='mx-auto flex h-full w-full items-stretch gap-8 px-6'>
            <div className='flex min-w-0 flex-1 flex-col py-2'>
              {topBar}
              {cover}
              {title}
              {bookProgress}
            </div>
            <div
              className='flex min-w-0 flex-[1.3] flex-col justify-center py-4'
              style={{ maxWidth: MAX_CONTENT_WIDTH }}
            >
              {error}
              {switcher}
              {seek}
              {transport}
              {toolbar}
            </div>
          </div>
        ) : (
          <div
            className='mx-auto flex h-full w-full flex-col'
            style={{ maxWidth: MAX_CONTENT_WIDTH + 48 }}
          >
            {topBar}
            <div className={clsx('flex min-h-0 flex-1 flex-col px-6', compact ? 'pb-2' : 'pb-4')}>
              <div className='flex min-h-[120px] flex-1 flex-col'>{cover}</div>
              {title}
              {error}
              {bookProgress}
              {switcher}
              {seek}
              {transport}
              {toolbar}
            </div>
          </div>
        )}
      </div>

      {sheet === 'chapters' && (
        <ChapterSheet
          chapters={chapters}
          current={chapterIndex}
          playing={player.playing}
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

/** The player on its own, with its own audio (outside the app-wide host: tests, the pages router). */
const AudiobookPlayer: React.FC<AudiobookPlayerProps> = ({ book, onBack }) => {
  const player = useAudiobook(book);
  return <AudiobookPlayerView book={book} player={player} onBack={onBack} ownsAudio />;
};

export default AudiobookPlayer;

import clsx from 'clsx';
import React, { useState } from 'react';
import {
  MdArrowBack,
  MdBedtime,
  MdFormatListBulleted,
  MdForward30,
  MdHeadphones,
  MdPause,
  MdPlayArrow,
  MdReplay10,
  MdSkipNext,
  MdSkipPrevious,
  MdSpeed,
} from 'react-icons/md';
import { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { useAudiobook } from '@/hooks/useAudiobook';
import { formatClock, SLEEP_MINUTES, type SleepOption } from '@/libs/audiobook/player';

interface AudiobookPlayerProps {
  book: Book;
  onBack: () => void;
}

type Sheet = 'chapters' | 'sleep' | null;

const roundButton =
  'btn btn-ghost btn-circle text-base-content hover:bg-base-content/10 disabled:opacity-30';

/**
 * The audiobook screen, laid out like the Voice audiobook player: large cover,
 * title and chapter, a seek bar with time elapsed and left, then previous chapter,
 * back 10 s, play/pause, forward 30 s, next chapter, and speed, sleep timer and
 * chapter list underneath. It looks and behaves the same on Android, iOS and desktop.
 */
const AudiobookPlayer: React.FC<AudiobookPlayerProps> = ({ book, onBack }) => {
  const _ = useTranslation();
  const player = useAudiobook(book);
  const [sheet, setSheet] = useState<Sheet>(null);
  const { position, duration } = player;
  const remaining = Math.max(0, duration - position);

  const sleepLabel = player.sleepLeft !== null ? formatClock(player.sleepLeft) : null;

  const pickSleep = (option: SleepOption) => {
    player.setSleep(option);
    setSheet(null);
  };

  return (
    <div
      className={clsx(
        'audiobook-player bg-base-100 text-base-content full-height flex flex-col',
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <audio {...player.audioProps} />

      <header className='flex items-center gap-2 px-2 py-2'>
        <button type='button' className={roundButton} aria-label={_('Back')} onClick={onBack}>
          <MdArrowBack size={24} />
        </button>
        <p className='text-base-content/70 min-w-0 flex-1 truncate text-sm'>{book.title}</p>
      </header>

      <main className='flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6'>
        <div className='bg-base-200 flex aspect-square w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl shadow-lg'>
          {book.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverImageUrl}
              alt={book.title}
              className='h-full w-full object-cover'
              draggable={false}
            />
          ) : (
            <MdHeadphones size={96} className='text-base-content/30' />
          )}
        </div>

        <div className='w-full max-w-sm text-center'>
          <h1 className='truncate text-lg font-semibold'>{book.title}</h1>
          {book.author && <p className='text-base-content/60 truncate text-sm'>{book.author}</p>}
          {player.chapter && (
            <p className='text-base-content/80 mt-2 truncate text-sm' aria-live='polite'>
              {player.chapter.title}
            </p>
          )}
        </div>

        {player.error && (
          <p role='alert' className='text-error text-center text-sm'>
            {player.error}
          </p>
        )}
      </main>

      <section className='mx-auto flex w-full max-w-sm flex-col gap-3 px-6 pb-6'>
        <div>
          <input
            type='range'
            aria-label={_('Seek')}
            className='range range-xs w-full'
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={Math.min(position, Math.max(duration, 1))}
            onChange={(e) => player.seekTo(Number(e.target.value))}
          />
          <div className='text-base-content/60 flex justify-between text-xs tabular-nums'>
            <span>{formatClock(position)}</span>
            <span>-{formatClock(remaining)}</span>
          </div>
        </div>

        <div className='flex items-center justify-between'>
          <button
            type='button'
            className={roundButton}
            aria-label={_('Previous chapter')}
            disabled={!player.chapters.length}
            onClick={player.previousChapter}
          >
            <MdSkipPrevious size={30} />
          </button>
          <button
            type='button'
            className={roundButton}
            aria-label={_('Back 10 seconds')}
            onClick={player.skipBack}
          >
            <MdReplay10 size={32} />
          </button>
          <button
            type='button'
            className='btn btn-primary btn-circle h-16 w-16'
            aria-label={player.playing ? _('Pause') : _('Play')}
            onClick={player.toggle}
          >
            {player.playing ? <MdPause size={38} /> : <MdPlayArrow size={38} />}
          </button>
          <button
            type='button'
            className={roundButton}
            aria-label={_('Forward 30 seconds')}
            onClick={player.skipForward}
          >
            <MdForward30 size={32} />
          </button>
          <button
            type='button'
            className={roundButton}
            aria-label={_('Next chapter')}
            disabled={player.chapterIndex >= player.chapters.length - 1}
            onClick={player.nextChapter}
          >
            <MdSkipNext size={30} />
          </button>
        </div>

        <div className='flex items-center justify-around pt-1'>
          <button
            type='button'
            className='btn btn-ghost btn-sm gap-1'
            aria-label={_('Playback speed')}
            onClick={player.cycleSpeed}
          >
            <MdSpeed size={20} />
            <span className='tabular-nums'>{player.speed}×</span>
          </button>
          <button
            type='button'
            className={clsx('btn btn-ghost btn-sm gap-1', player.sleep && 'text-primary')}
            aria-label={_('Sleep timer')}
            onClick={() => setSheet('sleep')}
          >
            <MdBedtime size={20} />
            {sleepLabel && <span className='tabular-nums'>{sleepLabel}</span>}
          </button>
          <button
            type='button'
            className='btn btn-ghost btn-sm gap-1'
            aria-label={_('Chapters')}
            onClick={() => setSheet('chapters')}
          >
            <MdFormatListBulleted size={20} />
          </button>
        </div>
      </section>

      {sheet && (
        <div
          className='fixed inset-0 z-50 flex items-end bg-black/40'
          onClick={() => setSheet(null)}
          role='presentation'
        >
          <div
            role='dialog'
            aria-label={sheet === 'chapters' ? _('Chapters') : _('Sleep timer')}
            className='bg-base-100 max-h-[70vh] w-full overflow-y-auto rounded-t-2xl p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'
            onClick={(e) => e.stopPropagation()}
          >
            {sheet === 'chapters' && (
              <ul>
                {player.chapters.map((chapter, index) => (
                  <li key={`${index}-${chapter.start}`}>
                    <button
                      type='button'
                      className={clsx(
                        'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-start',
                        index === player.chapterIndex
                          ? 'bg-base-200 font-medium'
                          : 'hover:bg-base-200',
                      )}
                      onClick={() => {
                        player.seekTo(chapter.start);
                        setSheet(null);
                      }}
                    >
                      <span className='min-w-0 flex-1 truncate text-sm'>{chapter.title}</span>
                      <span className='text-base-content/60 text-xs tabular-nums'>
                        {formatClock(chapter.start)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {sheet === 'sleep' && (
              <ul>
                <SleepRow label={_('Off')} onPick={() => pickSleep(null)} active={!player.sleep} />
                {SLEEP_MINUTES.map((minutes) => (
                  <SleepRow
                    key={minutes}
                    label={_('{{count}} minutes', { count: minutes })}
                    onPick={() => pickSleep({ kind: 'minutes', minutes })}
                    active={player.sleep?.kind === 'minutes' && player.sleep.minutes === minutes}
                  />
                ))}
                <SleepRow
                  label={_('End of chapter')}
                  onPick={() => pickSleep({ kind: 'chapter' })}
                  active={player.sleep?.kind === 'chapter'}
                />
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SleepRow: React.FC<{ label: string; active: boolean; onPick: () => void }> = ({
  label,
  active,
  onPick,
}) => (
  <li>
    <button
      type='button'
      className={clsx(
        'w-full rounded-lg px-3 py-3 text-start text-sm',
        active ? 'bg-base-200 font-medium' : 'hover:bg-base-200',
      )}
      onClick={onPick}
    >
      {label}
    </button>
  </li>
);

export default AudiobookPlayer;

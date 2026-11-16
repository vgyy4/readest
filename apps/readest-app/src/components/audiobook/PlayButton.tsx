import React from 'react';
import { MdPause, MdPlayArrow } from 'react-icons/md';
import { playButtonPolygon } from '@/libs/audiobook/shapes';

interface PlayButtonProps {
  playing: boolean;
  label: string;
  /** Glass is a round frosted button instead of the morphing cookie. */
  glass?: boolean;
  /** A plain round button with no morphing (e-ink, lite mode). */
  flat?: boolean;
  onClick: () => void;
}

const PAUSED_SHAPE = playButtonPolygon(false);
const PLAYING_SHAPE = playButtonPolygon(true);

/** A scalloped cookie when paused that morphs into a rounded square while playing, as in Voice. */
const PlayButton: React.FC<PlayButtonProps> = ({
  playing,
  label,
  glass = false,
  flat = false,
  onClick,
}) => (
  <button
    type='button'
    aria-label={label}
    onClick={onClick}
    data-surface={glass ? '' : undefined}
    className={
      glass || flat
        ? 'flex h-24 w-24 items-center justify-center rounded-full ab-press'
        : 'ab-press flex h-24 w-24 items-center justify-center transition-[clip-path,background-color,transform] duration-300 ease-out'
    }
    style={
      flat
        ? { background: 'var(--ab-primary)', color: 'var(--ab-on-primary)' }
        : glass
          ? { background: 'var(--ab-container-high)', color: 'var(--ab-text)' }
          : {
              clipPath: playing ? PLAYING_SHAPE : PAUSED_SHAPE,
              background: 'var(--ab-primary)',
              color: 'var(--ab-on-primary)',
            }
    }
  >
    {playing ? <MdPause size={44} /> : <MdPlayArrow size={48} />}
  </button>
);

export default PlayButton;

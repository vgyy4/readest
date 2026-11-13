import React from 'react';
import { MdPause, MdPlayArrow } from 'react-icons/md';
import { playButtonPolygon } from '@/libs/audiobook/shapes';

interface PlayButtonProps {
  playing: boolean;
  label: string;
  /** Glass is a round frosted button instead of the morphing cookie. */
  glass?: boolean;
  onClick: () => void;
}

const PAUSED_SHAPE = playButtonPolygon(false);
const PLAYING_SHAPE = playButtonPolygon(true);

/** A scalloped cookie when paused that morphs into a rounded square while playing, as in Voice. */
const PlayButton: React.FC<PlayButtonProps> = ({ playing, label, glass = false, onClick }) => (
  <button
    type='button'
    aria-label={label}
    onClick={onClick}
    data-surface={glass ? '' : undefined}
    className={
      glass
        ? 'flex h-24 w-24 items-center justify-center rounded-full transition-transform active:scale-95'
        : 'flex h-24 w-24 items-center justify-center transition-[clip-path,background-color] duration-300 ease-out active:scale-95'
    }
    style={
      glass
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

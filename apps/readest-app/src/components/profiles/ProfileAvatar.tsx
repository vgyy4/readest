import clsx from 'clsx';
import React from 'react';
import { avatarSrc } from '@/libs/profiles/avatars';

interface ProfileAvatarProps {
  avatar?: string | null;
  name: string;
  /** Size and any extra classes, e.g. `h-28 w-28`. */
  className?: string;
}

/** A profile's picture; before it has one, its first letter on a color taken from its name. */
const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ avatar, name, className }) => {
  const src = avatarSrc(avatar);
  const hue = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
  return (
    <div
      className={clsx('relative shrink-0 overflow-hidden', className)}
      style={{ borderRadius: '26%' }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt='' draggable={false} className='h-full w-full select-none' />
      ) : (
        <div
          aria-hidden
          className='flex h-full w-full items-center justify-center text-4xl font-semibold text-white'
          style={{ background: `hsl(${hue} 55% 48%)` }}
        >
          {name.trim().charAt(0).toUpperCase() || '?'}
        </div>
      )}
    </div>
  );
};

export default ProfileAvatar;

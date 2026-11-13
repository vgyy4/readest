import clsx from 'clsx';
import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useIsEink } from '@/hooks/useHtmlAttribute';
import { AVATARS, avatarSrc } from '@/libs/profiles/avatars';
import ProfileAvatar from './ProfileAvatar';

interface AvatarPickerProps {
  name: string;
  current?: string | null;
  /** Save the choice; reject to show the message and stay. */
  onPick: (avatar: string) => Promise<void> | void;
  /** Leave without choosing (offered when the choice could not be saved, or for a later change). */
  onSkip?: () => void;
  title?: string;
}

/** A grid of stock pictures; tap one, then Continue. */
const AvatarPicker: React.FC<AvatarPickerProps> = ({ name, current, onPick, onSkip, title }) => {
  const _ = useTranslation();
  const eink = useIsEink();
  const [selected, setSelected] = useState<string | null>(current ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await onPick(selected);
    } catch {
      setError(_('Could not save the picture. Check the connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='avatar-picker flex h-full w-full flex-col items-center'>
      <div className='flex flex-col items-center gap-3 px-6 pb-3 pt-8'>
        <ProfileAvatar avatar={selected} name={name} className='h-24 w-24 shadow-lg' />
        <h1 className='text-center font-serif text-2xl'>{title ?? _('Choose your picture')}</h1>
        <p className='text-base-content/70 text-sm'>{name}</p>
      </div>

      <div className='min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-4 pb-4'>
        <ul className='grid grid-cols-4 gap-3 sm:grid-cols-6'>
          {AVATARS.map((avatar) => {
            const active = avatar.id === selected;
            return (
              <li key={avatar.id}>
                <button
                  type='button'
                  aria-label={avatar.id}
                  aria-pressed={active}
                  className={clsx(
                    'profile-avatar-option block aspect-square w-full overflow-hidden rounded-full outline-none',
                    'focus-visible:ring-primary focus-visible:ring-2',
                    active
                      ? 'outline-primary scale-95 outline outline-4 outline-offset-2'
                      : 'active:scale-95',
                  )}
                  onClick={() => setSelected(avatar.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarSrc(avatar.id, { eink }) ?? ''}
                    alt=''
                    loading='lazy'
                    draggable={false}
                    className='h-full w-full'
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className='flex w-full max-w-2xl flex-col items-center gap-2 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2'>
        {error && (
          <p role='alert' className='text-error text-sm'>
            {error}
          </p>
        )}
        <div className='flex gap-3'>
          {onSkip && (
            <button type='button' className='btn btn-ghost' disabled={busy} onClick={onSkip}>
              {_('Skip')}
            </button>
          )}
          <button
            type='button'
            className='btn btn-contrast min-w-32'
            disabled={!selected || busy}
            onClick={() => void save()}
          >
            {_('Continue')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarPicker;

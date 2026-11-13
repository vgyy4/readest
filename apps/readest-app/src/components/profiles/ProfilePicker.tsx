import clsx from 'clsx';
import React, { useState } from 'react';
import { MdLock } from 'react-icons/md';
import PinInput from '@/components/PinInput';
import { useTranslation } from '@/hooks/useTranslation';
import { setSessionPin } from '@/libs/profiles/session';
import { verifyProfilePin, type ProfilesState } from '@/libs/profiles/client';
import BuildBadge from '@/components/BuildBadge';
import ProfileAvatar from './ProfileAvatar';

interface ProfilePickerProps {
  state: ProfilesState;
  /** The profile to use (null = the main profile), once any PIN has been accepted. */
  onEnter: (profileId: string | null) => void;
}

interface Tile {
  id: string | null;
  name: string;
  avatar?: string | null;
  hasPin: boolean;
}

/**
 * "Who is reading?": shown at every app launch in an account that has profiles. Each profile
 * is a tile with its picture; one with a PIN asks for it first.
 */
const ProfilePicker: React.FC<ProfilePickerProps> = ({ state, onEnter }) => {
  const _ = useTranslation();
  const [target, setTarget] = useState<Tile | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const tiles: Tile[] = [
    { id: null, name: _('Main profile'), avatar: state.mainAvatar, hasPin: state.hasPin },
    ...state.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      hasPin: !!p.hasPin,
    })),
  ];

  const choose = (tile: Tile) => {
    if (!tile.hasPin) return onEnter(tile.id);
    setTarget(tile);
    setPin('');
    setError('');
  };

  const submit = async (value: string) => {
    if (!target || busy) return;
    setBusy(true);
    const ok = await verifyProfilePin(target.id, value);
    setBusy(false);
    if (ok) {
      // The main profile's PIN is the master PIN: keep it so the admin is not asked again.
      if (target.id === null) setSessionPin(value);
      onEnter(target.id);
      return;
    }
    setError(_('Wrong PIN.'));
    setShake(true);
    setPin('');
    window.setTimeout(() => setShake(false), 500);
  };

  const onPinChange = (next: string) => {
    setPin(next);
    setError('');
    if (next.length === 4) void submit(next);
  };

  return (
    <div
      className={clsx(
        'profile-picker bg-base-200 text-base-content full-height flex w-full flex-col items-center',
        'overflow-y-auto px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]',
      )}
    >
      {target ? (
        <div className='my-auto flex flex-col items-center gap-5'>
          <ProfileAvatar
            avatar={target.avatar}
            name={target.name}
            className='h-28 w-28 shadow-lg'
          />
          <h1 className='font-serif text-2xl'>{target.name}</h1>
          <p className='text-base-content/70 text-sm'>
            {_('Enter the PIN for {{name}}.', { name: target.name })}
          </p>
          <PinInput
            value={pin}
            onChange={onPinChange}
            ariaLabel={_('PIN')}
            autoFocus
            stickyFocus
            shake={shake}
            disabled={busy}
          />
          <p role='alert' className='text-error h-5 text-sm'>
            {error}
          </p>
          <button type='button' className='btn btn-ghost btn-sm' onClick={() => setTarget(null)}>
            {_('Cancel')}
          </button>
        </div>
      ) : (
        <div className='my-auto flex w-full max-w-3xl flex-col items-center gap-8'>
          <h1 className='font-serif text-3xl'>{_('Who is reading?')}</h1>
          {state.needsMigration && (
            <p className='text-warning max-w-md text-center text-xs'>
              {_('Pictures need an update on the server. Run its database update to enable them.')}
            </p>
          )}
          <ul className='flex flex-wrap justify-center gap-x-8 gap-y-7'>
            {tiles.map((tile) => (
              <li key={tile.id ?? 'main'}>
                <button
                  type='button'
                  className='group flex w-28 flex-col items-center gap-2 outline-none sm:w-32'
                  onClick={() => choose(tile)}
                >
                  <span className='relative block'>
                    <ProfileAvatar
                      avatar={tile.avatar}
                      name={tile.name}
                      className='h-24 w-24 shadow-md transition-transform group-active:scale-95 group-focus-visible:ring-4 sm:h-28 sm:w-28'
                    />
                    {tile.hasPin && (
                      <span
                        aria-hidden
                        className='bg-base-100 absolute -bottom-1 -end-1 flex h-7 w-7 items-center justify-center rounded-full shadow'
                      >
                        <MdLock size={16} />
                      </span>
                    )}
                  </span>
                  <span className='w-full truncate text-center text-base'>{tile.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <BuildBadge />
    </div>
  );
};

export default ProfilePicker;

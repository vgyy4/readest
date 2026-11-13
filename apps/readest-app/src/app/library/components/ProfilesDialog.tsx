import clsx from 'clsx';
import React, { useEffect, useMemo, useState } from 'react';
import { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import Dialog from '@/components/Dialog';
import { getActiveProfileId } from '@/libs/profiles/active';
import { getAdminModeSetting, setAdminModeSetting } from '@/libs/profiles/admin';
import { getSessionPin, setSessionPin } from '@/libs/profiles/session';
import {
  clearPin,
  createProfile,
  deleteProfile,
  fetchProfileBooks,
  fetchProfiles,
  getCachedProfiles,
  ProfilesState,
  renameProfile,
  setPin,
  setProfileBooks,
  switchProfile,
  verifyProfilePin,
} from '@/libs/profiles/client';
import { isValidPin } from '@/libs/profiles/shared';

interface ProfilesDialogProps {
  books: Book[];
  onClose: () => void;
}

type View = 'loading' | 'unlock' | 'list' | 'books' | 'enter' | 'profilePin';

interface Target {
  /** null is the main profile. */
  id: string | null;
  name: string;
  hasPin?: boolean;
}

/**
 * Profiles of this account. The main profile adds profiles, chooses which of its
 * books each one can see, and may give itself and every profile a 4-digit PIN.
 * A profile keeps its own progress, notes and library; switching reloads the app.
 * Inside a profile, opening another profile (or the main one) asks for that
 * profile's PIN, and the master PIN opens any of them.
 */
const ProfilesDialog: React.FC<ProfilesDialogProps> = ({ books, onClose }) => {
  const _ = useTranslation();
  const activeId = getActiveProfileId();
  const [view, setView] = useState<View>('loading');
  const [state, setState] = useState<ProfilesState>({ hasPin: false, profiles: [] });
  // The master PIN once entered, sent with each management request.
  const [masterPin, setMasterPinState] = useState(getSessionPin());
  const setMasterPin = (pin: string) => {
    setSessionPin(pin);
    setMasterPinState(pin);
  };
  const [adminSetting, setAdminSetting] = useState(getAdminModeSetting());
  const [pinInput, setPinInput] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      try {
        if (activeId) {
          // Inside a profile the list comes from the last one the main profile saw.
          setState(getCachedProfiles() ?? { hasPin: false, profiles: [] });
          setView('list');
          return;
        }
        const next = await fetchProfiles();
        setState(next);
        setView(next.hasPin && !getSessionPin() ? 'unlock' : 'list');
      } catch {
        setError(_('Could not reach the server.'));
        setView('list');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : _('Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => setState(await fetchProfiles());

  const libraryBooks = useMemo(
    () => books.filter((book) => !book.deletedAt).sort((a, b) => a.title.localeCompare(b.title)),
    [books],
  );

  const backToList = () => {
    setPinInput('');
    setError('');
    setView('list');
  };

  const requirePinFormat = () => {
    if (!isValidPin(pinInput)) throw new Error(_('The PIN must be 4 digits.'));
  };

  // Unlock the main profile's management (master PIN).
  const unlock = () =>
    run(async () => {
      if (!(await verifyProfilePin(null, pinInput))) throw new Error(_('Wrong PIN.'));
      setMasterPin(pinInput);
      backToList();
    });

  // The main profile switches without asking again; a profile asks for the PIN
  // of wherever it is going.
  const trySwitch = (to: Target) => {
    if (!activeId || !to.hasPin) return switchProfile(to.id);
    setTarget(to);
    setPinInput('');
    setError('');
    setView('enter');
  };

  const enter = () =>
    run(async () => {
      if (!(await verifyProfilePin(target!.id, pinInput))) throw new Error(_('Wrong PIN.'));
      switchProfile(target!.id);
    });

  const openBooks = (to: Target) =>
    run(async () => {
      setGranted(new Set(await fetchProfileBooks(to.id!, masterPin)));
      setTarget(to);
      setView('books');
    });

  const saveBooks = () =>
    run(async () => {
      await setProfileBooks(target!.id!, [...granted], masterPin);
      backToList();
    });

  const openProfilePin = (to: Target) => {
    setTarget(to);
    setPinInput('');
    setError('');
    setView('profilePin');
  };

  // Master PIN when `target` is null, else that profile's own PIN.
  const savePin = (profileId?: string) =>
    run(async () => {
      requirePinFormat();
      await setPin(pinInput, masterPin, profileId);
      if (!profileId) setMasterPin(pinInput);
      await refresh();
      backToList();
    });

  const removePin = (profileId?: string) =>
    run(async () => {
      await clearPin(masterPin, profileId);
      if (!profileId) setMasterPin('');
      await refresh();
      backToList();
    });

  const handleAdd = () =>
    run(async () => {
      await createProfile(newName, masterPin);
      setNewName('');
      await refresh();
    });

  const handleRename = (id: string, current: string) => {
    const name = window.prompt(_('Profile name'), current)?.trim();
    if (!name || name === current) return;
    void run(async () => {
      await renameProfile(id, name, masterPin);
      await refresh();
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(_('Delete {{name}} and all its progress and notes?', { name }))) return;
    void run(async () => {
      await deleteProfile(id, masterPin);
      await refresh();
    });
  };

  const activeName = state.profiles.find((p) => p.id === activeId)?.name;
  const rowButton = 'btn btn-ghost btn-sm';

  const pinField = (label: string) => (
    <input
      type='password'
      inputMode='numeric'
      autoComplete='off'
      maxLength={4}
      aria-label={label}
      placeholder='••••'
      className='input input-bordered input-sm w-28 text-center tracking-widest'
      value={pinInput}
      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
    />
  );

  return (
    <Dialog
      isOpen={true}
      title={_('Profiles')}
      onClose={onClose}
      boxClassName='sm:!w-[36rem] sm:!max-w-screen-sm sm:h-[40rem] sm:!max-h-[90vh]'
    >
      <div className='profiles-dialog flex flex-col gap-4 p-4 sm:px-6'>
        {error && (
          <p role='alert' className='text-error text-sm'>
            {error}
          </p>
        )}

        {view === 'loading' && <p className='text-sm'>{_('Loading…')}</p>}

        {(view === 'unlock' || view === 'enter') && (
          <form
            className='flex flex-col gap-3'
            onSubmit={(e) => {
              e.preventDefault();
              void (view === 'unlock' ? unlock() : enter());
            }}
          >
            <p className='text-sm'>
              {view === 'unlock'
                ? _('Enter the master PIN to continue.')
                : _('Enter the PIN for {{name}}.', { name: target?.name ?? '' })}
            </p>
            {pinField(view === 'unlock' ? _('Master PIN') : _('PIN'))}
            <div className='flex gap-2'>
              <button type='submit' className='btn btn-contrast btn-sm' disabled={busy}>
                {view === 'unlock' ? _('Unlock') : _('Open')}
              </button>
              {view === 'enter' && (
                <button type='button' className={rowButton} onClick={backToList}>
                  {_('Cancel')}
                </button>
              )}
            </div>
          </form>
        )}

        {view === 'list' && (
          <>
            {activeId && (
              <p className='text-sm'>
                {_('You are using the profile {{name}}.', { name: activeName ?? '' })}
              </p>
            )}

            <ul className='flex flex-col gap-1'>
              <li className='flex items-center justify-between gap-2'>
                <span className={clsx('text-sm', !activeId && 'font-semibold')}>
                  {_('Main profile')}
                </span>
                {activeId && (
                  <button
                    type='button'
                    className={rowButton}
                    onClick={() =>
                      trySwitch({ id: null, name: _('Main profile'), hasPin: state.hasPin })
                    }
                  >
                    {_('Switch')}
                  </button>
                )}
              </li>
              {state.profiles.map((profile) => (
                <li key={profile.id} className='flex flex-wrap items-center justify-between gap-2'>
                  <span className={clsx('text-sm', profile.id === activeId && 'font-semibold')}>
                    {profile.name}
                    {profile.hasPin && (
                      <span className='text-base-content/50 ms-2 text-xs'>{_('PIN')}</span>
                    )}
                  </span>
                  <span className='flex flex-wrap gap-1'>
                    {profile.id !== activeId && (
                      <button
                        type='button'
                        className={rowButton}
                        onClick={() => trySwitch(profile)}
                      >
                        {_('Switch')}
                      </button>
                    )}
                    {!activeId && (
                      <>
                        <button
                          type='button'
                          className={rowButton}
                          disabled={busy}
                          onClick={() => void openBooks(profile)}
                        >
                          {_('Books')}
                        </button>
                        <button
                          type='button'
                          className={rowButton}
                          onClick={() => openProfilePin(profile)}
                        >
                          {profile.hasPin ? _('Change PIN') : _('Set PIN')}
                        </button>
                        <button
                          type='button'
                          className={rowButton}
                          onClick={() => handleRename(profile.id, profile.name)}
                        >
                          {_('Rename')}
                        </button>
                        <button
                          type='button'
                          className={clsx(rowButton, 'text-error')}
                          onClick={() => handleDelete(profile.id, profile.name)}
                        >
                          {_('Delete')}
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {!activeId && (
              <>
                <label className='flex cursor-pointer items-start justify-between gap-4 py-1'>
                  <span className='flex flex-col'>
                    <span className='text-sm'>{_('Main profile is for administration only')}</span>
                    <span className='text-base-content/60 text-xs'>
                      {_(
                        'It adds books and decides who can see what, but does not read: opening a book shows which profiles have it.',
                      )}
                    </span>
                  </span>
                  <input
                    type='checkbox'
                    className='toggle toggle-sm mt-1'
                    aria-label={_('Main profile is for administration only')}
                    checked={adminSetting ?? state.profiles.length > 0}
                    onChange={(e) => {
                      setAdminModeSetting(e.target.checked);
                      setAdminSetting(e.target.checked);
                    }}
                  />
                </label>

                <form
                  className='flex flex-wrap items-center gap-2'
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newName.trim()) void handleAdd();
                  }}
                >
                  <input
                    type='text'
                    aria-label={_('New profile name')}
                    placeholder={_('New profile name')}
                    maxLength={40}
                    className='input input-bordered input-sm flex-1'
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <button
                    type='submit'
                    className='btn btn-contrast btn-sm'
                    disabled={busy || !newName.trim()}
                  >
                    {_('Add profile')}
                  </button>
                </form>

                <section className='border-base-300 flex flex-col gap-2 border-t pt-3'>
                  <h3 className='text-sm font-medium'>{_('Master PIN')}</h3>
                  <p className='text-base-content/60 text-xs'>
                    {_(
                      'Protects the main profile and managing profiles, and opens any profile that has its own PIN.',
                    )}
                  </p>
                  <div className='flex flex-wrap items-center gap-2'>
                    {pinField(_('New PIN'))}
                    <button
                      type='button'
                      className='btn btn-outline btn-sm'
                      disabled={busy}
                      onClick={() => void savePin()}
                    >
                      {state.hasPin ? _('Change PIN') : _('Set PIN')}
                    </button>
                    {state.hasPin && (
                      <button
                        type='button'
                        className={clsx(rowButton, 'text-error')}
                        disabled={busy}
                        onClick={() => void removePin()}
                      >
                        {_('Remove PIN')}
                      </button>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {view === 'profilePin' && target?.id && (
          <form
            className='flex flex-col gap-3'
            onSubmit={(e) => {
              e.preventDefault();
              void savePin(target.id!);
            }}
          >
            <p className='text-sm'>{_('PIN for {{name}}', { name: target.name })}</p>
            <p className='text-base-content/60 text-xs'>
              {_('Asked when opening this profile from another one. The master PIN also works.')}
            </p>
            {pinField(_('New PIN'))}
            <div className='flex flex-wrap gap-2'>
              <button type='submit' className='btn btn-contrast btn-sm' disabled={busy}>
                {_('Save')}
              </button>
              {target.hasPin && (
                <button
                  type='button'
                  className={clsx(rowButton, 'text-error')}
                  disabled={busy}
                  onClick={() => void removePin(target.id!)}
                >
                  {_('Remove PIN')}
                </button>
              )}
              <button type='button' className={rowButton} onClick={backToList}>
                {_('Cancel')}
              </button>
            </div>
          </form>
        )}

        {view === 'books' && target?.id && (
          <>
            <p className='text-sm'>
              {_('Books {{name}} can see', { name: target.name })} ({granted.size})
            </p>
            <div className='flex gap-2'>
              <button
                type='button'
                className={rowButton}
                onClick={() => setGranted(new Set(libraryBooks.map((b) => b.hash)))}
              >
                {_('Select all')}
              </button>
              <button type='button' className={rowButton} onClick={() => setGranted(new Set())}>
                {_('Select none')}
              </button>
            </div>
            <ul className='border-base-300 max-h-80 overflow-y-auto rounded-lg border'>
              {libraryBooks.map((book) => (
                <li key={book.hash}>
                  <label className='flex cursor-pointer items-center gap-3 px-3 py-2'>
                    <input
                      type='checkbox'
                      className='checkbox checkbox-sm'
                      checked={granted.has(book.hash)}
                      onChange={(e) => {
                        const next = new Set(granted);
                        if (e.target.checked) next.add(book.hash);
                        else next.delete(book.hash);
                        setGranted(next);
                      }}
                    />
                    <span className='text-sm'>{book.title}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className='text-base-content/60 text-xs'>
              {_('Every profile reads the same copy of a book; each keeps its own progress.')}
            </p>
            <div className='flex justify-end gap-2'>
              <button type='button' className={rowButton} onClick={backToList}>
                {_('Cancel')}
              </button>
              <button
                type='button'
                className='btn btn-contrast btn-sm'
                disabled={busy}
                onClick={() => void saveBooks()}
              >
                {_('Save')}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};

export default ProfilesDialog;

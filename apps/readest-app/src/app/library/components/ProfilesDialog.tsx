import clsx from 'clsx';
import React, { useEffect, useMemo, useState } from 'react';
import { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import Dialog from '@/components/Dialog';
import { getActiveProfileId } from '@/libs/profiles/active';
import {
  clearMasterPin,
  createProfile,
  deleteProfile,
  fetchProfileBooks,
  fetchProfiles,
  getCachedProfiles,
  ProfilesState,
  renameProfile,
  setMasterPin,
  setProfileBooks,
  switchProfile,
  verifyMasterPin,
} from '@/libs/profiles/client';
import { isValidPin } from '@/libs/profiles/shared';

interface ProfilesDialogProps {
  books: Book[];
  onClose: () => void;
}

type View = 'loading' | 'pin' | 'list' | 'books';

/**
 * Profiles of this account. The master (main) profile adds profiles, chooses
 * which of its books each one can see, and may protect that with a PIN. A
 * profile keeps its own progress, notes and library; switching reloads the app.
 */
const ProfilesDialog: React.FC<ProfilesDialogProps> = ({ books, onClose }) => {
  const _ = useTranslation();
  const activeId = getActiveProfileId();
  const [view, setView] = useState<View>('loading');
  const [state, setState] = useState<ProfilesState>({ hasPin: false, profiles: [] });
  const [pin, setPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [booksFor, setBooksFor] = useState<{ id: string; name: string } | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const next = activeId ? (getCachedProfiles() ?? state) : await fetchProfiles();
      setState(next);
      setView(next.hasPin ? 'pin' : 'list');
    } catch {
      setError(_('Could not reach the server.'));
      setView('list');
    }
  };

  useEffect(() => {
    void load();
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

  const unlock = () =>
    run(async () => {
      if (!(await verifyMasterPin(pinInput))) throw new Error(_('Wrong PIN.'));
      setPin(pinInput);
      setPinInput('');
      setView('list');
    });

  const openBooks = (id: string, name: string) =>
    run(async () => {
      setGranted(new Set(await fetchProfileBooks(id, pin)));
      setBooksFor({ id, name });
      setView('books');
    });

  const saveBooks = () =>
    run(async () => {
      await setProfileBooks(booksFor!.id, [...granted], pin);
      setView('list');
    });

  const changePin = () =>
    run(async () => {
      if (!isValidPin(pinInput)) throw new Error(_('The PIN must be 4 to 8 digits.'));
      await setMasterPin(pinInput, pin);
      setPin(pinInput);
      setPinInput('');
      await refresh();
    });

  const removePin = () =>
    run(async () => {
      await clearMasterPin(pin);
      setPin('');
      await refresh();
    });

  const handleAdd = () =>
    run(async () => {
      await createProfile(newName, pin);
      setNewName('');
      await refresh();
    });

  const handleRename = (id: string, current: string) => {
    const name = window.prompt(_('Profile name'), current)?.trim();
    if (!name || name === current) return;
    void run(async () => {
      await renameProfile(id, name, pin);
      await refresh();
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(_('Delete {{name}} and all its progress and notes?', { name }))) return;
    void run(async () => {
      await deleteProfile(id, pin);
      await refresh();
    });
  };

  const activeName = state.profiles.find((p) => p.id === activeId)?.name;

  const rowButton = 'btn btn-ghost btn-sm';

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

        {view === 'pin' && (
          <form
            className='flex flex-col gap-3'
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <p className='text-sm'>{_('Enter the master PIN to continue.')}</p>
            <input
              type='password'
              inputMode='numeric'
              autoComplete='off'
              aria-label={_('Master PIN')}
              className='input input-bordered input-sm w-40'
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
            />
            <button type='submit' className='btn btn-contrast btn-sm w-40' disabled={busy}>
              {_('Unlock')}
            </button>
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
                  <button type='button' className={rowButton} onClick={() => switchProfile(null)}>
                    {_('Switch')}
                  </button>
                )}
              </li>
              {state.profiles.map((profile) => (
                <li key={profile.id} className='flex flex-wrap items-center justify-between gap-2'>
                  <span className={clsx('text-sm', profile.id === activeId && 'font-semibold')}>
                    {profile.name}
                  </span>
                  <span className='flex flex-wrap gap-1'>
                    {profile.id !== activeId && (
                      <button
                        type='button'
                        className={rowButton}
                        onClick={() => switchProfile(profile.id)}
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
                          onClick={() => void openBooks(profile.id, profile.name)}
                        >
                          {_('Books')}
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
                    {_('Asked before profiles are managed, and when leaving a profile.')}
                  </p>
                  <div className='flex flex-wrap items-center gap-2'>
                    <input
                      type='password'
                      inputMode='numeric'
                      autoComplete='off'
                      aria-label={_('New PIN')}
                      placeholder={_('4 to 8 digits')}
                      className='input input-bordered input-sm w-36'
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                    />
                    <button
                      type='button'
                      className='btn btn-outline btn-sm'
                      disabled={busy}
                      onClick={() => void changePin()}
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

        {view === 'books' && booksFor && (
          <>
            <p className='text-sm'>
              {_('Books {{name}} can see', { name: booksFor.name })} ({granted.size})
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
            <div className='flex justify-end gap-2'>
              <button type='button' className={rowButton} onClick={() => setView('list')}>
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

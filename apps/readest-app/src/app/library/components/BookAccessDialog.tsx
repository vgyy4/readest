import React, { useEffect, useState } from 'react';
import { Book } from '@/types/book';
import { useLibraryStore } from '@/store/libraryStore';
import { useTranslation } from '@/hooks/useTranslation';
import Dialog from '@/components/Dialog';
import { getSessionPin, setSessionPin } from '@/libs/profiles/session';
import { ensureBooksOnServer } from '@/libs/profiles/pushBooks';
import {
  fetchBookAccess,
  fetchProfiles,
  ProfilesState,
  setBookAccess,
  verifyProfilePin,
} from '@/libs/profiles/client';

interface BookAccessDialogProps {
  book: Pick<Book, 'hash' | 'title'>;
  onClose: () => void;
}

type View = 'loading' | 'unlock' | 'access';

/**
 * The admin's answer to "open this book": the admin does not read, so tapping a
 * book shows which profiles can see it. Reading progress is never shown here;
 * every profile keeps its own.
 */
const BookAccessDialog: React.FC<BookAccessDialogProps> = ({ book, onClose }) => {
  const stored = useLibraryStore.getState().library.find((b) => b.hash === book.hash);
  const notUploaded = !!stored && !stored.uploadedAt;
  const _ = useTranslation();
  const [view, setView] = useState<View>('loading');
  const [state, setState] = useState<ProfilesState>({ hasPin: false, profiles: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removedBy, setRemovedBy] = useState<Set<string>>(new Set());
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAccess = async () => {
    const access = await fetchBookAccess(book.hash, getSessionPin());
    setSelected(new Set(access.profileIds));
    setRemovedBy(new Set(access.removedProfileIds));
    setView('access');
  };

  useEffect(() => {
    void (async () => {
      try {
        const next = await fetchProfiles();
        setState(next);
        if (next.hasPin && !getSessionPin()) setView('unlock');
        else await loadAccess();
      } catch (e) {
        setError(e instanceof Error ? e.message : _('Could not reach the server.'));
        setView('access');
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

  const unlock = () =>
    run(async () => {
      if (!(await verifyProfilePin(null, pinInput))) throw new Error(_('Wrong PIN.'));
      setSessionPin(pinInput);
      setPinInput('');
      await loadAccess();
    });

  const save = () =>
    run(async () => {
      try {
        await ensureBooksOnServer([book.hash]);
      } catch {
        throw new Error(
          _('Could not send this book to the server. Check the connection and try again.'),
        );
      }
      await setBookAccess(book.hash, [...selected], getSessionPin());
      onClose();
    });

  return (
    <Dialog
      isOpen={true}
      title={book.title}
      onClose={onClose}
      boxClassName='sm:!w-[28rem] sm:!max-w-screen-sm sm:h-auto sm:!max-h-[80vh]'
    >
      <div className='book-access-dialog flex flex-col gap-4 p-4 sm:px-6'>
        {error && (
          <p role='alert' className='text-error text-sm'>
            {error}
          </p>
        )}
        {view === 'loading' && <p className='text-sm'>{_('Loading…')}</p>}

        {view === 'unlock' && (
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
              maxLength={4}
              aria-label={_('Master PIN')}
              placeholder='••••'
              className='input input-bordered input-sm w-28 text-center tracking-widest'
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            />
            <button type='submit' className='btn btn-contrast btn-sm w-28' disabled={busy}>
              {_('Unlock')}
            </button>
          </form>
        )}

        {view === 'access' && (
          <>
            <p className='text-sm'>{_('Profiles that can see this book')}</p>
            {notUploaded && (
              <p className='text-warning text-xs'>
                {_('This book is not uploaded yet, so profiles cannot open it until it is.')}
              </p>
            )}
            {state.profiles.length === 0 ? (
              <p className='text-base-content/60 text-sm'>
                {_('There are no profiles yet. Add one from Settings → Profiles.')}
              </p>
            ) : (
              <ul className='border-base-300 max-h-72 overflow-y-auto rounded-lg border'>
                {state.profiles.map((profile) => (
                  <li key={profile.id}>
                    <label className='flex cursor-pointer items-center gap-3 px-3 py-2'>
                      <input
                        type='checkbox'
                        className='checkbox checkbox-sm'
                        checked={selected.has(profile.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(profile.id);
                          else next.delete(profile.id);
                          setSelected(next);
                        }}
                      />
                      <span className='text-sm'>{profile.name}</span>
                      {!selected.has(profile.id) && removedBy.has(profile.id) && (
                        <span className='text-base-content/60 ms-auto text-xs'>{_('Removed')}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className='flex justify-end gap-2'>
              <button type='button' className='btn btn-ghost btn-sm' onClick={onClose}>
                {_('Cancel')}
              </button>
              <button
                type='button'
                className='btn btn-contrast btn-sm'
                disabled={busy || state.profiles.length === 0}
                onClick={() => void save()}
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

export default BookAccessDialog;

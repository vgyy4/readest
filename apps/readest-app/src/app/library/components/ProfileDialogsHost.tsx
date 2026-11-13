import React, { useEffect, useState } from 'react';
import { Book } from '@/types/book';
import { eventDispatcher } from '@/utils/event';
import ModalPortal from '@/components/ModalPortal';
import ProfilesDialog from './ProfilesDialog';
import BookAccessDialog from './BookAccessDialog';

interface ProfileDialogsHostProps {
  books: Book[];
}

/**
 * Opens the Profiles window and the admin's "who can see this book" window when the menus
 * ask for them by event. It lives on the library page itself, not inside the bookshelf: the
 * bookshelf does not exist while the library is empty (a new device, a new profile), and
 * Profiles has to work there too.
 */
const ProfileDialogsHost: React.FC<ProfileDialogsHostProps> = ({ books }) => {
  const [showProfiles, setShowProfiles] = useState(false);
  const [accessBookHash, setAccessBookHash] = useState<string | null>(null);

  useEffect(() => {
    const openProfiles = () => setShowProfiles(true);
    const openAccess = (event: CustomEvent) => {
      const [hash] = (event.detail as { bookHashes: string[] }).bookHashes;
      if (hash) setAccessBookHash(hash);
    };
    eventDispatcher.on('open-profiles', openProfiles);
    eventDispatcher.on('open-book-access', openAccess);
    return () => {
      eventDispatcher.off('open-profiles', openProfiles);
      eventDispatcher.off('open-book-access', openAccess);
    };
  }, []);

  return (
    <>
      {accessBookHash && (
        <ModalPortal>
          <BookAccessDialog
            book={
              books.find((book) => book.hash === accessBookHash) ?? {
                hash: accessBookHash,
                title: '',
              }
            }
            onClose={() => setAccessBookHash(null)}
          />
        </ModalPortal>
      )}
      {showProfiles && (
        <ModalPortal>
          <ProfilesDialog books={books} onClose={() => setShowProfiles(false)} />
        </ModalPortal>
      )}
    </>
  );
};

export default ProfileDialogsHost;

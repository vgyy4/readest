import clsx from 'clsx';
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Book } from '@/types/book';
import { useAudiobook } from '@/hooks/useAudiobook';
import { useHtmlAttribute, useIsEink } from '@/hooks/useHtmlAttribute';
import { useAudiobookStore } from '@/store/audiobookStore';
import { useDeviceControlStore } from '@/store/deviceStore';
import { useLibraryStore } from '@/store/libraryStore';
import { eventDispatcher } from '@/utils/event';
import { AudiobookPlayerView } from './AudiobookPlayer';
import AudiobookMiniPlayer from './AudiobookMiniPlayer';

/** How long the full player stays mounted after it is closed, so it can finish sliding away. */
const EXIT_MS = 500;

const onReaderPage = (pathname: string | null) => !!pathname && pathname.startsWith('/reader');

const Loaded: React.FC<{ book: Book }> = ({ book }) => {
  const player = useAudiobook(book);
  const pathname = usePathname();
  const expanded = useAudiobookStore((s) => s.expanded);
  const backRoute = useAudiobookStore((s) => s.backRoute);
  const eink = useIsEink();
  const lite = useHtmlAttribute('data-perf') === 'low';
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();

  // The full player stays mounted while it slides away.
  const [mounted, setMounted] = useState(expanded);
  useEffect(() => {
    if (expanded) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [expanded]);

  const leave = () => {
    const { backRoute: back, collapse, setBackRoute } = useAudiobookStore.getState();
    collapse();
    setBackRoute(null);
    back?.();
  };

  // Opened from a page (the reader route) and that page has been left: only the mini player stays.
  useEffect(() => {
    if (expanded && backRoute && !onReaderPage(pathname)) {
      useAudiobookStore.getState().collapse();
      useAudiobookStore.getState().setBackRoute(null);
    }
  }, [expanded, backRoute, pathname]);

  // Android's Back button closes the full player rather than the page behind it.
  useEffect(() => {
    if (!expanded) return;
    acquireBackKeyInterception();
    const handleKey = (event: CustomEvent) => {
      if (event.detail.keyName !== 'Back') return false;
      leave();
      return true;
    };
    eventDispatcher.onSync('native-key-down', handleKey);
    return () => {
      eventDispatcher.offSync('native-key-down', handleKey);
      releaseBackKeyInterception();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Keep the last shelf row clear of the mini player.
  const miniVisible = !expanded && !onReaderPage(pathname);
  useEffect(() => {
    if (!miniVisible) return;
    document.body.style.setProperty('--now-playing-inset', '88px');
    return () => {
      document.body.style.removeProperty('--now-playing-inset');
    };
  }, [miniVisible]);

  return (
    <>
      <audio {...player.audioProps} />
      {mounted && (
        <div
          className={clsx(
            'ab-host-sheet fixed inset-0 z-[70]',
            expanded ? 'ab-host-open' : 'ab-host-closed',
            (eink || lite) && 'ab-host-plain',
          )}
          aria-hidden={!expanded}
        >
          <AudiobookPlayerView book={book} player={player} onBack={leave} onScreen={expanded} />
        </div>
      )}
      <AudiobookMiniPlayer
        book={book}
        player={player}
        visible={miniVisible}
        onOpen={() => useAudiobookStore.getState().expand()}
        onClose={() => useAudiobookStore.getState().close()}
      />
    </>
  );
};

/**
 * The app-wide audiobook player. It is mounted once, above the pages, so the book carries on
 * playing while you move around the app: the full player slides away to a mini player, and the
 * same audio keeps going. Pages start it with `useAudiobookStore().open(hash)`.
 */
const AudiobookHost: React.FC = () => {
  const bookHash = useAudiobookStore((s) => s.bookHash);
  const book = useLibraryStore((s) => (bookHash ? s.getBookByHash(bookHash) : undefined));

  useEffect(() => {
    useAudiobookStore.getState().setHostMounted(true);
    return () => {
      useAudiobookStore.getState().setHostMounted(false);
    };
  }, []);

  if (!bookHash || !book) return null;
  // A new book starts from a clean player (its own audio, position and chapters).
  return <Loaded key={book.hash} book={book} />;
};

export default AudiobookHost;

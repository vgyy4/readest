import { useEffect } from 'react';
import { useAudiobookStore } from '@/store/audiobookStore';

/**
 * A page that was asked to show an audiobook hands it to the app-wide player (AudiobookHost),
 * which plays it above the pages so it carries on when the page is left. `goBack` runs when the
 * player is closed. Returns whether the host took the book (the page then has nothing to draw).
 */
export const useAudiobookHandoff = (
  audiobookHash: string | undefined,
  ready: boolean,
  goBack: () => void,
): boolean => {
  const hostMounted = useAudiobookStore((state) => state.hostMounted);
  useEffect(() => {
    if (!ready || !hostMounted || !audiobookHash) return;
    useAudiobookStore.getState().open(audiobookHash, goBack);
    // The book and whether the host is there decide this; `goBack` is only called later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hostMounted, audiobookHash]);
  return ready && hostMounted && !!audiobookHash;
};

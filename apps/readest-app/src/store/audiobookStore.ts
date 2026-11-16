import { create } from 'zustand';

/**
 * Which audiobook is loaded in the app-wide player (`AudiobookHost`), and whether the full player
 * is showing. The player lives above the pages, so a book keeps playing while you browse the
 * library or settings; `collapse` shrinks it to the mini player, `close` stops it.
 */
interface AudiobookState {
  /** The AudiobookHost is mounted (so pages can hand an audiobook to it instead of playing it). */
  hostMounted: boolean;
  /** The book loaded in the player, playing or not. */
  bookHash: string | null;
  /** The full player is showing (otherwise the mini player is). */
  expanded: boolean;
  /**
   * Set by a page that opened the player (the reader route) to go back when it is closed.
   * Absent when the player was expanded from the mini player, which has no page to go back from.
   */
  backRoute: (() => void) | null;
  setHostMounted: (mounted: boolean) => void;
  /** Load `hash` (if not already) and show the full player. */
  open: (hash: string, backRoute?: (() => void) | null) => void;
  expand: () => void;
  collapse: () => void;
  /** Stop and unload the book. */
  close: () => void;
  setBackRoute: (backRoute: (() => void) | null) => void;
}

export const useAudiobookStore = create<AudiobookState>((set) => ({
  hostMounted: false,
  bookHash: null,
  expanded: false,
  backRoute: null,
  setHostMounted: (hostMounted) => set({ hostMounted }),
  open: (hash, backRoute = null) => set({ bookHash: hash, expanded: true, backRoute }),
  expand: () => set((state) => (state.bookHash ? { expanded: true } : state)),
  collapse: () => set({ expanded: false }),
  close: () => set({ bookHash: null, expanded: false, backRoute: null }),
  setBackRoute: (backRoute) => set({ backRoute }),
}));

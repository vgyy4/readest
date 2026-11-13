import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Where the system gives no change notifications (iOS), the folders are looked at this often
 * instead, as well as at start and whenever the app comes back to the front.
 */
export const FALLBACK_SCAN_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Ask the system to tell us when books appear in `paths` (the Rust side listens to inotify /
 * FSEvents / ReadDirectoryChangesW). `onChange` is called once the folders have been quiet.
 * Resolves to a function that stops watching, or null when this device cannot watch folders.
 */
export const startFolderWatch = async (
  paths: string[],
  onChange: () => void,
): Promise<(() => void) | null> => {
  try {
    await invoke('watch_folders', { paths });
  } catch (error) {
    console.warn('Folder change notifications are not available:', error);
    return null;
  }
  const unlisten = await listen('watched-folders-changed', () => onChange());
  return () => {
    unlisten();
    void invoke('watch_folders', { paths: [] }).catch(() => {});
  };
};

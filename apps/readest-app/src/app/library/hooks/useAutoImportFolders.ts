import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useWindowActiveChanged } from '@/app/reader/hooks/useWindowActiveChanged';
import { debounce } from '@/utils/debounce';
import { FALLBACK_SCAN_INTERVAL_MS, startFolderWatch } from '@/services/folderWatch';

/** Quiet window collapsing the near-simultaneous mount + focus/visibility triggers. */
const AUTO_IMPORT_DEBOUNCE_MS = 800;
/** How long to wait before looking again at a file that was still being copied in. */
const GROWING_RECHECK_MS = 8000;

export interface UseAutoImportFoldersOptions {
  /**
   * Master gate. When false the hook never scans. Compose it in the caller
   * from the setting toggle, folder count, library-loaded, and platform checks.
   */
  enabled: boolean;
  /** Absolute paths to re-scan (settings.externalLibraryFolders). */
  folders: string[];
  /**
   * Scans the folders and imports any new books. Supplied by the library page. Resolves to
   * `true` when some file was still being copied in, so the folders should be looked at again soon.
   */
  scanAndImport: (folders: string[]) => Promise<boolean | void>;
}

/**
 * Re-scans the user's registered external library folders and imports newly
 * added books — on mount, whenever the app regains focus (desktop) or becomes
 * visible again (mobile), and when the system reports a change in the folders. Local-folder counterpart of
 * {@link useLibraryFileSync}. Mount once on the library page. This hook only
 * decides *when* to run; the scan/dedup/import lives in `scanAndImport`.
 */
export const useAutoImportFolders = ({
  enabled,
  folders,
  scanAndImport,
}: UseAutoImportFoldersOptions) => {
  // Read the latest values at fire time so a toggle-off or folder-list change
  // between schedule and fire is honoured without rebuilding the debounced fn.
  const enabledRef = useRef(enabled);
  const foldersRef = useRef(folders);
  const scanRef = useRef(scanAndImport);
  const runningRef = useRef(false);
  // Something changed while a scan was running: look again once it is done, or it is missed.
  const askedAgainRef = useRef(false);
  const debouncedRunRef = useRef<() => void>(() => {});
  useEffect(() => {
    enabledRef.current = enabled;
    foldersRef.current = folders;
    scanRef.current = scanAndImport;
  });

  const run = useCallback(async () => {
    if (!enabledRef.current) return;
    if (runningRef.current) {
      askedAgainRef.current = true;
      return;
    }
    const targets = foldersRef.current;
    if (targets.length === 0) return;
    runningRef.current = true;
    let lookAgainSoon = false;
    try {
      lookAgainSoon = (await scanRef.current(targets)) === true;
    } catch (e) {
      console.error('Auto-import folders: scan failed', e);
    } finally {
      runningRef.current = false;
    }
    if (askedAgainRef.current) {
      askedAgainRef.current = false;
      debouncedRunRef.current();
    } else if (lookAgainSoon) {
      setTimeout(() => debouncedRunRef.current(), GROWING_RECHECK_MS);
    }
  }, []);

  const debouncedRun = useMemo(() => debounce(() => void run(), AUTO_IMPORT_DEBOUNCE_MS), [run]);
  debouncedRunRef.current = debouncedRun;

  // Fire on mount and whenever the gate opens or the folder set changes.
  const foldersKey = folders.join('\n');
  useEffect(() => {
    if (enabled && folders.length > 0) debouncedRun();
    return () => debouncedRun.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, foldersKey, debouncedRun]);

  // Let the system say when something changes (inotify, FSEvents, ...) instead of looking
  // again and again. Only where it cannot (iOS) is there a slow timer as well.
  useEffect(() => {
    if (!enabled || folders.length === 0) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    void startFolderWatch(foldersRef.current, () => debouncedRun()).then((stopWatching) => {
      if (cancelled) {
        stopWatching?.();
        return;
      }
      stop = stopWatching;
      if (!stopWatching) {
        timer = setInterval(() => debouncedRun(), FALLBACK_SCAN_INTERVAL_MS);
      }
    });
    return () => {
      cancelled = true;
      stop?.();
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, foldersKey, debouncedRun]);

  // Fire when the app/window regains focus (desktop) or becomes visible (mobile).
  useWindowActiveChanged((isActive) => {
    if (isActive) debouncedRun();
  });
};

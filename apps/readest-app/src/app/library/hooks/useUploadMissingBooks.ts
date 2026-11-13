import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { transferManager } from '@/services/transferManager';
import { booksNeedingUpload } from '@/services/booksNeedingUpload';
import { findBooksMissingFromServer } from '@/services/serverFileCheck';
import { isReadestCloudStorageActive } from '@/services/sync/cloudSyncProvider';
import { getActiveProfileId } from '@/libs/profiles/active';

/**
 * Once per launch and profile, queue an upload for every book that has not reached the server,
 * and for every book marked uploaded that the server has no file for (the mark can be wrong: it
 * may have come from another server, an upload that never finished, or an emptied storage; other
 * devices then fail to download the book). Only a device that still has the file can fix it, which
 * is why this runs on every device. Uploads wait for Wi-Fi like any automatic upload (see
 * transferManager), so this never spends mobile data by itself.
 */
export const useUploadMissingBooks = (libraryLoaded: boolean) => {
  const { token } = useAuth();
  const { envConfig } = useEnv();
  const { updateBook } = useLibraryStore();
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (!libraryLoaded || !token) return;
    const key = getActiveProfileId() ?? 'main';
    if (doneFor.current === key) return;
    let cancelled = false;
    void transferManager.waitUntilReady().then(() => {
      if (cancelled) return;
      const settings = useSettingsStore.getState().settings;
      if (settings?.syncCategories?.book === false || !isReadestCloudStorageActive(settings)) {
        return;
      }
      doneFor.current = key;
      const library = useLibraryStore.getState().library;
      const missing = booksNeedingUpload(library);
      if (missing.length > 0) transferManager.queueBatchUploads(missing);

      void findBooksMissingFromServer(library).then(async (lost) => {
        if (lost.length === 0) return;
        const stamp = Date.now();
        const corrected = lost.map((book) => ({ ...book, uploadedAt: null, updatedAt: stamp }));
        for (const book of corrected) await updateBook(envConfig, book);
        transferManager.queueBatchUploads(corrected);
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryLoaded, token]);
};

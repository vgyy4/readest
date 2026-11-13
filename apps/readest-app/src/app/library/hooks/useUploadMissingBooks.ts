import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { transferManager } from '@/services/transferManager';
import { booksNeedingUpload } from '@/services/booksNeedingUpload';
import { isReadestCloudStorageActive } from '@/services/sync/cloudSyncProvider';
import { getActiveProfileId } from '@/libs/profiles/active';

/**
 * Once per launch and profile, queue an upload for every book that has not reached the server
 * yet. They wait for Wi-Fi like any automatic upload (see transferManager), so this never spends
 * mobile data by itself.
 */
export const useUploadMissingBooks = (libraryLoaded: boolean) => {
  const { token } = useAuth();
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
      const missing = booksNeedingUpload(useLibraryStore.getState().library);
      if (missing.length > 0) transferManager.queueBatchUploads(missing);
    });
    return () => {
      cancelled = true;
    };
  }, [libraryLoaded, token]);
};

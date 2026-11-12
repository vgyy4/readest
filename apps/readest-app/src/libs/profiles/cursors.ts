import type { SystemSettings } from '@/types/settings';
import { getActiveProfileId } from './active';

export type SyncCursorKind = 'books' | 'configs' | 'notes';

const MASTER_FIELD = {
  books: 'lastSyncedAtBooks',
  configs: 'lastSyncedAtConfigs',
  notes: 'lastSyncedAtNotes',
} as const;

/**
 * Last-synced timestamps. The master keeps the account-wide ones; a profile
 * has its own, since its rows live under a different user on the server and a
 * shared cursor would make it skip rows or re-pull everything.
 */
export const getSyncCursor = (settings: SystemSettings, kind: SyncCursorKind): number => {
  const profileId = getActiveProfileId();
  if (!profileId) return settings[MASTER_FIELD[kind]] ?? 0;
  return settings.profileSyncCursors?.[profileId]?.[kind] ?? 0;
};

export const setSyncCursor = (settings: SystemSettings, kind: SyncCursorKind, value: number) => {
  const profileId = getActiveProfileId();
  if (!profileId) {
    settings[MASTER_FIELD[kind]] = value;
    return;
  }
  settings.profileSyncCursors = {
    ...settings.profileSyncCursors,
    [profileId]: { ...settings.profileSyncCursors?.[profileId], [kind]: value },
  };
};

import type { SystemSettings } from '@/types/settings';
import { getActiveProfileId } from './active';

/**
 * The folders Readest watches for new books belong to the profile that chose them: books found
 * there are added to that profile's library, as if it had added them. The main profile keeps the
 * original settings keys (so nothing is lost on update); each other profile has its own entry.
 */
export const getWatchedFolders = (
  settings: SystemSettings,
  profileId: string | null = getActiveProfileId(),
): string[] =>
  (profileId ? settings.profileAutoImportFolders?.[profileId] : settings.autoImportFolders) ?? [];

/** The watched folders whose books go straight to the library root (no groups from subfolders). */
export const getFlattenFolders = (
  settings: SystemSettings,
  profileId: string | null = getActiveProfileId(),
): string[] =>
  (profileId
    ? settings.profileAutoImportFlattenFolders?.[profileId]
    : settings.autoImportFlattenFolders) ?? [];

/** The settings change that sets `profileId`'s watched folders, leaving other profiles' alone. */
export const withWatchedFolders = (
  settings: SystemSettings,
  profileId: string | null,
  folders: string[],
  flatten: string[],
): Partial<SystemSettings> => {
  if (!profileId) return { autoImportFolders: folders, autoImportFlattenFolders: flatten };
  return {
    profileAutoImportFolders: { ...settings.profileAutoImportFolders, [profileId]: folders },
    profileAutoImportFlattenFolders: {
      ...settings.profileAutoImportFlattenFolders,
      [profileId]: flatten,
    },
  };
};

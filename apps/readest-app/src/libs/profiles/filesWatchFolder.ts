/**
 * On an iPad or iPhone a folder cannot be chosen once and kept: the system forgets it when the app
 * closes. What the Files app does show is the app's own folder (On My iPad > Readest), so each
 * profile gets a folder of its own there to drop books and audiobooks into.
 */
const FOLDER = 'Readest Watch';

/** A profile name that is fine as a folder name. */
export const safeFolderName = (name: string): string => {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return /^_*$/.test(cleaned) ? 'Profile' : cleaned;
};

/** `<Documents>/Readest Watch/<profile name>` (the main profile is "Main"). */
export const filesWatchPath = (documentsDir: string, profileName: string | null): string =>
  `${documentsDir.replace(/\/+$/, '')}/${FOLDER}/${profileName ? safeFolderName(profileName) : 'Main'}`;

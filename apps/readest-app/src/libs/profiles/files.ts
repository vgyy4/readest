/** Library index file of a profile on this device; null is the main profile. */
export const libraryFilenameFor = (profileId: string | null) =>
  profileId ? `library.${profileId}.json` : 'library.json';

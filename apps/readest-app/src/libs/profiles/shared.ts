/** Profile helpers with no Node APIs, so client-shared modules may import them. */

/** Sent by the app to act as one of the account's profiles; absent means the master. */
export const PROFILE_HEADER = 'x-readest-profile';
/** Sent with master-only requests when the master profile has a PIN. */
export const PIN_HEADER = 'x-readest-master-pin';

export interface ResolvedProfile {
  /** The user whose rows the request reads and writes. */
  userId: string;
  isProfile: boolean;
}

/**
 * Map a request to the user whose data it touches. A child profile is a hidden
 * user owned by the account, so the header only counts if `lookup` confirms the
 * signed-in account owns it; anything else is rejected (null).
 */
export const resolveProfileUser = async (
  ownerId: string,
  header: string | null | undefined,
  lookup: (ownerId: string, profileId: string) => Promise<boolean>,
): Promise<ResolvedProfile | null> => {
  if (!header || header === ownerId) return { userId: ownerId, isProfile: false };
  return (await lookup(ownerId, header)) ? { userId: header, isProfile: true } : null;
};

export const isValidPin = (pin: unknown): pin is string =>
  typeof pin === 'string' && /^\d{4}$/.test(pin);

/** What changes when the master sets a profile's visible books to `desired`. */
export const diffGrants = (current: string[], desired: string[]) => {
  const have = new Set(current);
  const want = new Set(desired);
  return {
    add: [...want].filter((hash) => !have.has(hash)),
    remove: [...have].filter((hash) => !want.has(hash)),
  };
};

/** Reading state that belongs to a profile, never copied from the master's row. */
const PROFILE_OWN_FIELDS = {
  progress: null,
  reading_status: null,
  reading_status_updated_at: null,
  deleted_at: null,
};

/** The profile's copies of the master's books: same catalog data, a fresh reading state. */
export const buildGrantRows = <T extends Record<string, unknown>>(
  masterRows: T[],
  profileUserId: string,
) => masterRows.map((row) => ({ ...row, ...PROFILE_OWN_FIELDS, user_id: profileUserId }));

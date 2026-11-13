export type AvatarTarget = { kind: 'main' } | { kind: 'child'; profileId: string };

/**
 * Whose picture a request may change. A profile changes only its own; the account itself
 * (no profile header) changes the main profile's or any profile it owns. `requested` is
 * the profile id in the body (empty or the account id means the main profile).
 */
export const resolveAvatarTarget = ({
  isProfile,
  effectiveUserId,
  ownerId,
  requested,
}: {
  isProfile: boolean;
  /** The profile's user when acting as a profile, else the account. */
  effectiveUserId: string;
  ownerId: string;
  requested: unknown;
}): AvatarTarget | null => {
  const wanted = typeof requested === 'string' && requested ? requested : null;
  if (isProfile) {
    return !wanted || wanted === effectiveUserId
      ? { kind: 'child', profileId: effectiveUserId }
      : null;
  }
  if (!wanted || wanted === ownerId) return { kind: 'main' };
  return { kind: 'child', profileId: wanted };
};

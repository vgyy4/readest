/**
 * The device could not reach the server (offline), as opposed to the server refusing. An expired
 * session that cannot be renewed without a connection counts too: it surfaces as "Not authenticated".
 */
export const isOfflineError = (error: unknown): boolean =>
  error instanceof TypeError ||
  /failed to fetch|load failed|network|offline|timed out|abort|not authenticated/i.test(
    String(error),
  );

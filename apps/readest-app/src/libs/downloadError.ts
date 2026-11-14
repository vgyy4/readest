/** The server has no file for this book (as opposed to refusing, timing out or dropping). */
export class NotOnServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotOnServerError';
  }
}

export const isNotOnServerError = (error: unknown): boolean =>
  error instanceof NotOnServerError ||
  (error instanceof Error &&
    /does not have this (book|file)|not on the server/i.test(error.message));

/** What went wrong with a download, in words the user can act on. */
export const friendlyDownloadError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  // The server's own words when it has no record of the file.
  if (/^file not found$/i.test(message.trim())) {
    return new NotOnServerError(
      'The server does not have this book. Open Readest on a device that has it, on Wi-Fi, and it will be uploaded again.',
    );
  }
  if (/No download URL available/i.test(message)) {
    return new NotOnServerError(
      'The server does not have this book. Open Readest on a device that has it, on Wi-Fi, and it will be uploaded again.',
    );
  }
  if (/\b(401|403)\b/.test(message)) {
    return new Error(
      'The server refused the download (403). Sign in again; if the server is behind Cloudflare Access, check the service token.',
    );
  }
  if (/\b404\b/.test(message)) {
    return new NotOnServerError(
      'The server does not have this book (404). Open Readest on a device that has it, on Wi-Fi, and it will be uploaded again.',
    );
  }
  if (/\b(408|502|503|504|522|524)\b/.test(message)) {
    return new Error('The server did not answer in time. Check the connection and try again.');
  }
  return error instanceof Error ? error : new Error(message);
};

/**
 * Worth asking again with a single connection? A refusal or a missing file will be the same
 * the second time; a dropped part or a connection that was cut may not be.
 */
export const isRetryableDownloadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    !/\b(401|403|404)\b/.test(message) &&
    !/No download URL available/i.test(message) &&
    !/^file not found$/i.test(message.trim())
  );
};

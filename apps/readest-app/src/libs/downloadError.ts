/** What went wrong with a download, in words the user can act on. */
export const friendlyDownloadError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  if (/No download URL available/i.test(message)) {
    return new Error(
      'The server does not have this file. It may not have finished uploading from the other device.',
    );
  }
  if (/\b(401|403)\b/.test(message)) {
    return new Error(
      'The server refused the download (403). Sign in again; if the server is behind Cloudflare Access, check the service token.',
    );
  }
  if (/\b404\b/.test(message)) {
    return new Error('The file is not on the server (404). It may not have finished uploading.');
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
  return !/\b(401|403|404)\b/.test(message) && !/No download URL available/i.test(message);
};

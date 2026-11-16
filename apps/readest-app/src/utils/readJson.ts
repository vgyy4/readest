/**
 * The server (or Cloudflare Access in front of it) answered with a page where data was expected.
 * Safari words that as "The string did not match the expected pattern.", which says nothing.
 */
const pageInsteadOfData = (response: Pick<Response, 'status'>) =>
  new Error(
    `The server sent a web page instead of data (HTTP ${response.status ?? '?'}). Behind ` +
      'Cloudflare Access this means the device was turned away: check the service token ' +
      '(client id and secret, with no spaces) on the sign-in screen, and that the server address is right.',
  );

/** `response.json()`, with a message that says what is wrong when the answer is not JSON. */
export const readJson = async <T>(response: Response): Promise<T> => {
  try {
    return (await response.json()) as T;
  } catch {
    throw pageInsteadOfData(response);
  }
};

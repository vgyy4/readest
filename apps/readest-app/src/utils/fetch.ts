import { getAccessToken } from './access';
import { getActiveProfileId } from '@/libs/profiles/active';
import { PROFILE_HEADER } from '@/libs/profiles/shared';
import { getAccessHeaders } from '@/libs/cloudflareAccess';

export const fetchWithTimeout = (url: string, options: RequestInit = {}, timeout = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort('Request timed out'), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(id));
};

/**
 * Headers every request to our own server needs besides the sign-in token: the profile the
 * device is acting as (so progress, notes and the library stay separate) and, behind
 * Cloudflare Access, the service token.
 */
export const getServerHeaders = (url: string): Record<string, string> => {
  const profileId = getActiveProfileId();
  return {
    ...getAccessHeaders(url),
    ...(profileId ? { [PROFILE_HEADER]: profileId } : {}),
  };
};

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

export const fetchWithAuth = async (url: string, options: RequestInit) => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  // Acting as a profile: the server maps the request to that profile's data.
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
    ...getServerHeaders(url),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const errorData = await readJson<{ error?: string }>(response);
    console.error('Error:', errorData.error || response.statusText);
    throw new Error(errorData.error || 'Request failed');
  }

  return response;
};

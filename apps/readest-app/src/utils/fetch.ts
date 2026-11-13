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

export const fetchWithAuth = async (url: string, options: RequestInit) => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  // Acting as a profile: the server maps the request to that profile's data.
  const profileId = getActiveProfileId();
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
    ...getAccessHeaders(url),
    ...(profileId ? { [PROFILE_HEADER]: profileId } : {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Error:', errorData.error || response.statusText);
    throw new Error(errorData.error || 'Request failed');
  }

  return response;
};

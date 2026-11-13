/**
 * Cloudflare Access support. When the server sits behind an Access application (for
 * example a Google sign-in on the whole domain), the apps cannot do that browser login, so
 * they present a service token instead: enter it with the server address on the sign-in
 * screen (or set `NEXT_PUBLIC_CF_ACCESS_CLIENT_ID` and `NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET`
 * when building). The token is only ever sent to the
 * configured server's own hosts, never to anyone else.
 */
export const ACCESS_ID_HEADER = 'CF-Access-Client-Id';
export const ACCESS_SECRET_HEADER = 'CF-Access-Client-Secret';

const hostOf = (value: string | undefined) => {
  if (!value) return '';
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
};

const runtime = () => (typeof window === 'undefined' ? undefined : window.__READEST_RUNTIME_CONFIG);

const allowedHosts = () =>
  [
    hostOf(process.env['NEXT_PUBLIC_API_BASE_URL']),
    hostOf(process.env['NEXT_PUBLIC_SUPABASE_URL']),
    hostOf(runtime()?.apiBaseUrl),
    hostOf(runtime()?.supabaseUrl),
    ...(process.env['NEXT_PUBLIC_CF_ACCESS_HOSTS'] ?? '').split(',').map((h) => h.trim()),
  ].filter(Boolean);

/** The service-token headers for a request to `url`, or none if it is not our server. */
export const getAccessHeaders = (url: string): Record<string, string> => {
  const id = runtime()?.cfAccessClientId ?? process.env['NEXT_PUBLIC_CF_ACCESS_CLIENT_ID'];
  const secret =
    runtime()?.cfAccessClientSecret ?? process.env['NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET'];
  if (!id || !secret) return {};
  const host = hostOf(url);
  if (!host || !allowedHosts().includes(host)) return {};
  return { [ACCESS_ID_HEADER]: id, [ACCESS_SECRET_HEADER]: secret };
};

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** `fetch` that adds the service token for our server (used by the Supabase client). */
export const accessFetch: typeof fetch = (input, init) => {
  const extra = getAccessHeaders(urlOf(input));
  if (Object.keys(extra).length === 0) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return fetch(input, { ...init, headers });
};

let installed = false;

/**
 * Make every `fetch` from the page add the service token for our own server, so no request
 * (sync, settings, sharing ...) is turned away by Cloudflare Access because its code forgot
 * to. Requests to other hosts are untouched. Safe to call more than once.
 */
export const installAccessFetch = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const extra = getAccessHeaders(urlOf(input));
    if (Object.keys(extra).length === 0) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
    for (const [name, value] of Object.entries(extra)) {
      if (!headers.has(name)) headers.set(name, value);
    }
    return original(input, { ...init, headers });
  };
};

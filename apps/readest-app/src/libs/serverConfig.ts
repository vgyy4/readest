import type { ReadestRuntimeConfig } from '@/services/runtimeConfig';

/**
 * Which server the app talks to. The mobile and desktop apps are built once and the user
 * types their own server address on the sign-in screen; it is remembered on the device and
 * fed to the app through the same runtime config a self-hosted web build gets from
 * /runtime-config.js, so nothing in the app is tied to a build-time address.
 */
export interface CustomServer {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Cloudflare Access service token, if the server is behind Access. */
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
}

export const SERVER_KEY = 'readest-server';
export const SERVER_INFO_PATH = '/api/server-info';

/** `books.example.com`, `http://192.168.1.50:3000/` and `https://x.y/z` all become an origin. */
export const normalizeServerUrl = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
};

export const getStoredServer = (): CustomServer | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SERVER_KEY) ?? 'null') as CustomServer | null;
    return parsed?.apiBaseUrl && parsed.supabaseUrl && parsed.supabaseAnonKey ? parsed : null;
  } catch {
    return null;
  }
};

export const saveServer = (server: CustomServer) =>
  localStorage.setItem(SERVER_KEY, JSON.stringify(server));

export const clearServer = () => localStorage.removeItem(SERVER_KEY);

/**
 * Runs before the app's code, so everything that reads the runtime config (the Supabase
 * client, the API address) sees the chosen server. Only rendered into the native builds.
 */
export const SERVER_BOOT_SCRIPT = `try{var c=JSON.parse(localStorage.getItem('${SERVER_KEY}')||'null');if(c&&c.supabaseUrl&&c.supabaseAnonKey&&c.apiBaseUrl){window.__READEST_RUNTIME_CONFIG=Object.assign({},window.__READEST_RUNTIME_CONFIG,{supabaseUrl:c.supabaseUrl,supabaseAnonKey:c.supabaseAnonKey,apiBaseUrl:c.apiBaseUrl,cfAccessClientId:c.cfAccessClientId,cfAccessClientSecret:c.cfAccessClientSecret})}}catch(e){}`;

export type ServerCheckError = 'invalid-url' | 'unreachable' | 'blocked' | 'not-readest';

export class ServerCheckFailure extends Error {
  constructor(public reason: ServerCheckError) {
    super(reason);
  }
}

/** Ask a server for its addresses and check it really is a Readest server. */
export const discoverServer = async (
  input: string,
  access?: { clientId?: string; clientSecret?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CustomServer> => {
  const origin = normalizeServerUrl(input);
  if (!origin) throw new ServerCheckFailure('invalid-url');

  const headers: Record<string, string> = {};
  if (access?.clientId && access.clientSecret) {
    headers['CF-Access-Client-Id'] = access.clientId;
    headers['CF-Access-Client-Secret'] = access.clientSecret;
  }

  let response: Response;
  try {
    response = await fetchImpl(`${origin}${SERVER_INFO_PATH}`, { headers });
  } catch {
    // Network error, or a CORS refusal: Cloudflare Access answers an unauthenticated
    // request with a redirect to its login page, which the browser reports the same way.
    throw new ServerCheckFailure(access?.clientId ? 'unreachable' : 'blocked');
  }
  if (response.status === 401 || response.status === 403) throw new ServerCheckFailure('blocked');
  if (!response.ok) throw new ServerCheckFailure('not-readest');

  let info: Partial<ReadestRuntimeConfig> & { readest?: string };
  try {
    info = await response.json();
  } catch {
    throw new ServerCheckFailure('not-readest');
  }
  if (info.readest !== 'server-info' || !info.supabaseUrl || !info.supabaseAnonKey) {
    throw new ServerCheckFailure('not-readest');
  }
  return {
    apiBaseUrl: info.apiBaseUrl || origin,
    supabaseUrl: info.supabaseUrl,
    supabaseAnonKey: info.supabaseAnonKey,
    ...(access?.clientId && access.clientSecret
      ? { cfAccessClientId: access.clientId, cfAccessClientSecret: access.clientSecret }
      : {}),
  };
};

import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { getServerRuntimeConfig } from '@/services/runtimeConfig';

/**
 * Lets the mobile and desktop apps find this server's addresses from the one address the
 * user types on the sign-in screen. Everything returned is public by design (the anon key
 * is what any browser visiting the site receives).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { supabaseUrl, supabaseAnonKey, apiBaseUrl } = getServerRuntimeConfig();
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    readest: 'server-info',
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl: apiBaseUrl || (host ? `${proto}://${host}` : undefined),
  });
}

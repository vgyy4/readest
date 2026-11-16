import type { NextApiRequest, NextApiResponse } from 'next';
import { isProfileBookUpload, PROFILE_HEADER } from '@/libs/profiles/shared';
import { checkStoredFile, parseSha256 } from '@/libs/storageChecksum';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { isSafeObjectKeyName, sha256OfObject } from '@/utils/object';

/**
 * Has the server really stored the file that was sent? Reads the stored copy back and compares its
 * SHA-256 with the one recorded when the upload began (see upload.ts and multipart.ts).
 *
 *   POST { fileName, sha256? } -> { status: 'running' | 'verified' | 'mismatch' | ... }
 *
 * The first request starts the check, the app asks again until the answer is not "running" (see
 * libs/storageChecksum.ts for why). `sha256` is only used when the upload began with an app that
 * did not record one.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token, ownerId, isProfile } = await validateUserAndToken(
    req.headers['authorization'],
    req.headers[PROFILE_HEADER],
  );
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  const { fileName, sha256 } = req.body ?? {};
  if (!isSafeObjectKeyName(fileName)) return res.status(400).json({ error: 'Invalid fileName' });
  const hashInName = /^Readest\/Books\/([0-9a-f]{32})\//i.exec(fileName)?.[1];
  if (isProfile && !isProfileBookUpload(fileName, hashInName)) {
    return res.status(403).json({ error: 'A profile can only check book files' });
  }
  const storageOwnerId = isProfile && ownerId ? ownerId : user.id;
  const fileKey = `${storageOwnerId}/${fileName}`;
  const supabase = createSupabaseAdminClient();

  try {
    const { data: record, error } = await supabase
      .from('files')
      .select('file_size, sha256, sha256_checked_at')
      .eq('user_id', storageOwnerId)
      .eq('file_key', fileKey)
      .limit(1)
      .maybeSingle();
    // A server whose database was not updated yet has no such column: nothing can be checked.
    if (error) return res.status(200).json({ status: 'unsupported' });
    if (!record) return res.status(200).json({ status: 'missing' });

    const wanted = parseSha256(record.sha256) ?? parseSha256(sha256);
    if (!wanted) return res.status(200).json({ status: 'unsupported' });
    if (record.sha256_checked_at && parseSha256(record.sha256) === wanted) {
      return res.status(200).json({ status: 'verified' });
    }

    const status = checkStoredFile(
      fileKey,
      { sha256: wanted, size: record.file_size },
      () => sha256OfObject(fileKey),
      async () => {
        await supabase
          .from('files')
          .update({ sha256: wanted, sha256_checked_at: new Date().toISOString() })
          .eq('user_id', storageOwnerId)
          .eq('file_key', fileKey);
      },
    );
    return res.status(200).json(status);
  } catch (error) {
    console.error('Checking a stored file failed:', error);
    return res.status(500).json({ error: 'Could not check the file' });
  }
}

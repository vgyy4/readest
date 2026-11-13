import type { NextApiRequest, NextApiResponse } from 'next';
import { isProfileBookUpload, PROFILE_HEADER } from '@/libs/profiles/shared';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import {
  getStoragePlanData,
  validateUserAndToken,
  STORAGE_QUOTA_GRACE_BYTES,
} from '@/utils/access';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  getUploadPartSignedUrl,
  isSafeObjectKeyName,
  listUploadedParts,
  objectExists,
  supportsMultipart,
} from '@/utils/object';
import { planParts } from '@/libs/multipart';

// A big upload on a slow link can take hours.
const PART_URL_TTL_SECONDS = 6 * 60 * 60;

/**
 * Upload a big file in parts (see libs/multipart.ts). Three steps, all POST:
 *   start:    { action: 'start', fileName, fileSize, bookHash? } -> { uploadId, parts: [{ partNumber, start, size, uploadUrl }] }
 *   complete: { action: 'complete', fileName, uploadId }         -> joins the parts the client sent
 *   abort:    { action: 'abort', fileName, uploadId }            -> throws the parts away
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token, ownerId, isProfile } = await validateUserAndToken(
    req.headers['authorization'],
    req.headers[PROFILE_HEADER],
  );
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  const { action, fileName, fileSize, bookHash, uploadId } = req.body ?? {};
  if (!isSafeObjectKeyName(fileName)) return res.status(400).json({ error: 'Invalid fileName' });
  if (!supportsMultipart()) return res.status(400).json({ error: 'Multipart not supported' });

  // A profile's books are stored once, in the account's storage (see upload.ts).
  const profileBookHash = bookHash ?? /^Readest\/Books\/([0-9a-f]{32})\//i.exec(fileName)?.[1];
  if (isProfile && !isProfileBookUpload(fileName, profileBookHash)) {
    return res.status(403).json({ error: 'A profile can only upload book files' });
  }
  const storageOwnerId = isProfile && ownerId ? ownerId : user.id;
  const fileKey = `${storageOwnerId}/${fileName}`;
  const supabase = createSupabaseAdminClient();

  try {
    if (action === 'start') {
      if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return res.status(400).json({ error: 'Missing file info' });
      }
      const { usage, quota } = getStoragePlanData(token);
      if (usage + fileSize > quota + STORAGE_QUOTA_GRACE_BYTES) {
        return res.status(403).json({ error: 'Insufficient storage quota', usage });
      }
      // The same bookkeeping row a single upload makes: the size is what the file will be.
      const { data: existing, error: fetchError } = await supabase
        .from('files')
        .select('file_size')
        .eq('user_id', storageOwnerId)
        .eq('file_key', fileKey)
        .limit(1)
        .maybeSingle();
      if (fetchError) return res.status(500).json({ error: fetchError.message });
      if (!existing) {
        const { error: insertError } = await supabase.from('files').insert([
          {
            user_id: storageOwnerId,
            book_hash: bookHash ?? null,
            replica_kind: null,
            replica_id: null,
            file_key: fileKey,
            file_size: fileSize,
          },
        ]);
        if (insertError) return res.status(500).json({ error: insertError.message });
      }
      const size = existing?.file_size ?? fileSize;
      const newUploadId = await createMultipartUpload(fileKey);
      const parts = await Promise.all(
        planParts(size).map(async (part) => ({
          ...part,
          uploadUrl: await getUploadPartSignedUrl(
            fileKey,
            newUploadId,
            part.partNumber,
            part.size,
            PART_URL_TTL_SECONDS,
          ),
        })),
      );
      return res.status(200).json({ uploadId: newUploadId, parts });
    }

    if (typeof uploadId !== 'string' || !uploadId) {
      return res.status(400).json({ error: 'Missing uploadId' });
    }

    if (action === 'complete') {
      const { data: record } = await supabase
        .from('files')
        .select('file_size')
        .eq('user_id', storageOwnerId)
        .eq('file_key', fileKey)
        .limit(1)
        .maybeSingle();
      const expected = record ? planParts(record.file_size).length : 0;
      const uploaded = await listUploadedParts(fileKey, uploadId);
      if (!expected || uploaded.length !== expected) {
        return res.status(400).json({ error: 'Not every part has been uploaded' });
      }
      await completeMultipartUpload(fileKey, uploadId, uploaded);
      return res.status(200).json({ done: true });
    }

    if (action === 'abort') {
      await abortMultipartUpload(fileKey, uploadId).catch(() => {});
      // An upload that never finished must not count against the quota (but a file that was
      // already there from an earlier upload keeps its record).
      if (!(await objectExists(fileKey))) {
        await supabase.from('files').delete().eq('user_id', storageOwnerId).eq('file_key', fileKey);
      }
      return res.status(200).json({ aborted: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Multipart upload failed:', error);
    return res.status(500).json({ error: 'Multipart upload failed' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { getBooksInUseByProfiles } from '@/libs/profiles/api';
import { PROFILE_HEADER } from '@/libs/profiles/shared';
import { validateUserAndToken } from '@/utils/access';
import { deleteObject } from '@/utils/object';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token, isProfile } = await validateUserAndToken(
      req.headers['authorization'],
      req.headers[PROFILE_HEADER],
    );
    if (!user || !token || isProfile) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const { fileKey } = req.query;

    if (!fileKey || typeof fileKey !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid fileKey' });
    }

    const supabase = createSupabaseAdminClient();
    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .select('user_id, id, book_hash')
      .eq('user_id', user.id)
      .eq('file_key', fileKey)
      .limit(1)
      .single();

    if (fileError || !fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (fileRecord.user_id !== user.id) {
      return res.status(403).json({ error: 'Unauthorized access to the file' });
    }

    // A book some profile can still see is the account's only copy: keep it.
    if (fileRecord.book_hash) {
      const inUse = await getBooksInUseByProfiles(supabase, user.id, [fileRecord.book_hash]);
      if (inUse.size > 0) {
        return res
          .status(409)
          .json({ error: 'This book is still available to a profile; remove it there first' });
      }
    }

    try {
      await deleteObject(fileKey);
      const { error: deleteError } = await supabase.from('files').delete().eq('id', fileRecord.id);

      if (deleteError) {
        console.error('Error updating file record:', deleteError);
        return res.status(500).json({ error: 'Could not update file record' });
      }

      res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      res.status(500).json({ error: 'Could not delete file from storage' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

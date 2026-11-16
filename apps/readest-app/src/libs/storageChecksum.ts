/**
 * Checking that what the server stored is the file that was sent, by SHA-256.
 *
 * Reading a few gigabytes back takes longer than one request may last (a proxy such as
 * Cloudflare ends one at 100 seconds), so the check is a job: the first request starts it and
 * answers "running"; the app asks again until it has an answer. The answer is kept for a while so
 * a repeated question costs nothing. Jobs live in this process; one that is lost (a restart) is
 * simply started again by the next question.
 */
export const SHA256 = /^[0-9a-f]{64}$/i;

/** A SHA-256 sent by the app, as 64 lowercase hex characters, or null. */
export const parseSha256 = (value: unknown): string | null =>
  typeof value === 'string' && SHA256.test(value) ? value.toLowerCase() : null;

export type ChecksumStatus =
  | { status: 'running' }
  | { status: 'verified' }
  | { status: 'mismatch'; expected: string; actual: string }
  | { status: 'size-mismatch'; expected: number; actual: number }
  | { status: 'missing' }
  /** This storage cannot be read back here (R2): there is nothing to check, which is not a failure. */
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

type Hasher = () => Promise<{ sha256: string; size: number } | null>;

interface Job {
  status: ChecksumStatus;
  finishedAt?: number;
}

const KEEP_RESULT_MS = 10 * 60 * 1000;
const jobs = new Map<string, Job>();

const forget = () => {
  const now = Date.now();
  for (const [key, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > KEEP_RESULT_MS) jobs.delete(key);
  }
};

/** Start checking `fileKey` against `expected` (once), or report how that check is going. */
export const checkStoredFile = (
  fileKey: string,
  expected: { sha256: string; size?: number },
  hash: Hasher,
  onVerified: () => Promise<void> | void,
): ChecksumStatus => {
  forget();
  const id = `${fileKey}|${expected.sha256}`;
  const existing = jobs.get(id);
  if (existing) return existing.status;

  const job: Job = { status: { status: 'running' } };
  jobs.set(id, job);
  void (async () => {
    try {
      const found = await hash();
      if (!found) {
        job.status = { status: 'unsupported' };
      } else if (expected.size !== undefined && found.size !== expected.size) {
        job.status = { status: 'size-mismatch', expected: expected.size, actual: found.size };
      } else if (found.sha256 !== expected.sha256) {
        job.status = { status: 'mismatch', expected: expected.sha256, actual: found.sha256 };
      } else {
        await onVerified();
        job.status = { status: 'verified' };
      }
    } catch (error) {
      const code = (error as { name?: string; Code?: string }).name;
      job.status =
        code === 'NoSuchKey' || code === 'NotFound'
          ? { status: 'missing' }
          : { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
    job.finishedAt = Date.now();
  })();
  return job.status;
};

/** For tests. */
export const forgetAllChecks = () => jobs.clear();

/** The file is about to be sent again: whatever was found before no longer says anything about it. */
export const invalidateChecks = (fileKey: string) => {
  for (const key of jobs.keys()) {
    if (key.startsWith(`${fileKey}|`)) jobs.delete(key);
  }
};

interface FilesTable {
  from: (table: string) => {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => { eq: (column: string, value: string) => PromiseLike<{ error: unknown }> };
    };
  };
}

/**
 * Record the SHA-256 of the file that is about to be sent, and that nobody has checked it yet.
 * Best effort: a server whose database was not updated (no such column) simply goes without, and
 * the upload carries on unchecked.
 */
export const recordExpectedChecksum = async (
  supabase: FilesTable,
  userId: string,
  fileKey: string,
  sha256: string | null,
): Promise<void> => {
  invalidateChecks(fileKey);
  if (!sha256) return;
  try {
    await supabase
      .from('files')
      .update({ sha256, sha256_checked_at: null })
      .eq('user_id', userId)
      .eq('file_key', fileKey);
  } catch (error) {
    console.warn('Could not record the checksum of', fileKey, error);
  }
};

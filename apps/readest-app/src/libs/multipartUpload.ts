import { AdaptiveLimit } from '@/libs/adaptiveLimit';
import { planParts, type PartPlan } from '@/libs/multipart';
import { runInParallel } from '@/libs/parallelDownload';
import type { ProgressPayload } from '@/utils/transfer';

export interface PartInfo extends PartPlan {
  uploadUrl: string;
}

export interface MultipartDeps {
  /** POST to /api/storage/multipart; rejects with the server's error message. */
  request: (body: Record<string, unknown>) => Promise<{ uploadId?: string; parts?: PartInfo[] }>;
  /** Send one part; `onBytes` reports how many of its bytes have gone so far. */
  putPart: (part: PartInfo, onBytes: (loaded: number, speed: number) => void) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  /** More to say to the server when the upload starts (the file's SHA-256). */
  startExtras?: Record<string, unknown>;
  /**
   * Remove the server's record of `fileName`. Used when an older server plans a new upload from
   * the size recorded by an earlier, abandoned attempt: with that record gone it plans from the
   * file being sent.
   */
  discardStale?: (fileName: string) => Promise<void>;
}

/** The server cannot do multipart (e.g. R2 storage): the caller sends the file in one piece. */
export class MultipartUnsupported extends Error {}

const ATTEMPTS = 3;
/** Parts of a file sent at once: where it starts, and the most it may grow to. */
const START_PARTS = 2;
const MAX_PARTS = 6;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What went wrong with an upload, in words the user can act on. */
export const friendlyUploadError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b413\b/.test(message)) {
    return new Error(
      'The server refused this upload as too large (a proxy such as Cloudflare caps one request at 100 MB).',
    );
  }
  if (/SignatureDoesNotMatch/.test(message)) {
    // Storage signs each part with its exact length: a server that planned the parts differently
    // from the app makes every part fail this way. It is not a sign-in or Cloudflare problem.
    return new Error(
      'The storage server rejected the upload (its signature did not match). The server is probably out of date: update it, then try again.',
    );
  }
  if (/\b(401|403)\b/.test(message)) {
    return new Error(
      'The server did not accept the upload. Sign in again; if the server is behind Cloudflare Access, check the service token.',
    );
  }
  if (/\b(524|522|408)\b/.test(message)) {
    return new Error('The upload timed out. Check the connection and try again.');
  }
  return error instanceof Error ? error : new Error(message);
};

const planFits = (parts: PartInfo[] | undefined, fileSize: number) => {
  const wanted = planParts(fileSize);
  return (
    !!parts &&
    parts.length === wanted.length &&
    parts.every(
      (p, i) =>
        p.partNumber === wanted[i]!.partNumber &&
        p.start === wanted[i]!.start &&
        p.size === wanted[i]!.size,
    )
  );
};

/**
 * Upload a big file as several parts, each its own request, so none is larger than a proxy
 * allows. Parts are sent a few at a time (how many is adjusted while they go; each is tried a few
 * times), then the server joins them. A failure throws the partial upload away on the server.
 */
export const uploadInParts = async (
  fileName: string,
  fileSize: number,
  bookHash: string | undefined,
  onProgress: ((progress: ProgressPayload) => void) | undefined,
  { request, putPart, sleep = defaultSleep, discardStale, startExtras }: MultipartDeps,
): Promise<void> => {
  const start = async () => {
    try {
      return await request({ action: 'start', fileName, fileSize, bookHash, ...startExtras });
    } catch (error) {
      if (error instanceof Error && error.message === 'Multipart not supported') {
        throw new MultipartUnsupported();
      }
      throw error;
    }
  };
  let started = await start();
  // An older server plans from a stale record; clear it and start over, once.
  if (started.uploadId && started.parts?.length && !planFits(started.parts, fileSize)) {
    if (discardStale) {
      await request({ action: 'abort', fileName, uploadId: started.uploadId }).catch(() => {});
      await discardStale(fileName).catch(() => {});
      started = await start();
    }
  }
  const { uploadId, parts } = started;
  if (!uploadId) throw new Error('The server did not start the upload');

  try {
    // Everything after the server has started an upload is inside this try: whatever goes wrong,
    // the upload is thrown away, so the server is not left with a record of a file that never came.
    if (!parts?.length) throw new Error('The server did not start the upload');
    // The server plans the parts; check it agrees with what the file needs.
    if (!planFits(parts, fileSize)) {
      throw new Error(
        'The server planned the upload wrongly; it is probably out of date. Update it and try again.',
      );
    }
    // Several parts go at the same time, and how many is adjusted while they go: more while that
    // makes the upload faster, fewer when it slows (a busy link, parts timing out), and fewer
    // at once after a part had to be sent again.
    const limit = new AdaptiveLimit({ min: 1, start: START_PARTS, max: MAX_PARTS });
    const sent = parts.map(() => 0);
    const speeds = parts.map(() => 0);
    const report = () =>
      onProgress?.({
        progress: sent.reduce((a, b) => a + b, 0),
        total: fileSize,
        transferSpeed: speeds.reduce((a, b) => a + b, 0),
      });
    await runInParallel(
      parts.length,
      async (index) => {
        const part = parts[index]!;
        for (let attempt = 1; ; attempt++) {
          try {
            await putPart(part, (loaded, speed) => {
              sent[index] = loaded;
              speeds[index] = speed;
              report();
            });
            break;
          } catch (error) {
            // Too many at once is the usual cause of a part timing out: send fewer.
            limit.failed();
            if (attempt >= ATTEMPTS) throw error;
            sent[index] = 0;
            speeds[index] = 0;
            await sleep(1000 * attempt);
          }
        }
        sent[index] = part.size;
        speeds[index] = 0;
        report();
      },
      { limit, bytes: () => sent.reduce((a, b) => a + b, 0) },
    );
    await request({ action: 'complete', fileName, uploadId });
  } catch (error) {
    await request({ action: 'abort', fileName, uploadId }).catch(() => {});
    throw friendlyUploadError(error);
  }
};

/**
 * Run one single-request upload; if storage refuses its signature (403), the server signed it for
 * a size recorded by an earlier, abandoned attempt (an older server does that). Clear that record
 * and send once more, so the retry is signed for this file.
 */
export const retryAfterStaleRecord = async <T>(
  attempt: () => Promise<T>,
  discard: () => Promise<void>,
): Promise<T> => {
  try {
    return await attempt();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/SignatureDoesNotMatch|\b403\b/.test(message)) throw error;
    await discard().catch(() => {});
    return attempt();
  }
};

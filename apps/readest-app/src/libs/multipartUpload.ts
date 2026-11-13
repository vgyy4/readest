import { planParts, type PartPlan } from '@/libs/multipart';
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
}

/** The server cannot do multipart (e.g. R2 storage): the caller sends the file in one piece. */
export class MultipartUnsupported extends Error {}

const ATTEMPTS = 3;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What went wrong with an upload, in words the user can act on. */
export const friendlyUploadError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b413\b/.test(message)) {
    return new Error(
      'The server refused this upload as too large (a proxy such as Cloudflare caps one request at 100 MB).',
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

/**
 * Upload a big file as several parts, each its own request, so none is larger than a proxy
 * allows. Parts are sent one after another (retrying each a few times), then the server joins
 * them. A failure throws the partial upload away on the server.
 */
export const uploadInParts = async (
  fileName: string,
  fileSize: number,
  bookHash: string | undefined,
  onProgress: ((progress: ProgressPayload) => void) | undefined,
  { request, putPart, sleep = defaultSleep }: MultipartDeps,
): Promise<void> => {
  let started: { uploadId?: string; parts?: PartInfo[] };
  try {
    started = await request({ action: 'start', fileName, fileSize, bookHash });
  } catch (error) {
    if (error instanceof Error && error.message === 'Multipart not supported') {
      throw new MultipartUnsupported();
    }
    throw error;
  }
  const { uploadId, parts } = started;
  if (!uploadId || !parts?.length) throw new Error('The server did not start the upload');
  // The server plans the parts; check it agrees with what the file needs.
  if (parts.length !== planParts(fileSize).length)
    throw new Error('The server planned the upload wrongly');

  let sentBefore = 0;
  try {
    for (const part of parts) {
      for (let attempt = 1; ; attempt++) {
        try {
          await putPart(part, (loaded, speed) =>
            onProgress?.({ progress: sentBefore + loaded, total: fileSize, transferSpeed: speed }),
          );
          break;
        } catch (error) {
          if (attempt >= ATTEMPTS) throw error;
          await sleep(1000 * attempt);
        }
      }
      sentBefore += part.size;
      onProgress?.({ progress: sentBefore, total: fileSize, transferSpeed: 0 });
    }
    await request({ action: 'complete', fileName, uploadId });
  } catch (error) {
    await request({ action: 'abort', fileName, uploadId }).catch(() => {});
    throw friendlyUploadError(error);
  }
};

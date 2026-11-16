import { getAPIBaseUrl, isWebAppPlatform } from '@/services/environment';
import { AppService } from '@/types/system';
import { getUserID } from '@/utils/access';
import { fetchWithAuth } from '@/utils/fetch';
import { needsMultipart } from '@/libs/multipart';
import { friendlyDownloadError, isRetryableDownloadError } from '@/libs/downloadError';
import {
  friendlyUploadError,
  MultipartUnsupported,
  retryAfterStaleRecord,
  uploadInParts,
} from '@/libs/multipartUpload';
import { sameSha256, sha256OfBlob, sha256OfPath } from '@/utils/fileHash';
import {
  tauriUpload,
  tauriDownload,
  webUpload,
  webDownload,
  ProgressHandler,
  ProgressPayload,
} from '@/utils/transfer';

const API_ENDPOINTS = {
  upload: getAPIBaseUrl() + '/storage/upload',
  download: getAPIBaseUrl() + '/storage/download',
  delete: getAPIBaseUrl() + '/storage/delete',
  stats: getAPIBaseUrl() + '/storage/stats',
  list: getAPIBaseUrl() + '/storage/list',
  purge: getAPIBaseUrl() + '/storage/purge',
  multipart: getAPIBaseUrl() + '/storage/multipart',
  checksum: getAPIBaseUrl() + '/storage/checksum',
};

export const createProgressHandler = (
  totalFiles: number,
  completedFilesRef: { count: number },
  onProgress?: ProgressHandler,
) => {
  return (progress: ProgressPayload) => {
    const fileProgress = progress.progress / progress.total;
    const overallProgress = ((completedFilesRef.count + fileProgress) / totalFiles) * 100;

    if (onProgress) {
      onProgress({
        progress: overallProgress,
        total: 100,
        transferSpeed: progress.transferSpeed,
      });
    }
  };
};

/** SHA-256 of the file about to be sent; null when it cannot be worked out (the upload goes unchecked). */
const localSha256 = async (file: File, fileFullPath: string): Promise<string | null> => {
  try {
    return isWebAppPlatform() ? await sha256OfBlob(file) : await sha256OfPath(fileFullPath);
  } catch (error) {
    console.warn('Could not work out the checksum of', file.name, error);
    return null;
  }
};

const CHECKSUM_POLL_MS = 2000;
const CHECKSUM_GIVE_UP_MS = 30 * 60 * 1000;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * After an upload: ask the server to read the stored file back and compare its SHA-256 with the
 * file's. A copy that differs is thrown away and the upload fails (it is sent again). A server
 * that cannot check (an older one, R2 storage, a database not updated) lets it pass: the upload is
 * as it was before checking existed.
 */
export const confirmStoredCopy = async (fileName: string, sha256: string | null) => {
  if (!sha256) return;
  const started = Date.now();
  while (Date.now() - started < CHECKSUM_GIVE_UP_MS) {
    let answer: { status?: string };
    try {
      const response = await fetchWithAuth(API_ENDPOINTS.checksum, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, sha256 }),
      });
      answer = await response.json();
    } catch (error) {
      console.warn('The server could not check the stored file:', error);
      return;
    }
    switch (answer.status) {
      case 'running':
        await wait(CHECKSUM_POLL_MS);
        continue;
      case 'mismatch':
      case 'size-mismatch':
        await deleteFile(fileName).catch(() => {});
        throw new Error(
          'The copy stored on the server does not match the file that was sent (SHA-256). It was removed and will be sent again.',
        );
      default:
        // verified, or nothing to check against.
        return;
    }
  }
};

export const uploadFile = async (
  file: File,
  fileFullPath: string,
  onProgress?: ProgressHandler,
  bookHash?: string,
  temp = false,
  media?: string,
) => {
  try {
    // The file's SHA-256 goes to the server with the upload, so what is stored can be checked.
    const sha256 = temp || media ? null : await localSha256(file, fileFullPath);
    // A big file (an audiobook) goes up in parts: behind Cloudflare one request may not
    // exceed 100 MB. A server that cannot do that gets the file in one piece as before.
    if (!temp && !media && needsMultipart(file.size)) {
      try {
        await uploadInParts(file.name, file.size, bookHash, onProgress, {
          startExtras: sha256 ? { sha256 } : undefined,
          // An older server plans from a record an abandoned attempt left behind; clearing it
          // lets the retry plan from this file.
          discardStale: (name) => deleteFile(name),
          request: async (body) =>
            (
              await fetchWithAuth(API_ENDPOINTS.multipart, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              })
            ).json(),
          putPart: async (part, onBytes) => {
            const handler = (p: ProgressPayload) => onBytes(p.progress, p.transferSpeed);
            if (isWebAppPlatform()) {
              await webUpload(
                file.slice(part.start, part.start + part.size),
                part.uploadUrl,
                handler,
              );
            } else {
              await tauriUpload(
                part.uploadUrl,
                fileFullPath,
                'PUT',
                handler,
                undefined,
                part.start,
                part.size,
              );
            }
          },
        });
        await confirmStoredCopy(file.name, sha256);
        return undefined;
      } catch (error) {
        if (!(error instanceof MultipartUnsupported)) throw error;
      }
    }

    const sendInOneRequest = async () => {
      const response = await fetchWithAuth(API_ENDPOINTS.upload, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          bookHash,
          temp,
          media,
          sha256: sha256 ?? undefined,
        }),
      });

      const { uploadUrl, downloadUrl }: { uploadUrl: string; downloadUrl?: string } =
        await response.json();
      if (isWebAppPlatform()) {
        await webUpload(file, uploadUrl, onProgress);
      } else {
        await tauriUpload(uploadUrl, fileFullPath, 'PUT', onProgress);
      }
      return downloadUrl;
    };
    // A temporary or media file has no record to go stale; a book's files do.
    const downloadUrl =
      temp || media
        ? await sendInOneRequest()
        : await retryAfterStaleRecord(sendInOneRequest, () => deleteFile(file.name));
    if (!temp && !media) await confirmStoredCopy(file.name, sha256);
    return temp || media ? downloadUrl : undefined;
  } catch (error) {
    console.error('File upload failed:', error);
    throw friendlyUploadError(error);
  }
};

// Replica file upload. Reuses the books-style signed-URL path so 1+ GB
// dictionaries bypass the CF Workers body limit (per plan-eng-review §1).
// `cfp` is the cloud file path (key under the user's prefix); it must
// already contain the kind + replica-id prefix from CLOUD_REPLICAS_SUBDIR.
// Filenames are server-validated (see src/libs/replicaSchemas.ts:validateFilename).
export const uploadReplicaFile = async (
  file: File,
  fileFullPath: string,
  cfp: string,
  replicaKind: string,
  replicaId: string,
  onProgress?: ProgressHandler,
) => {
  try {
    const response = await fetchWithAuth(API_ENDPOINTS.upload, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: cfp,
        fileSize: file.size,
        replicaKind,
        replicaId,
        temp: false,
      }),
    });

    const { uploadUrl }: { uploadUrl: string } = await response.json();
    if (isWebAppPlatform()) {
      await webUpload(file, uploadUrl, onProgress);
    } else {
      await tauriUpload(uploadUrl, fileFullPath, 'PUT', onProgress);
    }
  } catch (error) {
    console.error('Replica file upload failed:', error);
    if (error instanceof Error) throw error;
    throw new Error('Replica file upload failed');
  }
};

export const batchGetDownloadUrls = async (files: { lfp: string; cfp: string }[]) => {
  try {
    const userId = await getUserID();
    if (!userId) {
      throw new Error('Not authenticated');
    }
    const filePaths = files.map((file) => file.cfp);
    const fileKeys = filePaths.map((path) => `${userId}/${path}`);
    const response = await fetchWithAuth(`${API_ENDPOINTS.download}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileKeys }),
    });

    const { downloadUrls } = await response.json();
    return files.map((file) => {
      const fileKey = `${userId}/${file.cfp}`;
      return {
        lfp: file.lfp,
        cfp: file.cfp,
        downloadUrl: downloadUrls[fileKey],
      };
    });
  } catch (error) {
    console.error('Batch get download URLs failed:', error);
    throw new Error('Batch get download URLs failed');
  }
};

const DOWNLOAD_MISMATCH =
  'The downloaded file does not match the one that was uploaded (SHA-256). It was removed; try again.';

/** Is the file on disk the one with this SHA-256? Where it cannot be worked out, take it as intact. */
const arrivedIntact = async (path: string, expected: string): Promise<boolean> => {
  try {
    return sameSha256(await sha256OfPath(path), expected);
  } catch (error) {
    console.warn('Could not check the downloaded file:', error);
    return true;
  }
};

const removeQuietly = async (appService: AppService, path: string) => {
  try {
    await appService.deleteFile(path, 'None');
  } catch {
    // Already gone, or not ours to remove: the failure that follows is what matters.
  }
};

type DownloadFileParams = {
  appService: AppService;
  dst: string;
  cfp: string;
  url?: string;
  /** What the file's SHA-256 should be; asked of the server when the address is too. */
  sha256?: string;
  headers?: Record<string, string>;
  singleThreaded?: boolean;
  skipSslVerification?: boolean;
  onProgress?: ProgressHandler;
};

export const downloadFile = async ({
  appService,
  dst,
  cfp,
  url,
  sha256,
  headers,
  singleThreaded,
  skipSslVerification,
  onProgress,
}: DownloadFileParams) => {
  try {
    let downloadUrl = url;
    let expected = sha256;
    if (!downloadUrl) {
      const userId = await getUserID();
      if (!userId) {
        throw new Error('Not authenticated');
      }
      const fileKey = `${userId}/${cfp}`;
      const response = await fetchWithAuth(
        `${API_ENDPOINTS.download}?fileKey=${encodeURIComponent(fileKey)}`,
        {
          method: 'GET',
        },
      );

      const { downloadUrl: url, sha256: recorded } = await response.json();
      downloadUrl = url;
      expected = expected ?? recorded ?? undefined;
    }

    if (!downloadUrl) {
      throw new Error('No download URL available');
    }

    if (isWebAppPlatform()) {
      const { headers: responseHeaders, blob } = await webDownload(
        downloadUrl,
        onProgress,
        headers,
      );
      if (expected) {
        const actual = await sha256OfBlob(blob);
        if (actual && !sameSha256(actual, expected)) throw new Error(DOWNLOAD_MISMATCH);
      }
      await appService.writeFile(dst, 'None', await blob.arrayBuffer());
      return responseHeaders;
    } else {
      let singleConnection = !!singleThreaded;
      let responseHeaders: Record<string, string>;
      try {
        responseHeaders = await tauriDownload(
          downloadUrl,
          dst,
          onProgress,
          headers,
          undefined,
          singleThreaded,
          skipSslVerification,
        );
      } catch (error) {
        if (singleThreaded || !isRetryableDownloadError(error)) throw error;
        // Several connections at once can fail where one does not (a proxy, a flaky link).
        console.warn(`File '${dst}': trying again with a single connection:`, error);
        singleConnection = true;
        responseHeaders = await tauriDownload(
          downloadUrl,
          dst,
          onProgress,
          headers,
          undefined,
          true,
          skipSslVerification,
        );
      }
      // What arrived must be what was uploaded. A mismatch after many connections is tried once
      // more with one (parts put together wrongly are the usual cause); after that the file is
      // removed and the download fails, rather than leave a book that will not open.
      if (expected && !(await arrivedIntact(dst, expected))) {
        if (!singleConnection) {
          console.warn(`File '${dst}' did not match its SHA-256: downloading it again.`);
          await removeQuietly(appService, dst);
          responseHeaders = await tauriDownload(
            downloadUrl,
            dst,
            onProgress,
            headers,
            undefined,
            true,
            skipSslVerification,
          );
        }
        if (singleConnection || !(await arrivedIntact(dst, expected))) {
          await removeQuietly(appService, dst);
          throw new Error(DOWNLOAD_MISMATCH);
        }
      }
      return responseHeaders;
    }
  } catch (error) {
    console.error(`File '${dst}' download failed:`, error);
    throw friendlyDownloadError(error);
  }
};

export const deleteFile = async (filePath: string) => {
  try {
    const userId = await getUserID();
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const fileKey = `${userId}/${filePath}`;
    await fetchWithAuth(`${API_ENDPOINTS.delete}?fileKey=${encodeURIComponent(fileKey)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    // Best-effort cloud cleanup: removing the remote copy is non-critical and
    // callers dispatch this without awaiting, so throwing here surfaces as an
    // unhandled promise rejection (Sentry READEST-5). Log and swallow instead.
    console.warn('File deletion failed:', error);
  }
};

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  usage: number;
  quota: number;
  usagePercentage: number;
  byBookHash: Array<{
    bookHash: string | null;
    fileCount: number;
    totalSize: number;
  }>;
}

export const getStorageStats = async (): Promise<StorageStats> => {
  try {
    const response = await fetchWithAuth(API_ENDPOINTS.stats, {
      method: 'GET',
    });

    return await response.json();
  } catch (error) {
    console.error('Get storage stats failed:', error);
    throw new Error('Get storage stats failed');
  }
};

export interface FileRecord {
  file_key: string;
  file_size: number;
  book_hash: string | null;
  replica_kind: string | null;
  replica_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ListFilesParams {
  page?: number;
  pageSize?: number;
  sortBy?: 'created_at' | 'updated_at' | 'file_size' | 'file_key';
  sortOrder?: 'asc' | 'desc';
  bookHash?: string;
  search?: string;
}

interface ListFilesResponse {
  files: FileRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const listFiles = async (params?: ListFilesParams): Promise<ListFilesResponse> => {
  try {
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.sortBy) queryParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.set('sortOrder', params.sortOrder);
    if (params?.bookHash) queryParams.set('bookHash', params.bookHash);
    if (params?.search) queryParams.set('search', params.search);

    const url = queryParams.toString()
      ? `${API_ENDPOINTS.list}?${queryParams.toString()}`
      : API_ENDPOINTS.list;

    const response = await fetchWithAuth(url, {
      method: 'GET',
    });

    return await response.json();
  } catch (error) {
    console.error('List files failed:', error);
    throw new Error('List files failed');
  }
};

interface PurgeFilesResult {
  success: string[];
  failed: Array<{ fileKey: string; error: string }>;
  deletedCount: number;
  failedCount: number;
}

export const purgeFiles = async (
  filePathsOrKeys: string[],
  isFileKeys = false,
): Promise<PurgeFilesResult> => {
  try {
    let fileKeys: string[];

    if (isFileKeys) {
      fileKeys = filePathsOrKeys;
    } else {
      const userId = await getUserID();
      if (!userId) {
        throw new Error('Not authenticated');
      }
      fileKeys = filePathsOrKeys.map((path) => `${userId}/${path}`);
    }

    const response = await fetchWithAuth(API_ENDPOINTS.purge, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileKeys }),
    });

    return await response.json();
  } catch (error) {
    console.error('Purge files failed:', error);
    throw new Error('Purge files failed');
  }
};

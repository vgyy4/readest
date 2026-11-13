/**
 * Big files go up in pieces. Behind Cloudflare a single request is capped at 100 MB (Free
 * plan), so an audiobook cannot be one PUT; S3 multipart upload sends it as several parts,
 * each well under the cap, and the server joins them.
 */
export const MULTIPART_THRESHOLD = 80 * 1024 * 1024;
export const PART_SIZE = 50 * 1024 * 1024;
/** S3 allows 10,000 parts; the part size grows for a file that would need more. */
export const MAX_PARTS = 10_000;

export interface PartPlan {
  /** 1-based, as S3 numbers them. */
  partNumber: number;
  /** First byte of the part within the file. */
  start: number;
  size: number;
}

export const needsMultipart = (fileSize: number) => fileSize > MULTIPART_THRESHOLD;

export const planParts = (fileSize: number, partSize = PART_SIZE): PartPlan[] => {
  if (fileSize <= 0) return [];
  const size = Math.max(partSize, Math.ceil(fileSize / MAX_PARTS));
  const parts: PartPlan[] = [];
  for (let start = 0, n = 1; start < fileSize; start += size, n++) {
    parts.push({ partNumber: n, start, size: Math.min(size, fileSize - start) });
  }
  return parts;
};

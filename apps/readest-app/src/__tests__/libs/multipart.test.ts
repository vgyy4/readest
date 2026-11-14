import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PARTS,
  MULTIPART_THRESHOLD,
  needsMultipart,
  PART_SIZE,
  planParts,
} from '@/libs/multipart';
import {
  friendlyUploadError,
  MultipartUnsupported,
  uploadInParts,
  type PartInfo,
} from '@/libs/multipartUpload';

describe('planParts', () => {
  it('cuts a file into parts that cover every byte once', () => {
    const size = PART_SIZE * 2 + 123;
    const parts = planParts(size);
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    expect(parts.map((p) => p.size)).toEqual([PART_SIZE, PART_SIZE, 123]);
    expect(parts[0]!.start).toBe(0);
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i]!.start).toBe(parts[i - 1]!.start + parts[i - 1]!.size);
    }
    expect(parts.reduce((sum, p) => sum + p.size, 0)).toBe(size);
  });

  it('keeps every part but the last big enough for S3 (5 MB) and under the Cloudflare cap', () => {
    expect(PART_SIZE).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(PART_SIZE).toBeLessThan(100 * 1024 * 1024);
    expect(MULTIPART_THRESHOLD).toBeLessThan(100 * 1024 * 1024);
  });

  it('grows the part size for a huge file instead of exceeding the part limit', () => {
    const huge = PART_SIZE * (MAX_PARTS + 50);
    expect(planParts(huge).length).toBeLessThanOrEqual(MAX_PARTS);
  });

  it('is empty for an empty file, and one part for a small one', () => {
    expect(planParts(0)).toEqual([]);
    expect(planParts(10)).toEqual([{ partNumber: 1, start: 0, size: 10 }]);
  });

  it('only big files use parts', () => {
    expect(needsMultipart(MULTIPART_THRESHOLD)).toBe(false);
    expect(needsMultipart(MULTIPART_THRESHOLD + 1)).toBe(true);
  });
});

describe('uploadInParts', () => {
  const size = PART_SIZE * 2 + 5;
  const parts: PartInfo[] = planParts(size).map((p) => ({
    ...p,
    uploadUrl: `https://s/p${p.partNumber}`,
  }));
  const noSleep = async () => {};

  it('starts, sends every part in order, then completes, reporting progress', async () => {
    const request = vi.fn(async (body: Record<string, unknown>) =>
      body['action'] === 'start' ? { uploadId: 'u1', parts } : {},
    );
    const sent: number[] = [];
    const progress: number[] = [];
    await uploadInParts('h/book.m4b', size, 'h', (p) => progress.push(p.progress), {
      request,
      sleep: noSleep,
      putPart: async (part, onBytes) => {
        sent.push(part.partNumber);
        onBytes(part.size / 2, 100);
      },
    });
    expect(sent).toEqual([1, 2, 3]);
    expect(request.mock.calls.map((c) => c[0]['action'])).toEqual(['start', 'complete']);
    expect(request.mock.calls[0]![0]).toMatchObject({
      fileName: 'h/book.m4b',
      fileSize: size,
      bookHash: 'h',
    });
    expect(progress.at(-1)).toBe(size);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it('retries a part that fails, and carries on', async () => {
    const request = vi.fn(async (body: Record<string, unknown>) =>
      body['action'] === 'start' ? { uploadId: 'u1', parts } : {},
    );
    let calls = 0;
    await uploadInParts('f', size, undefined, undefined, {
      request,
      sleep: noSleep,
      putPart: async (part) => {
        calls++;
        if (part.partNumber === 2 && calls === 2) throw new Error('network');
      },
    });
    expect(calls).toBe(4);
    expect(request.mock.calls.at(-1)![0]['action']).toBe('complete');
  });

  it('throws the upload away on the server when a part keeps failing', async () => {
    const request = vi.fn(async (body: Record<string, unknown>) =>
      body['action'] === 'start' ? { uploadId: 'u1', parts } : {},
    );
    await expect(
      uploadInParts('f', size, undefined, undefined, {
        request,
        sleep: noSleep,
        putPart: async () => {
          throw new Error('Upload failed with status 413');
        },
      }),
    ).rejects.toThrow(/too large/);
    expect(request.mock.calls.at(-1)![0]['action']).toBe('abort');
  });

  it('tells the caller when the server cannot do parts, so it sends one piece', async () => {
    const request = vi.fn(async () => {
      throw new Error('Multipart not supported');
    });
    await expect(
      uploadInParts('f', size, undefined, undefined, { request, putPart: async () => {} }),
    ).rejects.toBeInstanceOf(MultipartUnsupported);
  });

  it('rejects a plan from the server that does not match the file, and throws the upload away', async () => {
    const request = vi.fn(async (body: Record<string, unknown>) =>
      body['action'] === 'start' ? { uploadId: 'u', parts: [parts[0]!] } : {},
    );
    await expect(
      uploadInParts('f', size, undefined, undefined, { request, putPart: async () => {} }),
    ).rejects.toThrow(/planned/);
    // Without this the server keeps a record of a file that never arrives.
    expect(request.mock.calls.at(-1)![0]).toMatchObject({ action: 'abort', uploadId: 'u' });
  });

  it('throws the upload away when the server starts one it cannot describe', async () => {
    const request = vi.fn(async (body: Record<string, unknown>) =>
      body['action'] === 'start' ? { uploadId: 'u', parts: [] } : {},
    );
    await expect(
      uploadInParts('f', size, undefined, undefined, { request, putPart: async () => {} }),
    ).rejects.toThrow(/did not start/);
    expect(request.mock.calls.at(-1)![0]).toMatchObject({ action: 'abort', uploadId: 'u' });
  });

  it('cannot abort an upload the server never gave an id for', async () => {
    const request = vi.fn(async () => ({}));
    await expect(
      uploadInParts('f', size, undefined, undefined, { request, putPart: async () => {} }),
    ).rejects.toThrow(/did not start/);
    expect(request).toHaveBeenCalledTimes(1); // only the start
  });
});

describe('friendlyUploadError', () => {
  it('explains the Cloudflare size limit, access errors and timeouts', () => {
    expect(friendlyUploadError(new Error('Upload failed with status 413')).message).toMatch(
      /too large/,
    );
    expect(
      friendlyUploadError(new Error('request failed with status code 413: x')).message,
    ).toMatch(/100 MB/);
    expect(friendlyUploadError(new Error('Upload failed with status 403')).message).toMatch(
      /Cloudflare Access/,
    );
    expect(friendlyUploadError(new Error('Upload failed with status 524')).message).toMatch(
      /timed out/,
    );
  });

  it('keeps any other message', () => {
    expect(friendlyUploadError(new Error('Insufficient storage quota')).message).toBe(
      'Insufficient storage quota',
    );
    expect(friendlyUploadError('plain').message).toBe('plain');
  });
});

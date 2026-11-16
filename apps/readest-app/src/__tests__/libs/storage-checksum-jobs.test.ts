import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkStoredFile,
  forgetAllChecks,
  invalidateChecks,
  parseSha256,
} from '@/libs/storageChecksum';

const GOOD = 'f'.repeat(64);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => forgetAllChecks());

describe('checking a stored file in the background', () => {
  it('runs once however often it is asked, and keeps the answer', async () => {
    const hasher = vi.fn(async () => ({ sha256: GOOD, size: 5 }));
    const onVerified = vi.fn();
    expect(checkStoredFile('k', { sha256: GOOD, size: 5 }, hasher, onVerified)).toEqual({
      status: 'running',
    });
    expect(checkStoredFile('k', { sha256: GOOD, size: 5 }, hasher, onVerified)).toEqual({
      status: 'running',
    });
    await settle();
    expect(checkStoredFile('k', { sha256: GOOD, size: 5 }, hasher, onVerified)).toEqual({
      status: 'verified',
    });
    expect(hasher).toHaveBeenCalledTimes(1);
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('forgets what it found when the file is sent again', async () => {
    const bad = vi.fn(async () => ({ sha256: 'a'.repeat(64), size: 5 }));
    checkStoredFile('k', { sha256: GOOD }, bad, vi.fn());
    await settle();
    expect(checkStoredFile('k', { sha256: GOOD }, bad, vi.fn()).status).toBe('mismatch');
    invalidateChecks('k');
    const good = vi.fn(async () => ({ sha256: GOOD, size: 5 }));
    expect(checkStoredFile('k', { sha256: GOOD }, good, vi.fn()).status).toBe('running');
    await settle();
    expect(checkStoredFile('k', { sha256: GOOD }, good, vi.fn()).status).toBe('verified');
  });

  it('reads a SHA-256 only when it is one', () => {
    expect(parseSha256(GOOD.toUpperCase())).toBe(GOOD);
    expect(parseSha256('abc')).toBeNull();
    expect(parseSha256(undefined)).toBeNull();
  });
});

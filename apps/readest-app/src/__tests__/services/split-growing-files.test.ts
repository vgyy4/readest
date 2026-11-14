import { describe, expect, test } from 'vitest';
import { settleScannedFiles } from '@/services/bookService';

const entry = (fullPath: string, size: number) => ({ fullPath, size });

describe('settleScannedFiles', () => {
  test('a file seen for the first time is not ready: it may still be being copied', () => {
    const seen = new Map<string, number>();
    const { ready, growing } = settleScannedFiles([entry('/b/a.m4b', 500)], seen);
    expect(ready).toEqual([]);
    expect(growing.map((e) => e.fullPath)).toEqual(['/b/a.m4b']);
    expect(seen.get('/b/a.m4b')).toBe(500);
  });

  test('a file with the same size as last time is ready', () => {
    const seen = new Map([['/b/a.m4b', 500]]);
    const { ready, growing } = settleScannedFiles([entry('/b/a.m4b', 500)], seen);
    expect(ready.map((e) => e.fullPath)).toEqual(['/b/a.m4b']);
    expect(growing).toEqual([]);
  });

  test('a file that grew since last time waits, and its new size is remembered', () => {
    const seen = new Map([['/b/a.m4b', 500]]);
    const { ready, growing } = settleScannedFiles([entry('/b/a.m4b', 900)], seen);
    expect(ready).toEqual([]);
    expect(growing).toHaveLength(1);
    expect(seen.get('/b/a.m4b')).toBe(900);
  });

  test('ready files are forgotten, so a later change to the same name is treated as new', () => {
    const seen = new Map([['/b/a.m4b', 500]]);
    settleScannedFiles([entry('/b/a.m4b', 500)], seen);
    expect(seen.has('/b/a.m4b')).toBe(false);
  });

  test('handles a mix', () => {
    const seen = new Map([
      ['/b/done.epub', 10],
      ['/b/busy.m4b', 100],
    ]);
    const { ready, growing } = settleScannedFiles(
      [entry('/b/done.epub', 10), entry('/b/busy.m4b', 200), entry('/b/new.mp3', 5)],
      seen,
    );
    expect(ready.map((e) => e.fullPath)).toEqual(['/b/done.epub']);
    expect(growing.map((e) => e.fullPath)).toEqual(['/b/busy.m4b', '/b/new.mp3']);
  });
});

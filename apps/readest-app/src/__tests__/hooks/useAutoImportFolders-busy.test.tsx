import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isDesktopApp: false } }),
}));

const watch = vi.hoisted(() => ({ onChange: null as null | (() => void) }));
vi.mock('@/services/folderWatch', () => ({
  FALLBACK_SCAN_INTERVAL_MS: 30 * 60 * 1000,
  startFolderWatch: async (_paths: string[], onChange: () => void) => {
    watch.onChange = onChange;
    return () => {};
  },
}));

import { useAutoImportFolders } from '@/app/library/hooks/useAutoImportFolders';

const DEBOUNCE_MS = 800;
const RECHECK_MS = 8000;

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  watch.onChange = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAutoImportFolders while a scan is running', () => {
  test('a change reported during a scan is looked at once that scan is done, not lost', async () => {
    let finish: () => void = () => {};
    const scan = vi.fn(
      () =>
        new Promise<void>((res) => {
          finish = res;
        }),
    );
    renderHook(() => useAutoImportFolders({ enabled: true, folders: ['/a'], scanAndImport: scan }));
    await advance(DEBOUNCE_MS); // first scan starts and stays running
    expect(scan).toHaveBeenCalledTimes(1);

    watch.onChange?.(); // a file lands in the folder meanwhile
    await advance(DEBOUNCE_MS);
    expect(scan).toHaveBeenCalledTimes(1); // never two scans at once

    finish();
    await advance(DEBOUNCE_MS);
    expect(scan).toHaveBeenCalledTimes(2);
  });
});

describe('useAutoImportFolders with files still being copied', () => {
  test('looks again soon while the scan says some file is still growing, then stops', async () => {
    const scan = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true) // a file is still being written
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false); // settled
    renderHook(() => useAutoImportFolders({ enabled: true, folders: ['/a'], scanAndImport: scan }));
    await advance(DEBOUNCE_MS);
    expect(scan).toHaveBeenCalledTimes(1);
    await advance(RECHECK_MS + DEBOUNCE_MS);
    expect(scan).toHaveBeenCalledTimes(2);
    await advance(RECHECK_MS + DEBOUNCE_MS);
    expect(scan).toHaveBeenCalledTimes(3);
    await advance(RECHECK_MS * 5);
    expect(scan).toHaveBeenCalledTimes(3);
  });
});

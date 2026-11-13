import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isDesktopApp: false } }),
}));

const watch = vi.hoisted(() => ({
  start: vi.fn(),
  onChange: null as null | (() => void),
  stop: vi.fn(),
}));
vi.mock('@/services/folderWatch', () => ({
  FALLBACK_SCAN_INTERVAL_MS: 30 * 60 * 1000,
  startFolderWatch: (paths: string[], onChange: () => void) => watch.start(paths, onChange),
}));

import { useAutoImportFolders } from '@/app/library/hooks/useAutoImportFolders';

const DEBOUNCE_MS = 800;
const FALLBACK_MS = 30 * 60 * 1000;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  watch.onChange = null;
  watch.stop.mockReset();
  watch.start.mockReset();
  watch.start.mockImplementation(async (_paths: string[], onChange: () => void) => {
    watch.onChange = onChange;
    return watch.stop;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAutoImportFolders with change notifications', () => {
  test('asks the system to watch the folders, and scans when told something changed', async () => {
    const scan = vi.fn(async () => {});
    renderHook(() =>
      useAutoImportFolders({ enabled: true, folders: ['/a', '/b'], scanAndImport: scan }),
    );
    await flush();
    expect(watch.start).toHaveBeenCalledWith(['/a', '/b'], expect.any(Function));
    await advance(DEBOUNCE_MS); // the scan at start
    scan.mockClear();

    watch.onChange?.();
    await advance(DEBOUNCE_MS);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  test('does not look again by itself while the system is doing the watching', async () => {
    const scan = vi.fn(async () => {});
    renderHook(() => useAutoImportFolders({ enabled: true, folders: ['/a'], scanAndImport: scan }));
    await flush();
    await advance(DEBOUNCE_MS);
    scan.mockClear();
    await advance(FALLBACK_MS * 3);
    expect(scan).not.toHaveBeenCalled();
  });

  test('stops watching when the hook goes away, and restarts for a new folder list', async () => {
    const scan = vi.fn(async () => {});
    const { rerender, unmount } = renderHook(
      ({ folders }) => useAutoImportFolders({ enabled: true, folders, scanAndImport: scan }),
      { initialProps: { folders: ['/a'] } },
    );
    await flush();
    rerender({ folders: ['/a', '/c'] });
    await flush();
    expect(watch.stop).toHaveBeenCalledTimes(1);
    expect(watch.start).toHaveBeenLastCalledWith(['/a', '/c'], expect.any(Function));
    unmount();
    expect(watch.stop).toHaveBeenCalledTimes(2);
  });

  test('where the system gives no notifications, looks every half hour instead', async () => {
    watch.start.mockResolvedValue(null);
    const scan = vi.fn(async () => {});
    renderHook(() => useAutoImportFolders({ enabled: true, folders: ['/a'], scanAndImport: scan }));
    await flush();
    await advance(DEBOUNCE_MS);
    scan.mockClear();
    await advance(FALLBACK_MS - 1000);
    expect(scan).not.toHaveBeenCalled();
    await advance(1000 + DEBOUNCE_MS);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  test('watches nothing while disabled or with no folders', async () => {
    const scan = vi.fn(async () => {});
    renderHook(() =>
      useAutoImportFolders({ enabled: false, folders: ['/a'], scanAndImport: scan }),
    );
    renderHook(() => useAutoImportFolders({ enabled: true, folders: [], scanAndImport: scan }));
    await flush();
    expect(watch.start).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampConcurrent,
  DEFAULT_CONCURRENT_TRANSFERS,
  MAX_CONCURRENT_TRANSFERS,
  useTransferStore,
} from '@/store/transferStore';

beforeEach(() => {
  localStorage.clear();
  useTransferStore.setState({ maxConcurrent: DEFAULT_CONCURRENT_TRANSFERS });
});

describe('how many transfers run at once', () => {
  it('is three by default, so a few downloads go together', () => {
    expect(DEFAULT_CONCURRENT_TRANSFERS).toBe(3);
  });

  it('can be set from 1 to 6, and is kept on the device', () => {
    useTransferStore.getState().setMaxConcurrent(5);
    expect(useTransferStore.getState().maxConcurrent).toBe(5);
    expect(localStorage.getItem('readest-max-concurrent-transfers')).toBe('5');
  });

  it('stays within its limits and ignores nonsense', () => {
    expect(clampConcurrent(0)).toBe(1);
    expect(clampConcurrent(99)).toBe(MAX_CONCURRENT_TRANSFERS);
    expect(clampConcurrent(2.6)).toBe(3);
    expect(clampConcurrent(Number.NaN)).toBe(DEFAULT_CONCURRENT_TRANSFERS);
    useTransferStore.getState().setMaxConcurrent(-4);
    expect(useTransferStore.getState().maxConcurrent).toBe(1);
  });

  it('is read back when the app starts', async () => {
    localStorage.setItem('readest-max-concurrent-transfers', '4');
    const { vi } = await import('vitest');
    vi.resetModules();
    const fresh = await import('@/store/transferStore');
    expect(fresh.useTransferStore.getState().maxConcurrent).toBe(4);
  });
});

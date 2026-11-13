import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kindFromConnectionType, shouldHoldUpload } from '@/utils/uploadNetwork';

describe('shouldHoldUpload', () => {
  it('lets an upload the user pressed go ahead on any network', () => {
    for (const kind of ['wifi', 'cellular', 'none', 'unknown'] as const) {
      expect(shouldHoldUpload({ manual: true, wifiOnly: true, kind })).toBe(false);
    }
  });

  it('holds an automatic upload on mobile data, or with no network, while Wi-Fi only is on', () => {
    expect(shouldHoldUpload({ manual: false, wifiOnly: true, kind: 'cellular' })).toBe(true);
    expect(shouldHoldUpload({ manual: false, wifiOnly: true, kind: 'none' })).toBe(true);
  });

  it('lets an automatic upload go on Wi-Fi, or when the network cannot be told', () => {
    expect(shouldHoldUpload({ manual: false, wifiOnly: true, kind: 'wifi' })).toBe(false);
    expect(shouldHoldUpload({ manual: false, wifiOnly: true, kind: 'unknown' })).toBe(false);
  });

  it('never holds anything when Wi-Fi only is off', () => {
    expect(shouldHoldUpload({ manual: false, wifiOnly: false, kind: 'cellular' })).toBe(false);
  });
});

describe("kindFromConnectionType (the browser's navigator.connection.type)", () => {
  it('maps what browsers report', () => {
    expect(kindFromConnectionType('wifi')).toBe('wifi');
    expect(kindFromConnectionType('ethernet')).toBe('wifi');
    expect(kindFromConnectionType('cellular')).toBe('cellular');
    expect(kindFromConnectionType('none')).toBe('none');
    expect(kindFromConnectionType('bluetooth')).toBe('unknown');
    expect(kindFromConnectionType(undefined)).toBe('unknown');
  });
});

describe('getNetworkKind', () => {
  const original = Object.getOwnPropertyDescriptor(window.navigator, 'connection');
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    if (original) Object.defineProperty(window.navigator, 'connection', original);
    else delete (window.navigator as unknown as Record<string, unknown>)['connection'];
  });

  it("reads the browser's connection type on the web", async () => {
    Object.defineProperty(window.navigator, 'connection', {
      value: { type: 'cellular' },
      configurable: true,
    });
    const { getNetworkKind } = await import('@/utils/uploadNetwork');
    expect(await getNetworkKind()).toBe('cellular');
  });

  it('is unknown when the browser says nothing', async () => {
    delete (window.navigator as unknown as Record<string, unknown>)['connection'];
    const { getNetworkKind } = await import('@/utils/uploadNetwork');
    expect(await getNetworkKind()).toBe('unknown');
  });
});

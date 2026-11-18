import { describe, expect, it } from 'vitest';
import { DEFAULT_MOBILE_VIEW_SETTINGS } from '@/services/constants';

describe('the legacy iOS 12 build', () => {
  it('turns pages the plain way by default: the flip needs more than an old tablet can spare', () => {
    expect(DEFAULT_MOBILE_VIEW_SETTINGS.pageTurnStyle).toBe('push');
  });
});

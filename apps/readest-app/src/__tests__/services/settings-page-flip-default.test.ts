import { describe, expect, it } from 'vitest';
import { migratePageTurnDefault } from '@/services/settingsService';
import { DEFAULT_MOBILE_VIEW_SETTINGS } from '@/services/constants';
import type { SystemSettings } from '@/types/settings';

const settings = (style: string, extra: object = {}) =>
  ({ globalViewSettings: { pageTurnStyle: style }, ...extra }) as unknown as SystemSettings;

describe('page flip as the default turn on phones and tablets', () => {
  it('is the mobile default', () => {
    expect(DEFAULT_MOBILE_VIEW_SETTINGS.pageTurnStyle).toBe('flip');
  });

  it('moves a stored push to the flip once', () => {
    const stored = settings('push');
    migratePageTurnDefault(stored, true);
    expect(stored.globalViewSettings.pageTurnStyle).toBe('flip');
    // The reader chooses push again: it stays that way on the next start.
    stored.globalViewSettings.pageTurnStyle = 'push';
    migratePageTurnDefault(stored, true);
    expect(stored.globalViewSettings.pageTurnStyle).toBe('push');
  });

  it('keeps any other choice the reader made', () => {
    const stored = settings('slide');
    migratePageTurnDefault(stored, true);
    expect(stored.globalViewSettings.pageTurnStyle).toBe('slide');
  });

  it('does not touch a desktop or web install', () => {
    const stored = settings('push');
    migratePageTurnDefault(stored, false);
    expect(stored.globalViewSettings.pageTurnStyle).toBe('push');
  });
});

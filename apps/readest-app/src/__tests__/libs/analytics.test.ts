import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('analytics (PostHog on demand)', () => {
  it('does nothing, and loads nothing, until it is started', async () => {
    const { analytics, isAnalyticsRunning } = await import('@/libs/analytics');
    expect(isAnalyticsRunning()).toBe(false);
    expect(() => {
      analytics.identify('u');
      analytics.capture('x');
      analytics.captureException(new Error('e'));
      analytics.optIn();
      analytics.optOut();
    }).not.toThrow();
  });

  it('does not start outside production or without a key', async () => {
    const { startAnalytics } = await import('@/libs/analytics');
    expect(await startAnalytics({ key: 'k', host: 'https://h', optedOut: false })).toBeNull();
    vi.stubEnv('NODE_ENV', 'production');
    expect(await startAnalytics({ key: '', host: 'https://h', optedOut: false })).toBeNull();
  });

  it('a user who has not opted in never starts it at boot', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://ph.example');
    const init = vi.fn();
    vi.doMock('posthog-js', () => ({
      default: { init, identify: vi.fn(), capture: vi.fn(), opt_in_capturing: vi.fn() },
    }));
    for (const decision of [null, 'pending', 'opt-out']) {
      vi.resetModules();
      localStorage.clear();
      if (decision) localStorage.setItem('readest-telemetry-decision', decision);
      await import('@/context/PHContext');
      await Promise.resolve();
    }
    expect(init).not.toHaveBeenCalled();
  });

  it('starts it at boot for a user who opted in, in a build with telemetry enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_TELEMETRY', 'true');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://ph.example');
    const init = vi.fn();
    vi.doMock('posthog-js', () => ({
      default: { init, register_for_session: vi.fn() },
    }));
    localStorage.setItem('readest-telemetry-decision', 'opt-in');
    await import('@/context/PHContext');
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    expect(init.mock.calls[0]![0]).toBe('phc_test');
  });
});

describe('telemetry in this build', () => {
  it('is off unless the build asks for it, so no analytics script is ever requested', async () => {
    const { isTelemetryBuildEnabled } = await import('@/utils/telemetryKeys');
    expect(isTelemetryBuildEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_ENABLE_TELEMETRY', 'true');
    expect(isTelemetryBuildEnabled()).toBe(true);
  });

  it('does not start even for a user who had opted in', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    const init = vi.fn();
    vi.doMock('posthog-js', () => ({ default: { init, register_for_session: vi.fn() } }));
    localStorage.setItem('readest-telemetry-decision', 'opt-in');
    await import('@/context/PHContext');
    await new Promise((r) => setTimeout(r, 20));
    expect(init).not.toHaveBeenCalled();
  });
});

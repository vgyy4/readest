import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/libs/analytics', () => ({
  analytics: { capture: vi.fn(), optIn: vi.fn(), optOut: vi.fn() },
  isAnalyticsRunning: () => true,
}));
vi.mock('@/context/PHContext', () => ({ initPosthog: vi.fn(() => Promise.resolve()) }));

import { analytics } from '@/libs/analytics';
import {
  getTelemetryDecision,
  hasOptedOutTelemetry,
  optInTelemetry,
  optOutTelemetry,
  rollIntoTelemetryPromptBucket,
  setTelemetryDecision,
  TELEMETRY_DECISION_KEY,
  TELEMETRY_OPT_OUT_KEY,
  TELEMETRY_PROMPT_BUCKET_RATE,
} from '@/utils/telemetry';

describe('telemetry decision storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns null when no decision is stored', () => {
    expect(getTelemetryDecision()).toBeNull();
  });

  it('round-trips the three valid decisions', () => {
    setTelemetryDecision('opt-in');
    expect(getTelemetryDecision()).toBe('opt-in');
    setTelemetryDecision('opt-out');
    expect(getTelemetryDecision()).toBe('opt-out');
    setTelemetryDecision('pending');
    expect(getTelemetryDecision()).toBe('pending');
  });

  it('ignores garbage values written directly to the key', () => {
    localStorage.setItem(TELEMETRY_DECISION_KEY, 'something-else');
    expect(getTelemetryDecision()).toBeNull();
  });
});

describe('optInTelemetry / optOutTelemetry', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('opt-in records opt-in decision, clears opt-out flag, and turns analytics on', async () => {
    optInTelemetry();
    await vi.waitFor(() => expect(analytics.optIn).toHaveBeenCalledOnce());
    expect(localStorage.getItem(TELEMETRY_OPT_OUT_KEY)).toBe('false');
    expect(getTelemetryDecision()).toBe('opt-in');
    expect(hasOptedOutTelemetry()).toBe(false);
  });

  it('opt-out records opt-out decision, sets opt-out flag, and turns analytics off', () => {
    optOutTelemetry();
    expect(localStorage.getItem(TELEMETRY_OPT_OUT_KEY)).toBe('true');
    expect(getTelemetryDecision()).toBe('opt-out');
    expect(hasOptedOutTelemetry()).toBe(true);
    expect(analytics.optOut).toHaveBeenCalledOnce();
  });
});

describe('rollIntoTelemetryPromptBucket', () => {
  it('is true when the rng falls under the bucket rate', () => {
    expect(rollIntoTelemetryPromptBucket(() => 0)).toBe(true);
    expect(rollIntoTelemetryPromptBucket(() => TELEMETRY_PROMPT_BUCKET_RATE - 1e-9)).toBe(true);
  });

  it('is false at or above the bucket rate', () => {
    expect(rollIntoTelemetryPromptBucket(() => TELEMETRY_PROMPT_BUCKET_RATE)).toBe(false);
    expect(rollIntoTelemetryPromptBucket(() => 0.99)).toBe(false);
  });

  it('places roughly 10% of uniform draws into the bucket', () => {
    const n = 10000;
    let inBucket = 0;
    for (let i = 0; i < n; i++) {
      if (rollIntoTelemetryPromptBucket(() => i / n)) inBucket++;
    }
    // Deterministic uniform sweep: floor(n * rate) = 1000.
    expect(inBucket).toBe(Math.floor(n * TELEMETRY_PROMPT_BUCKET_RATE));
  });
});

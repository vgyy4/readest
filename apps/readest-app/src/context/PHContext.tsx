'use client';

import { ReactNode, useEffect } from 'react';
import { analytics, isAnalyticsRunning, startAnalytics } from '@/libs/analytics';
import {
  isTelemetryBuildEnabled,
  TELEMETRY_DECISION_KEY,
  TELEMETRY_OPT_OUT_KEY,
} from '@/utils/telemetryKeys';
import { getAppVersion } from '@/utils/version';

// Returns true if PostHog should be opted-out at boot time, before settings
// have loaded. Honors any explicit decision the user has made; otherwise
// returns true (opt-out by default) so brand-new users never ping PostHog
// before Providers can finalize the decision. Existing users whose settings
// have telemetry enabled are re-opted-in once Providers loads their settings.
const shouldOptOutAtBoot = () => {
  if (typeof window === 'undefined') return true;
  const decision = localStorage.getItem(TELEMETRY_DECISION_KEY);
  if (decision === 'opt-in') return false;
  if (decision === 'opt-out' || decision === 'pending') return true;
  return localStorage.getItem(TELEMETRY_OPT_OUT_KEY) !== 'false';
};

const posthogUrl =
  process.env['NEXT_PUBLIC_POSTHOG_HOST'] ||
  atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64']!);
const posthogKey = isTelemetryBuildEnabled()
  ? process.env['NEXT_PUBLIC_POSTHOG_KEY'] ||
    atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64']!)
  : '';

/**
 * Start PostHog. Until the user has opted in it is not loaded at all: even "opted out" it
 * fetched its configuration and three scripts from another server at every launch, which
 * cost time on slow devices and told a third party that the app was opened.
 */
export const initPosthog = () =>
  startAnalytics({ key: posthogKey, host: posthogUrl, optedOut: shouldOptOutAtBoot() });

const registerSession = () => analytics.registerForSession({ $app_version: getAppVersion() });

// Only a user who opted in gets PostHog loaded; everyone else never fetches it.
if (typeof window !== 'undefined' && !shouldOptOutAtBoot())
  void initPosthog().then(registerSession);

export const CSPostHogProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    if (isAnalyticsRunning()) registerSession();
  }, []);
  return <>{children}</>;
};

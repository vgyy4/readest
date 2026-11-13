// Kept in a module of their own so PostHog's start-up code can read them without importing the
// telemetry helpers (which import it).
export const TELEMETRY_OPT_OUT_KEY = 'readest-telemetry-opt-out';
export const TELEMETRY_DECISION_KEY = 'readest-telemetry-decision';

/**
 * Usage analytics are off in this build unless it is built with NEXT_PUBLIC_ENABLE_TELEMETRY=true:
 * a private, self-hosted app has no reason to tell a third party that it was opened, and loading
 * the analytics library cost every launch time.
 */
export const isTelemetryBuildEnabled = () => process.env['NEXT_PUBLIC_ENABLE_TELEMETRY'] === 'true';

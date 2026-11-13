import type { PostHog } from 'posthog-js';

/**
 * Usage analytics through PostHog, loaded on demand. posthog-js is a large library: importing it
 * at the top of the app meant every launch downloaded, parsed and ran it, opted in or not. Here it
 * is fetched only when a user has opted in, and every call is a no-op until it is running.
 */
let client: PostHog | null = null;
let starting: Promise<PostHog | null> | null = null;

export const isAnalyticsRunning = () => client !== null;

/** Start PostHog (once). Resolves to null when it cannot run (development, or no key). */
export const startAnalytics = (config: {
  key: string;
  host: string;
  optedOut: boolean;
}): Promise<PostHog | null> => {
  if (client) return Promise.resolve(client);
  if (typeof window === 'undefined' || process.env['NODE_ENV'] !== 'production' || !config.key) {
    return Promise.resolve(null);
  }
  starting ??= import('posthog-js').then(({ default: posthog }) => {
    posthog.init(config.key, {
      api_host: config.host,
      person_profiles: 'always',
      autocapture: false,
      opt_out_capturing_by_default: config.optedOut,
    });
    client = posthog;
    return posthog;
  });
  return starting;
};

export const analytics = {
  identify: (id: string) => client?.identify(id),
  capture: (event: string, properties?: Record<string, unknown>) =>
    client?.capture(event, properties),
  captureException: (error: unknown) => client?.captureException(error),
  registerForSession: (properties: Record<string, unknown>) =>
    client?.register_for_session(properties),
  optIn: () => client?.opt_in_capturing(),
  optOut: () => client?.opt_out_capturing(),
};

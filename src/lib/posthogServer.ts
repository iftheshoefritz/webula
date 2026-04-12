import { PostHog } from 'posthog-node';

let posthogInstance: PostHog | null = null;

/**
 * Returns a singleton PostHog Node client for server-side error capture.
 *
 * flushAt/flushInterval are set to 1/0 so that events are sent immediately.
 * This matters in serverless environments (e.g. Vercel) where the process
 * can be suspended before a batched flush happens.
 *
 * Returns null when NEXT_PUBLIC_POSTHOG_KEY is not configured so callers
 * can short-circuit without throwing during local/test runs.
 */
export function getPostHogServer(): PostHog | null {
  if (posthogInstance) {
    return posthogInstance;
  }

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return null;
  }

  posthogInstance = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });

  return posthogInstance;
}

/**
 * Test-only helper to reset the singleton between tests.
 */
export function __resetPostHogServerForTests(): void {
  posthogInstance = null;
}

import type { Instrumentation } from 'next';

/**
 * Next.js 15 instrumentation hook.
 *
 * register() runs once when the server process starts. We leave it empty
 * because PostHog is created lazily in `onRequestError` (and in
 * `src/lib/posthogServer.ts`).
 */
export function register(): void {
  // no-op; PostHog client is initialised lazily on first error
}

/**
 * Automatically called by Next.js 15+ whenever a request handler throws —
 * covers App Router route handlers (including `/api/test-error`), server
 * components, server actions, and middleware.
 *
 * This is the framework-level hook, so individual routes do NOT need any
 * explicit error-capture code.
 *
 * See: https://posthog.com/docs/error-tracking/installation/nextjs
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  // Skip the edge runtime — posthog-node targets Node.js and we only wire
  // the API routes through Node anyway.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Use require() so the posthog-node module (and its transitive deps) are
  // only loaded on Node, never in the edge bundle.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getPostHogServer } = require('./lib/posthogServer') as typeof import('./lib/posthogServer');
  const posthog = getPostHogServer();
  if (!posthog) {
    // No PostHog key configured — nothing to do.
    return;
  }

  // Best-effort distinct_id: read from the PostHog browser cookie if present.
  let distinctId: string | undefined;
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const cookieString = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
    const postHogCookieMatch = cookieString.match(/ph_phc_.*?_posthog=([^;]+)/);
    if (postHogCookieMatch && postHogCookieMatch[1]) {
      try {
        const decodedCookie = decodeURIComponent(postHogCookieMatch[1]);
        const postHogData = JSON.parse(decodedCookie);
        if (typeof postHogData?.distinct_id === 'string') {
          distinctId = postHogData.distinct_id;
        }
      } catch {
        // Ignore malformed cookies — we'll just capture without a distinct_id.
      }
    }
  }

  // captureExceptionImmediate bypasses the batching queue and resolves only
  // after the request has been flushed — critical in serverless environments
  // (Vercel) where the process may be suspended before the next flush.
  await posthog.captureExceptionImmediate(err, distinctId, {
    $current_url: request.path,
    $request_method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
};

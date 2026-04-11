import { PostHog } from 'posthog-node';

// Required by Next.js 14 instrumentation hook — called once on server startup
export function register() {}

export async function onRequestError(
  err: { digest: string } & Error,
  request: Request,
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return; // edge runtime not supported
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return; // PostHog disabled (e.g. local dev)
  const client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
  // captureExceptionImmediate sends the event immediately and returns a Promise,
  // which Next.js will await — appropriate for per-request hooks in serverless
  await client.captureExceptionImmediate(err, undefined, {
    route: context.routePath,
    routeType: context.routeType,
  });
}

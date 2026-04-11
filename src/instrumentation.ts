import { PostHog } from 'posthog-node';

// Required by Next.js 14 instrumentation hook — called once on server startup
export function register() {}

export function onRequestError(
  err: { digest: string } & Error,
  request: Request,
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return; // edge runtime not supported
  const client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
  client.captureException(err, undefined, {
    route: context.routePath,
    routeType: context.routeType,
  });
  // flush synchronously before the function exits
  return client.shutdown();
}

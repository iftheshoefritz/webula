import { type ShareErrorCode } from './shareErrors';

// The answers of the playtest routes (#1612). Every one is `private`, never `public`, so Vercel's
// CDN keeps no copy, and every one is `noindex`. A 404 is the same plain body as `/api/stats`, so a
// caller who is not a playtester cannot tell that playtest cards exist.

const NOINDEX = { 'X-Robots-Tag': 'noindex' };

export function playtestNotFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store', ...NOINDEX },
  });
}

export function playtestUnreachable(error: unknown): Response {
  console.error('Playtest store read error:', error);
  const code: ShareErrorCode = 'upstream_unreachable';
  return new Response(JSON.stringify({ error: 'Playtest service unreachable', code }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...NOINDEX },
  });
}

export function playtestJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-cache', ...NOINDEX },
  });
}

// The version in the image URL changes with each upload, so a browser may keep an image for good.
export function playtestImage(bytes: Uint8Array<ArrayBuffer>): Response {
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
      ...NOINDEX,
    },
  });
}

// The answers of the owner-only admin routes (#1613): never kept by a cache, the browser's too.
export function playtestAdminJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...NOINDEX },
  });
}

export function playtestBadRequest(error: string, extra: Record<string, unknown> = {}, status = 400): Response {
  const code: ShareErrorCode = 'bad_request';
  return playtestAdminJson({ error, code, ...extra }, status);
}

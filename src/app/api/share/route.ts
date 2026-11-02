import { type ShareErrorCode } from '../../../lib/shareErrors';
import {
  getShareStore,
  isShareId,
  MAX_CONTENT_BYTES,
  newShareId,
  SHARE_TTL_SECONDS,
} from '../../../lib/shareStore';

const MAX_ID_ATTEMPTS = 3;

// Allows the trekcc.org import bookmarklet (see /import-trekcc) to POST a decklist
// it fetched from trekcc.org directly to this endpoint.
const ALLOWED_ORIGIN = 'https://www.trekcc.org';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Every error answer carries a machine-readable `code` beside `error` (#1441).
function errorResponse(
  error: string,
  code: ShareErrorCode,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return errorResponse('Missing id', 'bad_request', 400);
  }
  // An id with a character outside the alphabet was never written, so it is not there.
  if (!isShareId(id)) {
    return errorResponse('Share not found', 'not_found', 404);
  }

  let share;
  try {
    share = await getShareStore().read(id);
  } catch (error) {
    console.error('Share store read error:', error);
    return errorResponse('Share service unreachable', 'upstream_unreachable', 502);
  }
  if (!share) {
    return errorResponse('Share not found', 'not_found', 404);
  }

  return new Response(JSON.stringify({ content: share.content, title: share.title ?? null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request) {
  let content: unknown;
  let title: unknown;
  try {
    ({ content, title } = await req.json());
  } catch {
    return errorResponse('Invalid request body', 'bad_request', 400, corsHeaders());
  }
  if (typeof content !== 'string' || content === '') {
    return errorResponse('Missing content', 'bad_request', 400, corsHeaders());
  }
  if (new TextEncoder().encode(content).byteLength > MAX_CONTENT_BYTES) {
    return errorResponse('Content too large', 'bad_request', 413, corsHeaders());
  }

  const share = {
    content,
    title: (typeof title === 'string' && title) || 'Webula deck',
    createdAt: new Date().toISOString(),
  };

  try {
    const store = getShareStore();
    // A collision of 60-bit ids is all but impossible, but the write is NX, so
    // a taken id gets a new one rather than overwriting someone's share.
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const id = newShareId();
      if (await store.create(id, share, SHARE_TTL_SECONDS)) {
        return new Response(JSON.stringify({ id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    }
    console.error('Share store: no free id after', MAX_ID_ATTEMPTS, 'attempts');
    return errorResponse('Share creation failed', 'upstream_error', 500, corsHeaders());
  } catch (error) {
    console.error('Share store write error:', error);
    return errorResponse('Share service unreachable', 'upstream_unreachable', 502, corsHeaders());
  }
}

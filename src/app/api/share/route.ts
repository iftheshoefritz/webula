import { type ShareErrorCode, upstreamErrorCode } from '../../../lib/shareErrors';

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

  let res: Response;
  try {
    res = await fetch(`https://dpaste.com/${id}.txt`);
  } catch (error) {
    console.error('Paste fetch error:', error);
    return errorResponse('Share service unreachable', 'upstream_unreachable', 502);
  }

  try {
    if (!res.ok) {
      return errorResponse('Paste not found', upstreamErrorCode(res.status, true), res.status);
    }
    const content = await res.text();

    // Best-effort: fetch the title dpaste stored for this paste (set when the deck was
    // shared) so the deck builder can use it instead of a generic filename. If this fails,
    // fall back to no title rather than failing the whole share load.
    let title: string | null = null;
    try {
      const detailRes = await fetch(`https://dpaste.com/api/item_detail/${id}`);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        title = detail?.[id]?.title || null;
      }
    } catch (detailError) {
      console.error('Paste title fetch error:', detailError);
    }

    return new Response(JSON.stringify({ content, title }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Paste fetch error:', error);
    return errorResponse('Share service unreachable', 'upstream_unreachable', 502);
  }
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

  try {
    const body = new URLSearchParams();
    body.set('content', content);
    body.set('title', (typeof title === 'string' && title) || 'Webula deck');
    body.set('syntax', 'text');
    body.set('expiry_days', '30');
    body.set('format', 'url');

    const res = await fetch('https://dpaste.com/api/v2/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('dpaste API error:', res.status, errorText);
      return errorResponse('Paste creation failed', upstreamErrorCode(res.status, false), res.status, corsHeaders());
    }

    // format=url returns the paste URL as plain text, e.g. "https://dpaste.com/ABCDE\n"
    const pasteUrl = (await res.text()).trim();
    const id = pasteUrl.split('/').filter(Boolean).pop();

    return new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (error) {
    console.error('Paste route error:', error);
    return errorResponse('Share service unreachable', 'upstream_unreachable', 502, corsHeaders());
  }
}

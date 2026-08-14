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

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const res = await fetch(`https://dpaste.com/${id}.txt`);
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Paste not found' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(req: Request) {
  try {
    const { content, title } = await req.json();

    const body = new URLSearchParams();
    body.set('content', content);
    body.set('title', title || 'Webula deck');
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
      return new Response(JSON.stringify({ error: 'Paste creation failed' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

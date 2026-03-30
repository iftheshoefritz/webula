export async function POST(req: Request) {
  try {
    const { content, title } = await req.json();

    const body = new URLSearchParams();
    body.set('content', content);
    body.set('title', title || 'Webula deck');
    body.set('syntax', 'text');
    body.set('expiry_days', '30');

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
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const json = await res.json();
    // json.link looks like "https://dpaste.com/ABCDE"
    const id = (json.link as string).split('/').filter(Boolean).pop();

    return new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Paste route error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

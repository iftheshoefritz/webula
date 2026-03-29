export async function POST(req: Request) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'GitHub token not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { content, title } = await req.json();

    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        description: `Webula deck: ${title}`,
        public: false,
        files: { 'deck.txt': { content } },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('GitHub Gist API error:', res.status, errorText);
      return new Response(JSON.stringify({ error: 'Gist creation failed' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const json = await res.json();
    return new Response(JSON.stringify({ id: json.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Gist route error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

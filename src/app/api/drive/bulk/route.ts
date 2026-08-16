import { google } from 'googleapis';
import { getToken } from "next-auth/jwt"
import { refreshAccessToken } from '../../auth/refreshToken';
import { writeDeckIdempotent } from '../idempotentWrite';

// Bulk-saves several trekCC-imported decks to the user's Drive appDataFolder in one
// request, used by /import-trekcc/bulk after a multi-deck bookmarklet import. Each deck
// is written idempotently via its trekccDeckId (see idempotentWrite.ts), so re-running
// an import updates existing files instead of duplicating them.

async function tokenDecode(req): Promise<{ accessToken: string; accessTokenExpires: number; refreshToken: string | undefined} | undefined> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }) as {accessToken: string, accessTokenExpires: number, refreshToken: string | undefined}
    if (token && token.accessToken && token.accessTokenExpires > Date.now()) {
      return {
        accessToken: token.accessToken,
        accessTokenExpires: token.accessTokenExpires,
        refreshToken: token.refreshToken,
      };
    } else {
      return refreshAccessToken(token)
    }
  } catch (error) {
    console.error('Error decoding token:', error);
    return undefined;
  }
}

type DeckPayload = { trekccDeckId?: string | null; title: string; content: string };
type DeckResult = { trekccDeckId?: string | null; title: string; status: 'created' | 'updated' | 'failed'; error?: string };

export async function POST(req: Request) {
  try {
    let tokenDetails = await tokenDecode(req);
    if (!tokenDetails) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientId = process.env.NEXTAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_SECRET;
    const auth = new google.auth.OAuth2({
      clientId, clientSecret,
    })
    auth.setCredentials({ access_token: tokenDetails.accessToken })

    const drive = google.drive({
      version: 'v3',
      auth: auth,
    })

    const { decks } = await req.json() as { decks: DeckPayload[] };
    if (!Array.isArray(decks) || decks.length === 0) {
      return new Response(JSON.stringify({ error: 'No decks provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const results: DeckResult[] = [];
    for (const deck of decks) {
      try {
        const { status } = await writeDeckIdempotent(drive, {
          fileName: deck.title,
          content: deck.content,
          trekccDeckId: deck.trekccDeckId,
        });
        results.push({ trekccDeckId: deck.trekccDeckId, title: deck.title, status });
      } catch (error: any) {
        console.error('Bulk Drive write failed for deck:', deck.title, error);
        if (error?.response?.status === 403 || error?.code === 403) {
          return new Response(JSON.stringify({ error: 'drive_scope_missing' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        results.push({ trekccDeckId: deck.trekccDeckId, title: deck.title, status: 'failed', error: 'Save failed' });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Google API returned an error:', error);
    return new Response(JSON.stringify({ error: 'Google API error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

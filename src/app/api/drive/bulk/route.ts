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
type ScopeMissing = { scopeMissing: true };

// Small fixed concurrency cap for Drive writes. We're on Vercel's free (Hobby) plan, which
// has a tight serverless function duration budget, so decks are written in small concurrent
// batches (rather than one at a time or all at once) to keep wall-clock time down without
// tripping Drive's per-user rate limits.
const DRIVE_WRITE_CONCURRENCY = 3;

// Backstop headroom on top of the concurrency win above, in case an unusually large import
// still runs long. The concurrency change is what actually keeps normal-sized imports within
// the platform's default limit.
export const maxDuration = 60;

// Pulls a human-readable message out of a failed Drive API call so per-deck failures are
// diagnosable from the UI instead of only visible in server logs. Falls back to a generic
// message when the error shape doesn't match what Gaxios/the Drive client normally throws.
function driveErrorMessage(error: any): string {
  return error?.response?.data?.error?.message || error?.message || 'Save failed';
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function writeDeck(drive: any, deck: DeckPayload, targetParentId?: string): Promise<DeckResult | ScopeMissing> {
  try {
    const { status } = await writeDeckIdempotent(drive, {
      fileName: deck.title,
      content: deck.content,
      trekccDeckId: deck.trekccDeckId,
      targetParentId,
    });
    return { trekccDeckId: deck.trekccDeckId, title: deck.title, status };
  } catch (error: any) {
    console.error('Bulk Drive write failed for deck:', deck.title, error);
    if (error?.response?.status === 403 || error?.code === 403) {
      return { scopeMissing: true };
    }
    return { trekccDeckId: deck.trekccDeckId, title: deck.title, status: 'failed', error: driveErrorMessage(error) };
  }
}

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

    // targetParentId applies to every deck in the batch (there's a single destination-folder
    // prompt for the whole import, not one per file); it only affects newly created files,
    // mirroring /api/drive's own POST handler, which defaults to the appDataFolder root when
    // it's absent.
    const { decks, targetParentId } = await req.json() as { decks: DeckPayload[]; targetParentId?: string };
    if (!Array.isArray(decks) || decks.length === 0) {
      return new Response(JSON.stringify({ error: 'No decks provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const chunks = chunk(decks, DRIVE_WRITE_CONCURRENCY);

    // Process the first batch up front so a token missing the Drive scope can still short-circuit
    // with a plain 403 JSON response before any streaming begins — the scope applies to the whole
    // request (same auth for every deck), so it will surface on the very first Drive call.
    const firstChunkResults = await Promise.all(chunks[0].map((deck) => writeDeck(drive, deck, targetParentId)));
    if (firstChunkResults.some((r) => 'scopeMissing' in r)) {
      return new Response(JSON.stringify({ error: 'drive_scope_missing' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream one NDJSON line per deck result as each batch finishes, instead of building the
    // full results array and serializing it once at the end. This gives the client live
    // progress and means a platform-level timeout only truncates the tail of the stream rather
    // than corrupting a single JSON blob.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const writeLine = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        (firstChunkResults as DeckResult[]).forEach(writeLine);

        for (let i = 1; i < chunks.length; i++) {
          const chunkResults = await Promise.all(chunks[i].map((deck) => writeDeck(drive, deck, targetParentId)));
          if (chunkResults.some((r) => 'scopeMissing' in r)) {
            writeLine({ error: 'drive_scope_missing' });
            controller.close();
            return;
          }
          (chunkResults as DeckResult[]).forEach(writeLine);
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    })
  } catch (error: any) {
    console.error('Google API returned an error:', error);
    return new Response(JSON.stringify({ error: 'Google API error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

import { callerEmail, readVisibleChampionshipDeck } from '../../../../lib/championshipDecksServer';

// The text of one Championship deck (#1327), only when the caller may see its row. Anything else, a
// hidden deck, a name that is not in the index, a `../` path, gets a 404, so a hidden deck's file name
// is never confirmed.
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const text = await readVisibleChampionshipDeck(file, await callerEmail(req));
  if (text === null) return new Response('Not found', { status: 404 });
  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

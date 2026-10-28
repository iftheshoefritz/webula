import { callerEmail, visibleChampionshipIndex } from '../../../lib/championshipDecksServer';

// The index of the Championship decks (#1327): every row for an early-access user, only the rows with
// `authorizedUse` for anyone else, a signed-out caller too.
export async function GET(req: Request) {
  const rows = await visibleChampionshipIndex(await callerEmail(req));
  return Response.json(rows, { headers: { 'Cache-Control': 'private, no-store' } });
}

import { callerEmail } from '../../../lib/championshipDecksServer';
import { isEarlyAccessUser } from '../../../lib/featureFlags';
import { readStatsSummary } from '../../../lib/statsServer';

// The stats of the agent runs, the CI jobs and the GitHub issues (#1417), for an early-access user
// only. Anyone else, a signed-out caller too, gets the same 404 as a route that does not exist.
export async function GET(req: Request) {
  if (!isEarlyAccessUser(await callerEmail(req))) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return Response.json(await readStatsSummary(), { headers: { 'Cache-Control': 'private, no-store' } });
}

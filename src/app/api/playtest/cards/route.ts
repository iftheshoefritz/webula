import { callerEmail } from '../../../../lib/callerEmail';
import { isPlaytester } from '../../../../lib/playtestAccess';
import { playtestJson, playtestNotFound, playtestUnreachable } from '../../../../lib/playtestResponses';
import { getPlaytestStore } from '../../../../lib/playtestStore';

// The playtest cards (#1612), `{ version, tsv }`, for a playtester only. Anyone else, a signed-out
// caller too, gets the same 404 as a route that does not exist. Before the first upload a
// playtester gets `{ version: 0, tsv: '' }`.
export async function GET(req: Request) {
  try {
    if (!(await isPlaytester(await callerEmail(req)))) return playtestNotFound();
    const { version, tsv } = await getPlaytestStore().readCards();
    return playtestJson({ version, tsv });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

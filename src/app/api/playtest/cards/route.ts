import { callerEmail } from '../../../../lib/callerEmail';
import { isPlaytester } from '../../../../lib/playtestAccess';
import { playtestJson, playtestNotFound, playtestUnreachable } from '../../../../lib/playtestResponses';
import { getPlaytestStore } from '../../../../lib/playtestStore';

// The playtest sets in testing (#1612, #1644), `{ sets: [{ name, version, tsv }] }`, by name, for a
// playtester only. Anyone else, a signed-out caller too, gets the same 404 as a route that does not
// exist. Before the first upload a playtester gets `{ sets: [] }`.
export async function GET(req: Request) {
  try {
    if (!(await isPlaytester(await callerEmail(req)))) return playtestNotFound();
    const sets = await getPlaytestStore().readSets();
    return playtestJson({ sets: sets.map(({ name, version, tsv }) => ({ name, version, tsv })) });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

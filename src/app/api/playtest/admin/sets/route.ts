import { callerEmail } from '../../../../../lib/callerEmail';
import { isPlaytestOwner } from '../../../../../lib/playtestAccess';
import { playtestAdminJson, playtestBadRequest, playtestNotFound, playtestUnreachable } from '../../../../../lib/playtestResponses';
import { getPlaytestAdminStore, isPlaytestSetName, playtestSetKey } from '../../../../../lib/playtestStore';

// The remove of a playtest set (#1644), `DELETE { name }`, for an owner only: the set leaves the
// index, then its cards, its version, its upload time and its images leave the store. Answers
// `{ removed: <name> }`, or a 400 when no set of that name is in testing.
export async function DELETE(req: Request) {
  if (!isPlaytestOwner(await callerEmail(req))) return playtestNotFound();
  let name: unknown;
  try {
    name = (await req.json())?.name;
  } catch {
    return playtestBadRequest('The body must be JSON');
  }
  if (typeof name !== 'string' || !isPlaytestSetName(name)) return playtestBadRequest('The name is not the name of a set');
  try {
    const removed = await getPlaytestAdminStore().removeSet(playtestSetKey(name));
    if (!removed) return playtestBadRequest(`The set ${name} is not in testing`);
    return playtestAdminJson({ removed: name });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

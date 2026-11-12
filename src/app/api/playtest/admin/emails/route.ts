import { callerEmail } from '../../../../../lib/callerEmail';
import { isPlaytestOwner } from '../../../../../lib/playtestAccess';
import { playtestAdminJson, playtestBadRequest, playtestNotFound, playtestUnreachable } from '../../../../../lib/playtestResponses';
import { getPlaytestAdminStore } from '../../../../../lib/playtestStore';

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

// The playtesters, the Redis set `playtest:emails` (#1613), for an owner only: `GET` lists them,
// `POST { email }` adds one and `DELETE { email }` removes one, lowercased and trimmed. Each answers
// `{ emails }`, the list after the change. `isPlaytester` reads the set on every request, so a
// change takes effect on the playtester's next request.
export async function GET(req: Request) {
  if (!isPlaytestOwner(await callerEmail(req))) return playtestNotFound();
  try {
    return playtestAdminJson({ emails: await getPlaytestAdminStore().listPlaytesters() });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

async function change(req: Request, action: 'add' | 'remove'): Promise<Response> {
  if (!isPlaytestOwner(await callerEmail(req))) return playtestNotFound();
  let email: unknown;
  try {
    email = (await req.json())?.email;
  } catch {
    return playtestBadRequest('The body must be JSON');
  }
  const normalised = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL.test(normalised)) return playtestBadRequest('The email is not an email address');
  try {
    const store = getPlaytestAdminStore();
    if (action === 'add') await store.addPlaytester(normalised);
    else await store.removePlaytester(normalised);
    return playtestAdminJson({ emails: await store.listPlaytesters() });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

export function POST(req: Request) {
  return change(req, 'add');
}

export function DELETE(req: Request) {
  return change(req, 'remove');
}

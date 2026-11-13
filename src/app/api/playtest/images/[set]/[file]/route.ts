import { callerEmail } from '../../../../../../lib/callerEmail';
import { isPlaytester } from '../../../../../../lib/playtestAccess';
import { playtestImage, playtestNotFound, playtestUnreachable } from '../../../../../../lib/playtestResponses';
import { getPlaytestStore, isPlaytestImageFile, isPlaytestSetName, playtestSetKey } from '../../../../../../lib/playtestStore';

// One playtest image (#1612), `<set>/<ImageFile>.jpg` (#1644), for a playtester only. The set is the
// key of a set in testing, its name lowercased. The client adds `?v=<version>`, which this route
// ignores: it only makes each upload a new URL for the browser cache. A set or a name the store
// could not hold gets a 404 with no store call; a caller who is not a playtester, a set not in
// testing and an image the store does not hold get the same 404.
export async function GET(req: Request, { params }: { params: Promise<{ set: string; file: string }> }) {
  const { set, file } = await params;
  if (!isPlaytestSetName(set) || set !== playtestSetKey(set)) return playtestNotFound();
  if (!file.endsWith('.jpg')) return playtestNotFound();
  const imageFile = file.slice(0, -'.jpg'.length);
  if (!isPlaytestImageFile(imageFile)) return playtestNotFound();

  let image: string | null;
  try {
    if (!(await isPlaytester(await callerEmail(req)))) return playtestNotFound();
    image = await getPlaytestStore().readImage(set, imageFile);
  } catch (error) {
    return playtestUnreachable(error);
  }
  if (image === null) return playtestNotFound();
  return playtestImage(new Uint8Array(Buffer.from(image, 'base64')));
}

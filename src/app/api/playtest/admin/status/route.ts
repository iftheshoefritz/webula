import { callerEmail } from '../../../../../lib/callerEmail';
import { isPlaytestOwner } from '../../../../../lib/playtestAccess';
import { playtestAdminJson, playtestNotFound, playtestUnreachable } from '../../../../../lib/playtestResponses';
import { getPlaytestAdminStore } from '../../../../../lib/playtestStore';
import { playtestImageFiles, readNormalisedTsv } from '../../../../../lib/playtestUpload';

// The current upload and the playtesters (#1613), for an owner only: `{ version, uploadedAt, cards,
// images, emails }`. The cards and the images are counted from the stored TSV, not with a SCAN.
export async function GET(req: Request) {
  if (!isPlaytestOwner(await callerEmail(req))) return playtestNotFound();
  try {
    const store = getPlaytestAdminStore();
    const [{ version, uploadedAt, tsv }, emails] = await Promise.all([store.readStatus(), store.listPlaytesters()]);
    return playtestAdminJson({
      version,
      uploadedAt,
      cards: tsv ? readNormalisedTsv(tsv).length : 0,
      images: tsv ? playtestImageFiles(tsv).length : 0,
      emails,
    });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

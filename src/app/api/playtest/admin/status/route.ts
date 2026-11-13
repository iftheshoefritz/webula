import { callerEmail } from '../../../../../lib/callerEmail';
import { isPlaytestOwner } from '../../../../../lib/playtestAccess';
import { playtestAdminJson, playtestNotFound, playtestUnreachable } from '../../../../../lib/playtestResponses';
import { getPlaytestAdminStore } from '../../../../../lib/playtestStore';
import { playtestImageFiles, playtestSetCardsOf, readNormalisedTsv } from '../../../../../lib/playtestUpload';

// The sets in testing and the playtesters (#1613, #1644), for an owner only: `{ sets: [{ name,
// version, uploadedAt, cards, images, cardNames, collectorsInfo }], legacyError, emails }`. The
// cards and the images are counted from the stored TSV, not with a SCAN. The card names and the
// `CollectorsInfo`s let the upload preview find a card another set already uses. `legacyError` says
// why the cards stored before playtest sets could not move to a set, and is null otherwise.
export async function GET(req: Request) {
  if (!isPlaytestOwner(await callerEmail(req))) return playtestNotFound();
  try {
    const store = getPlaytestAdminStore();
    const [{ sets, legacyError }, emails] = await Promise.all([store.readStatus(), store.listPlaytesters()]);
    return playtestAdminJson({
      sets: sets.map(({ name, version, uploadedAt, tsv }) => {
        const { cardNames, collectorsInfo } = playtestSetCardsOf(name, tsv);
        return {
          name,
          version,
          uploadedAt,
          cards: tsv ? readNormalisedTsv(tsv).length : 0,
          images: tsv ? playtestImageFiles(tsv).length : 0,
          cardNames,
          collectorsInfo,
        };
      }),
      legacyError,
      emails,
    });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

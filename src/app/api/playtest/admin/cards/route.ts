import { callerEmail } from '../../../../../lib/callerEmail';
import { loadCards } from '../../../../../lib/loadCards';
import { isPlaytestOwner } from '../../../../../lib/playtestAccess';
import { playtestAdminJson, playtestBadRequest, playtestNotFound, playtestUnreachable } from '../../../../../lib/playtestResponses';
import { getPlaytestAdminStore, isPlaytestImageFile, playtestSetKey } from '../../../../../lib/playtestStore';
import { checkPlaytestUpload, playtestImageFiles, playtestSetCardsOf } from '../../../../../lib/playtestUpload';

const MAX_TSV_BYTES = 2 * 1024 * 1024;

// The playtest TSV of an upload (#1613), as plain text, for an owner only, with `?replace=<set>`
// when it replaces a set in testing and no `replace` for a new set (#1644). The page sends it after
// every image batch. The route runs `normalisePlaytestTsv` again with the names of the real cards
// and the cards of the other sets in testing, so it never stores TSV the check did not pass, checks
// the set of the rows, and checks that the store holds every image the TSV names under that set.
// Any error writes nothing. Then `publishSet` writes the cards and the upload time, bumps the
// set's version, lists the set, and removes the set it replaces.
export async function POST(req: Request) {
  if (!isPlaytestOwner(await callerEmail(req))) return playtestNotFound();

  const replace = new URL(req.url).searchParams.get('replace');
  const text = await req.text();
  if (text.length > MAX_TSV_BYTES) return playtestBadRequest('The TSV is too large', {}, 413);

  try {
    const store = getPlaytestAdminStore();
    const { sets } = await store.readStatus();
    const realNames = new Set(loadCards().data.map((card) => card.originalName));
    const { result, set } = checkPlaytestUpload(
      text,
      realNames,
      sets.map(({ name, tsv }) => playtestSetCardsOf(name, tsv)),
      replace ?? null,
    );
    // The set's errors first: a card of the set it fails to replace would read as a conflict.
    if (set.errors.length > 0) return playtestBadRequest(set.errors.join('; '), { errors: set.errors });
    if (result.errors.length > 0) return playtestBadRequest('The TSV has errors', { errors: result.errors });
    if (result.cards === 0 || set.name === null) return playtestBadRequest('The TSV holds no cards');

    const imageFiles = playtestImageFiles(result.tsv);
    const badNames = imageFiles.filter((name) => !isPlaytestImageFile(name));
    if (badNames.length > 0) return playtestBadRequest('An ImageFile may hold only letters, digits, _, - and .', { imageFiles: badNames });

    const missing = await store.missingImages(playtestSetKey(set.name), imageFiles);
    if (missing.length > 0) return playtestBadRequest('The store has no image for some cards', { missingImages: missing });

    const version = await store.publishSet({
      name: set.name,
      tsv: result.tsv,
      uploadedAt: new Date().toISOString(),
      replaces: set.replace,
    });
    return playtestAdminJson({ set: set.name, version, cards: result.cards, images: imageFiles.length });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

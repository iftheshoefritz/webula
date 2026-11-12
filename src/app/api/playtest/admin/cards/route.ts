import { callerEmail } from '../../../../../lib/callerEmail';
import { loadCards } from '../../../../../lib/loadCards';
import { isPlaytestOwner } from '../../../../../lib/playtestAccess';
import { normalisePlaytestTsv } from '../../../../../lib/playtestCards';
import { playtestAdminJson, playtestBadRequest, playtestNotFound, playtestUnreachable } from '../../../../../lib/playtestResponses';
import { getPlaytestAdminStore, isPlaytestImageFile } from '../../../../../lib/playtestStore';
import { playtestImageFiles } from '../../../../../lib/playtestUpload';

const MAX_TSV_BYTES = 2 * 1024 * 1024;

// The playtest TSV of an upload (#1613), as plain text, for an owner only. The page sends it after
// every image batch. The route runs `normalisePlaytestTsv` again with the names of the real cards,
// so it never stores TSV the check did not pass, and checks that the store holds every image the
// TSV names. Any error writes nothing. Then it writes the cards, removes the images the new TSV no
// longer names, writes the upload time, and bumps `playtest:version` last.
export async function POST(req: Request) {
  if (!isPlaytestOwner(await callerEmail(req))) return playtestNotFound();

  const text = await req.text();
  if (text.length > MAX_TSV_BYTES) return playtestBadRequest('The TSV is too large', {}, 413);

  const realNames = new Set(loadCards().data.map((card) => card.originalName));
  const result = normalisePlaytestTsv(text, realNames);
  if (result.errors.length > 0) return playtestBadRequest('The TSV has errors', { errors: result.errors });
  if (result.cards === 0) return playtestBadRequest('The TSV holds no cards');

  const imageFiles = playtestImageFiles(result.tsv);
  const badNames = imageFiles.filter((name) => !isPlaytestImageFile(name));
  if (badNames.length > 0) return playtestBadRequest('An ImageFile may hold only letters, digits, _, - and .', { imageFiles: badNames });

  try {
    const store = getPlaytestAdminStore();
    const missing = await store.missingImages(imageFiles);
    if (missing.length > 0) return playtestBadRequest('The store has no image for some cards', { missingImages: missing });

    const { tsv: previous } = await store.readStatus();
    const named = new Set(imageFiles);
    const removeImages = (previous ? playtestImageFiles(previous) : [])
      .filter((name) => !named.has(name) && isPlaytestImageFile(name));
    const version = await store.publishCards(result.tsv, new Date().toISOString(), removeImages);
    return playtestAdminJson({ version, cards: result.cards, images: imageFiles.length, removedImages: removeImages.length });
  } catch (error) {
    return playtestUnreachable(error);
  }
}

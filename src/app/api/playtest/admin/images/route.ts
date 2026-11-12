import { callerEmail } from '../../../../../lib/callerEmail';
import { isPlaytestOwner } from '../../../../../lib/playtestAccess';
import { playtestAdminJson, playtestBadRequest, playtestNotFound, playtestUnreachable } from '../../../../../lib/playtestResponses';
import { getPlaytestAdminStore, isPlaytestImageFile, type PlaytestImage } from '../../../../../lib/playtestStore';
import { IMAGE_BATCH_MAX_IMAGES } from '../../../../../lib/playtestUpload';

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// One batch of the playtest images (#1613), `{ images: [{ imageFile, base64 }] }`, for an owner only.
// The page sends the images in batches under the 4.5 MB request limit of a Vercel function. It
// writes `playtest:img:<ImageFile>` and leaves the version alone: the cards route bumps it.
export async function POST(req: Request) {
  if (!isPlaytestOwner(await callerEmail(req))) return playtestNotFound();

  let images: PlaytestImage[];
  try {
    const body = await req.json();
    images = body?.images;
  } catch {
    return playtestBadRequest('The body must be JSON');
  }
  if (!Array.isArray(images) || images.length === 0 || images.length > IMAGE_BATCH_MAX_IMAGES) {
    return playtestBadRequest(`Send 1 to ${IMAGE_BATCH_MAX_IMAGES} images`);
  }
  for (const image of images) {
    if (typeof image?.imageFile !== 'string' || !isPlaytestImageFile(image.imageFile)) {
      return playtestBadRequest('An ImageFile may hold only letters, digits, _, - and .');
    }
    if (typeof image.base64 !== 'string' || !BASE64.test(image.base64)) {
      return playtestBadRequest(`The image ${image.imageFile} is not base64`);
    }
  }

  try {
    await getPlaytestAdminStore().writeImages(images.map(({ imageFile, base64 }) => ({ imageFile, base64 })));
  } catch (error) {
    return playtestUnreachable(error);
  }
  return playtestAdminJson({ written: images.length });
}

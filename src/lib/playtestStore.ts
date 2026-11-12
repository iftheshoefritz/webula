import { Redis } from '@upstash/redis';
import { SHARE_STORE_ENV_PAIRS, shareStoreCredentials } from './shareStore';

// The playtest cards of one playtest group (#1612), on the Upstash Redis database of the share
// links, with no TTL. Only the playtest routes read it, and only for a playtester, so no playtest
// card reaches anyone else. The upload (#1613) writes the images first, then the cards, then bumps
// the version, so a reader never sees a version whose cards or images are not there yet.

export const PLAYTEST_VERSION_KEY = 'playtest:version';
export const PLAYTEST_CARDS_KEY = 'playtest:cards';
export const PLAYTEST_EMAILS_KEY = 'playtest:emails';
// An ISO time, written with the version by the upload (#1613).
export const PLAYTEST_UPLOADED_AT_KEY = 'playtest:uploadedAt';
export const PLAYTEST_IMAGE_KEY_PREFIX = 'playtest:img:';

export function playtestImageKey(imageFile: string): string {
  return PLAYTEST_IMAGE_KEY_PREFIX + imageFile;
}

export { isPlaytestImageFile } from './playtestImageFile';

export interface PlaytestCards {
  version: number;
  tsv: string;
}

export interface PlaytestStore {
  /** The version and the cards, read together; `{ version: 0, tsv: '' }` before the first upload. */
  readCards(): Promise<PlaytestCards>;
  /** The base64 JPEG of one `ImageFile`, or null when the store has none. */
  readImage(imageFile: string): Promise<string | null>;
  /** Whether the lowercased email is in `playtest:emails`. */
  hasPlaytester(email: string): Promise<boolean>;
}

export interface PlaytestStatus extends PlaytestCards {
  /** The ISO time of the last upload, or null before the first. */
  uploadedAt: string | null;
}

export interface PlaytestImage {
  imageFile: string;
  base64: string;
}

/** The writes of the owner-only upload page (#1613). */
export interface PlaytestAdminStore extends PlaytestStore {
  /** The version, the time of the last upload and the cards, read together. */
  readStatus(): Promise<PlaytestStatus>;
  writeImages(images: PlaytestImage[]): Promise<void>;
  /** The `ImageFile`s of the list that the store holds no image of. */
  missingImages(imageFiles: string[]): Promise<string[]>;
  /**
   * Writes the cards, removes the images of `removeImages`, writes the upload time, and bumps the
   * version last, so a reader never sees the new version before its cards. Returns the new version.
   */
  publishCards(tsv: string, uploadedAt: string, removeImages: string[]): Promise<number>;
  listPlaytesters(): Promise<string[]>;
  addPlaytester(email: string): Promise<void>;
  removePlaytester(email: string): Promise<void>;
}

// The client must not deserialise: a TSV or a base64 string that happens to be valid JSON
// would come back as something else.
export function redisPlaytestStore(redis: Redis): PlaytestAdminStore {
  return {
    async readCards() {
      const [version, tsv] = await redis.mget<[string | null, string | null]>(PLAYTEST_VERSION_KEY, PLAYTEST_CARDS_KEY);
      const parsed = Number(version);
      return { version: Number.isFinite(parsed) ? parsed : 0, tsv: typeof tsv === 'string' ? tsv : '' };
    },
    async readImage(imageFile) {
      const image = await redis.get<string>(playtestImageKey(imageFile));
      return typeof image === 'string' ? image : null;
    },
    async hasPlaytester(email) {
      return (await redis.sismember(PLAYTEST_EMAILS_KEY, email)) === 1;
    },
    async readStatus() {
      const [version, uploadedAt, tsv] = await redis.mget<[string | null, string | null, string | null]>(
        PLAYTEST_VERSION_KEY, PLAYTEST_UPLOADED_AT_KEY, PLAYTEST_CARDS_KEY,
      );
      const parsed = Number(version);
      return {
        version: Number.isFinite(parsed) ? parsed : 0,
        uploadedAt: typeof uploadedAt === 'string' ? uploadedAt : null,
        tsv: typeof tsv === 'string' ? tsv : '',
      };
    },
    async writeImages(images) {
      if (images.length === 0) return;
      await redis.mset(Object.fromEntries(images.map(({ imageFile, base64 }) => [playtestImageKey(imageFile), base64])));
    },
    async missingImages(imageFiles) {
      if (imageFiles.length === 0) return [];
      // One request: EXISTS per key in a pipeline, so no image is read.
      const pipeline = redis.pipeline();
      imageFiles.forEach((imageFile) => pipeline.exists(playtestImageKey(imageFile)));
      const found = await pipeline.exec<number[]>();
      return imageFiles.filter((_, i) => Number(found[i]) !== 1);
    },
    async publishCards(tsv, uploadedAt, removeImages) {
      await redis.set(PLAYTEST_CARDS_KEY, tsv);
      if (removeImages.length > 0) await redis.del(...removeImages.map(playtestImageKey));
      await redis.set(PLAYTEST_UPLOADED_AT_KEY, uploadedAt);
      return redis.incr(PLAYTEST_VERSION_KEY);
    },
    async listPlaytesters() {
      return (await redis.smembers(PLAYTEST_EMAILS_KEY)).map(String).sort();
    },
    async addPlaytester(email) {
      await redis.sadd(PLAYTEST_EMAILS_KEY, email);
    },
    async removePlaytester(email) {
      await redis.srem(PLAYTEST_EMAILS_KEY, email);
    },
  };
}

let store: PlaytestAdminStore | null = null;

/** The store, made on first use so a missing env var fails the request, not the build. */
export function getPlaytestStore(): PlaytestStore {
  return getPlaytestAdminStore();
}

/** The same store with the writes of the upload page (#1613), for the owner-only admin routes. */
export function getPlaytestAdminStore(): PlaytestAdminStore {
  if (!store) {
    const credentials = shareStoreCredentials();
    if (!credentials) {
      throw new Error(
        `Playtest store not configured: set one of ${SHARE_STORE_ENV_PAIRS.map((p) => p.join(' + ')).join(', ')}`,
      );
    }
    store = redisPlaytestStore(new Redis({ ...credentials, automaticDeserialization: false }));
  }
  return store;
}

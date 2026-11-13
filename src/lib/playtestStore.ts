import { Redis } from '@upstash/redis';
import { SHARE_STORE_ENV_PAIRS, shareStoreCredentials } from './shareStore';
import { isPlaytestImageFile, isPlaytestSetName, playtestSetKey } from './playtestImageFile';
import { playtestImageFiles, setNameOfTsv } from './playtestUpload';

// The playtest sets in testing (#1612, #1644), on the Upstash Redis database of the share links,
// with no TTL. Only the playtest routes read it, and only for a playtester, so no playtest card
// reaches anyone else. Each set keeps its own keys under `playtest:set:<key>:`, where the key is
// the set's name lowercased, and `playtest:sets` lists the names of the sets in testing. The
// upload (#1613) writes the images first, then the cards, then bumps the version, and only then
// lists the set, so a reader never sees a version whose cards or images are not there yet.

export const PLAYTEST_EMAILS_KEY = 'playtest:emails';
// The index of the sets in testing: a Redis set of their names, as the owner wrote them.
export const PLAYTEST_SETS_KEY = 'playtest:sets';

// The keys of the single group of playtest cards before #1644, which the store moves to the set
// its TSV names on first use.
export const LEGACY_VERSION_KEY = 'playtest:version';
export const LEGACY_CARDS_KEY = 'playtest:cards';
export const LEGACY_UPLOADED_AT_KEY = 'playtest:uploadedAt';
export const LEGACY_IMAGE_KEY_PREFIX = 'playtest:img:';

const legacyImageKey = (imageFile: string) => LEGACY_IMAGE_KEY_PREFIX + imageFile;

/** The keys of one set: `playtest:set:<key>:version`, `…:uploadedAt`, `…:cards`, `…:img:<ImageFile>`. */
export function playtestSetKeys(setKey: string) {
  const prefix = `playtest:set:${setKey}:`;
  return {
    version: `${prefix}version`,
    uploadedAt: `${prefix}uploadedAt`,
    cards: `${prefix}cards`,
    image: (imageFile: string) => `${prefix}img:${imageFile}`,
  };
}

export { isPlaytestImageFile, isPlaytestSetName, playtestSetKey } from './playtestImageFile';

export interface PlaytestSet {
  /** The name lowercased: the key in the store, the URL and the `set` of the rows. */
  key: string;
  /** The name as the owner wrote it in the `Set` column. */
  name: string;
  version: number;
  tsv: string;
}

export interface PlaytestStore {
  /** Every set in testing, by name; none before the first upload. */
  readSets(): Promise<PlaytestSet[]>;
  /** The base64 JPEG of one `ImageFile` of a set in testing, or null when the store has none. */
  readImage(setKey: string, imageFile: string): Promise<string | null>;
  /** Whether the lowercased email is in `playtest:emails`. */
  hasPlaytester(email: string): Promise<boolean>;
}

export interface PlaytestSetStatus extends PlaytestSet {
  /** The ISO time of the last upload of the set. */
  uploadedAt: string | null;
}

export interface PlaytestStatus {
  sets: PlaytestSetStatus[];
  /** Why the keys of before #1644 could not move to a set, or null when there are none. */
  legacyError: string | null;
}

export interface PlaytestImage {
  imageFile: string;
  base64: string;
}

export interface PlaytestPublish {
  /** The `Set` of every row of the TSV. */
  name: string;
  tsv: string;
  uploadedAt: string;
  /** The key of the set in testing this upload replaces, or null for a new set. */
  replaces: string | null;
}

/** The writes of the owner-only upload page (#1613). */
export interface PlaytestAdminStore extends PlaytestStore {
  /** Every set in testing with its upload time, and the state of the migration. */
  readStatus(): Promise<PlaytestStatus>;
  writeImages(setKey: string, images: PlaytestImage[]): Promise<void>;
  /** The `ImageFile`s of the list that the store holds no image of in the set. */
  missingImages(setKey: string, imageFiles: string[]): Promise<string[]>;
  /**
   * Writes the cards and the upload time of the set, bumps its version, and only then lists it.
   * A replace of the same set keeps its version count and deletes only the images the new TSV no
   * longer names; a replace of another set removes that set after the new one is listed. Returns
   * the new version.
   */
  publishSet(publish: PlaytestPublish): Promise<number>;
  /** Removes a set in testing, its cards and its images. False when no such set is in testing. */
  removeSet(setKey: string): Promise<boolean>;
  listPlaytesters(): Promise<string[]>;
  addPlaytester(email: string): Promise<void>;
  removePlaytester(email: string): Promise<void>;
}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const asVersion = (value: unknown): number => {
  const parsed = Number(value);
  return value !== null && Number.isFinite(parsed) ? parsed : 0;
};

// The client must not deserialise: a TSV or a base64 string that happens to be valid JSON
// would come back as something else.
export function redisPlaytestStore(redis: Redis): PlaytestAdminStore {
  // Once the keys of before #1644 are gone they never come back, so the check stops.
  let legacyGone = false;

  // Moves the keys of before #1644 to the set their TSV names: the images (with COPY, on the
  // server), the cards, the time and the version, kept; then lists the set; then deletes the old
  // keys. Two requests that run it at once copy the same values, and a copy whose source is gone
  // writes nothing, so the second run finds either nothing to move or the same data.
  async function migrateLegacy(): Promise<string | null> {
    if (legacyGone) return null;
    const [version, uploadedAt, tsv] = await redis.mget<[string | null, string | null, string | null]>(
      LEGACY_VERSION_KEY, LEGACY_UPLOADED_AT_KEY, LEGACY_CARDS_KEY,
    );
    if (version === null && tsv === null) {
      legacyGone = true;
      return null;
    }
    const set = setNameOfTsv(asString(tsv) ?? '');
    if ('error' in set) return `The playtest cards stored before playtest sets could not move to a set: ${set.error}`;

    const key = playtestSetKey(set.name);
    const keys = playtestSetKeys(key);
    const images = playtestImageFiles(asString(tsv) ?? '').filter(isPlaytestImageFile);
    // A set of that name already listed is the work of a run that got there first: keep it.
    const listed = (await setNames()).has(key);
    if (!listed && images.length > 0) {
      const pipeline = redis.pipeline();
      images.forEach((imageFile) => pipeline.copy(legacyImageKey(imageFile), keys.image(imageFile), { replace: true }));
      await pipeline.exec();
    }
    if (!listed) {
      await redis.mset({
        [keys.cards]: asString(tsv) ?? '',
        [keys.version]: String(asVersion(version)),
        ...(uploadedAt !== null ? { [keys.uploadedAt]: String(uploadedAt) } : {}),
      });
      await redis.sadd(PLAYTEST_SETS_KEY, set.name);
    }
    await redis.del(LEGACY_VERSION_KEY, LEGACY_UPLOADED_AT_KEY, LEGACY_CARDS_KEY, ...images.map(legacyImageKey));
    legacyGone = true;
    return null;
  }

  async function setNames(): Promise<Map<string, string>> {
    const names = (await redis.smembers(PLAYTEST_SETS_KEY)).map(String).filter(isPlaytestSetName);
    return new Map(names.map((name) => [playtestSetKey(name), name]));
  }

  async function readAll(): Promise<PlaytestSetStatus[]> {
    const names = [...(await setNames())].sort(([a], [b]) => a.localeCompare(b));
    if (names.length === 0) return [];
    const values = await redis.mget<(string | null)[]>(
      ...names.flatMap(([key]) => {
        const keys = playtestSetKeys(key);
        return [keys.version, keys.uploadedAt, keys.cards];
      }),
    );
    return names.map(([key, name], i) => ({
      key,
      name,
      version: asVersion(values[3 * i]),
      uploadedAt: asString(values[3 * i + 1]),
      tsv: asString(values[3 * i + 2]) ?? '',
    }));
  }

  // Deletes the keys of a set that is no longer listed: its cards, time, version and images.
  async function deleteSetKeys(setKey: string, tsv: string) {
    const keys = playtestSetKeys(setKey);
    const images = playtestImageFiles(tsv).filter(isPlaytestImageFile).map(keys.image);
    await redis.del(keys.cards, keys.uploadedAt, keys.version, ...images);
  }

  return {
    async readSets() {
      await migrateLegacy();
      return (await readAll()).map(({ key, name, version, tsv }) => ({ key, name, version, tsv }));
    },
    async readImage(setKey, imageFile) {
      await migrateLegacy();
      const [names, image] = await redis.pipeline()
        .smembers(PLAYTEST_SETS_KEY)
        .get(playtestSetKeys(setKey).image(imageFile))
        .exec<[string[], string | null]>();
      if (!names.map(String).some((name) => playtestSetKey(name) === setKey)) return null;
      return asString(image);
    },
    async hasPlaytester(email) {
      return (await redis.sismember(PLAYTEST_EMAILS_KEY, email)) === 1;
    },
    async readStatus() {
      const legacyError = await migrateLegacy();
      return { sets: await readAll(), legacyError };
    },
    async writeImages(setKey, images) {
      if (images.length === 0) return;
      const keys = playtestSetKeys(setKey);
      await redis.mset(Object.fromEntries(images.map(({ imageFile, base64 }) => [keys.image(imageFile), base64])));
    },
    async missingImages(setKey, imageFiles) {
      if (imageFiles.length === 0) return [];
      // One request: EXISTS per key in a pipeline, so no image is read.
      const keys = playtestSetKeys(setKey);
      const pipeline = redis.pipeline();
      imageFiles.forEach((imageFile) => pipeline.exists(keys.image(imageFile)));
      const found = await pipeline.exec<number[]>();
      return imageFiles.filter((_, i) => Number(found[i]) !== 1);
    },
    async publishSet({ name, tsv, uploadedAt, replaces }) {
      await migrateLegacy();
      const key = playtestSetKey(name);
      const keys = playtestSetKeys(key);
      const names = await setNames();
      const previousName = names.get(key);
      // A re-upload of the set under its own name: drop only the images the new TSV no longer names.
      const previous = previousName !== undefined ? asString(await redis.get(keys.cards)) : null;
      await redis.set(keys.cards, tsv);
      if (previous) {
        const named = new Set(playtestImageFiles(tsv));
        const dropped = playtestImageFiles(previous).filter((f) => !named.has(f) && isPlaytestImageFile(f));
        if (dropped.length > 0) await redis.del(...dropped.map(keys.image));
      }
      await redis.set(keys.uploadedAt, uploadedAt);
      const version = await redis.incr(keys.version);
      await redis.sadd(PLAYTEST_SETS_KEY, name);
      if (previousName !== undefined && previousName !== name) await redis.srem(PLAYTEST_SETS_KEY, previousName);

      const replacedName = replaces !== null && replaces !== key ? names.get(replaces) : undefined;
      if (replacedName !== undefined) {
        const replacedTsv = asString(await redis.get(playtestSetKeys(replaces!).cards)) ?? '';
        await redis.srem(PLAYTEST_SETS_KEY, replacedName);
        await deleteSetKeys(replaces!, replacedTsv);
      }
      return version;
    },
    async removeSet(setKey) {
      await migrateLegacy();
      const name = (await setNames()).get(setKey);
      if (name === undefined) return false;
      const tsv = asString(await redis.get(playtestSetKeys(setKey).cards)) ?? '';
      await redis.srem(PLAYTEST_SETS_KEY, name);
      await deleteSetKeys(setKey, tsv);
      return true;
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

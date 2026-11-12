import { Redis } from '@upstash/redis';
import { SHARE_STORE_ENV_PAIRS, shareStoreCredentials } from './shareStore';

// The playtest cards of one playtest group (#1612), on the Upstash Redis database of the share
// links, with no TTL. Only the playtest routes read it, and only for a playtester, so no playtest
// card reaches anyone else. The upload (#1613) writes the images first, then the cards, then bumps
// the version, so a reader never sees a version whose cards or images are not there yet.

export const PLAYTEST_VERSION_KEY = 'playtest:version';
export const PLAYTEST_CARDS_KEY = 'playtest:cards';
export const PLAYTEST_EMAILS_KEY = 'playtest:emails';
// An ISO time, written with the version by the upload; read nowhere yet.
export const PLAYTEST_UPLOADED_AT_KEY = 'playtest:uploadedAt';
export const PLAYTEST_IMAGE_KEY_PREFIX = 'playtest:img:';

export function playtestImageKey(imageFile: string): string {
  return PLAYTEST_IMAGE_KEY_PREFIX + imageFile;
}

// An `ImageFile` the store could hold: letters, digits, `_`, `-` and `.`, and no `..`.
const IMAGE_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/;

/** An `ImageFile` the store could hold. Anything else is not there, and is not looked up. */
export function isPlaytestImageFile(imageFile: string): boolean {
  return IMAGE_FILE_PATTERN.test(imageFile) && !imageFile.includes('..');
}

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

// The client must not deserialise: a TSV or a base64 string that happens to be valid JSON
// would come back as something else.
export function redisPlaytestStore(redis: Redis): PlaytestStore {
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
  };
}

let store: PlaytestStore | null = null;

/** The store, made on first use so a missing env var fails the request, not the build. */
export function getPlaytestStore(): PlaytestStore {
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

import { randomInt } from 'crypto';
import { Redis } from '@upstash/redis';

// The store behind `/api/share` (#1445): Upstash Redis, which the Vercel Marketplace
// integration connects to the project. The integration names its env vars with the
// prefix chosen when the store was connected: Webula's store uses `SHARES`, so the
// pair is SHARES_KV_REST_API_URL and SHARES_KV_REST_API_TOKEN. The unprefixed names
// are a fallback.

// A share lives 30 days, then the store drops it (#1445).
export const SHARE_TTL_SECONDS = 30 * 24 * 60 * 60;

// Enough for a bulk import of many decks from the trekcc.org bookmarklet.
export const MAX_CONTENT_BYTES = 256 * 1024;

// 10 characters of 62 give about 60 bits: short in a link, too many to guess.
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 10;
const ID_PATTERN = /^[A-Za-z0-9]{1,32}$/;

/** An id the store could hold. Anything else is not there, and is not looked up. */
export function isShareId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function newShareId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return id;
}

export interface Share {
  content: string;
  title: string | null;
  createdAt: string;
}

export interface ShareStore {
  /** Writes the share under `id` unless the id is taken. Answers false when it is. */
  create(id: string, share: Share, ttlSeconds: number): Promise<boolean>;
  /** The share under `id`, or null when there is none or it expired. */
  read(id: string): Promise<Share | null>;
}

const KEY_PREFIX = 'share:';

export function redisShareStore(redis: Redis): ShareStore {
  return {
    async create(id, share, ttlSeconds) {
      const result = await redis.set(KEY_PREFIX + id, share, { nx: true, ex: ttlSeconds });
      return result === 'OK';
    },
    async read(id) {
      return (await redis.get<Share>(KEY_PREFIX + id)) ?? null;
    },
  };
}

// Each pair is a URL and a token, tried in order.
export const SHARE_STORE_ENV_PAIRS: readonly (readonly [string, string])[] = [
  ['SHARES_KV_REST_API_URL', 'SHARES_KV_REST_API_TOKEN'],
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
];

/** The URL and token of the first pair that has both set, or null. */
export function shareStoreCredentials(
  env: Record<string, string | undefined> = process.env,
): { url: string; token: string } | null {
  for (const [urlName, tokenName] of SHARE_STORE_ENV_PAIRS) {
    const url = env[urlName];
    const token = env[tokenName];
    if (url && token) return { url, token };
  }
  return null;
}

let store: ShareStore | null = null;

/** The store, made on first use so a missing env var fails the request, not the build. */
export function getShareStore(): ShareStore {
  if (!store) {
    const credentials = shareStoreCredentials();
    if (!credentials) {
      throw new Error(
        `Share store not configured: set one of ${SHARE_STORE_ENV_PAIRS.map((p) => p.join(' + ')).join(', ')}`,
      );
    }
    store = redisShareStore(new Redis(credentials));
  }
  return store;
}

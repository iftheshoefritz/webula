import { randomInt } from 'crypto';
import { Redis } from '@upstash/redis';

// The store behind `/api/share` (#1445): Upstash Redis, which the Vercel Marketplace
// integration connects to the project. `Redis.fromEnv()` reads
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or the KV_REST_API_URL and
// KV_REST_API_TOKEN that the older Vercel KV naming uses.

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

let store: ShareStore | null = null;

/** The store, made on first use so a missing env var fails the request, not the build. */
export function getShareStore(): ShareStore {
  if (!store) store = redisShareStore(Redis.fromEnv());
  return store;
}

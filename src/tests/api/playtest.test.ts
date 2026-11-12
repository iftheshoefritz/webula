/**
 * @jest-environment node
 */

// Every card row, name and image here is invented: no test or fixture holds a real playtest card.

import type { Redis } from '@upstash/redis';

const mockGetToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));
jest.mock('../../lib/playtestStore', () => ({
  ...jest.requireActual('../../lib/playtestStore'),
  getPlaytestStore: jest.fn(),
}));

import { GET as getCards } from '../../app/api/playtest/cards/route';
import { GET as getImage } from '../../app/api/playtest/images/[file]/route';
import { isPlaytestOwner, playtestOwnerEmails } from '../../lib/playtestAccess';
import {
  getPlaytestStore,
  isPlaytestImageFile,
  PLAYTEST_CARDS_KEY,
  PLAYTEST_EMAILS_KEY,
  PLAYTEST_UPLOADED_AT_KEY,
  PLAYTEST_VERSION_KEY,
  playtestImageKey,
  redisPlaytestStore,
  type PlaytestStore,
} from '../../lib/playtestStore';

const TSV = 'Name\tType\nInvented Card\tEvent\n';
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

function memoryStore(opts: { version?: number; tsv?: string; images?: Record<string, string>; emails?: string[] } = {}) {
  const calls: string[] = [];
  const store: PlaytestStore = {
    async readCards() {
      calls.push('readCards');
      return { version: opts.version ?? 0, tsv: opts.tsv ?? '' };
    },
    async readImage(imageFile) {
      calls.push(`readImage:${imageFile}`);
      return opts.images?.[imageFile] ?? null;
    },
    async hasPlaytester(email) {
      calls.push(`hasPlaytester:${email}`);
      return (opts.emails ?? []).includes(email);
    },
  };
  return { store, calls };
}

const failingStore: PlaytestStore = {
  readCards: async () => { throw new Error('connect ECONNREFUSED'); },
  readImage: async () => { throw new Error('connect ECONNREFUSED'); },
  hasPlaytester: async () => { throw new Error('connect ECONNREFUSED'); },
};

const mockGetPlaytestStore = getPlaytestStore as jest.MockedFunction<typeof getPlaytestStore>;
let calls: string[];

function useStore(opts: Parameters<typeof memoryStore>[0]) {
  const made = memoryStore(opts);
  calls = made.calls;
  mockGetPlaytestStore.mockReturnValue(made.store);
}

const cardsRequest = () => getCards(new Request('http://localhost/api/playtest/cards'));
const imageRequest = (file: string, query = '') =>
  getImage(new Request(`http://localhost/api/playtest/images/${file}${query}`), { params: Promise.resolve({ file }) });

function signIn(email: string | null) {
  mockGetToken.mockResolvedValue(email ? { email } : null);
}

function expectPrivateNoindex(response: Response) {
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  expect(response.headers.get('Cache-Control')).toMatch(/^private\b/);
  expect(response.headers.get('Cache-Control')).not.toMatch(/public/);
}

const stored = {
  version: 3,
  tsv: TSV,
  images: { InventedCard: Buffer.from(IMAGE_BYTES).toString('base64') },
  emails: ['tester@example.com'],
};

describe('playtest routes (#1612)', () => {
  const original = process.env.PLAYTEST_ADMIN_EMAILS;
  beforeEach(() => {
    process.env.PLAYTEST_ADMIN_EMAILS = ' Owner@Example.com , ,second@example.com';
    mockGetToken.mockReset();
    mockGetPlaytestStore.mockReset();
    useStore(stored);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { process.env.PLAYTEST_ADMIN_EMAILS = original; });

  it('gives a playtester the version and the cards, private and no-cache', async () => {
    signIn('Tester@Example.com');
    const response = await cardsRequest();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 3, tsv: TSV });
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
    expectPrivateNoindex(response);
    expect(calls).toContain('hasPlaytester:tester@example.com');
  });

  it('gives a playtester { version: 0, tsv: "" } before the first upload', async () => {
    useStore({ emails: ['tester@example.com'] });
    signIn('tester@example.com');
    const response = await cardsRequest();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 0, tsv: '' });
  });

  it('gives an owner the cards without a set lookup, in any case and with spaces', async () => {
    signIn('OWNER@example.COM');
    const response = await cardsRequest();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 3, tsv: TSV });
    expect(calls.some((c) => c.startsWith('hasPlaytester'))).toBe(false);
  });

  it('answers 404 to a signed-out caller, a bad token and a non-playtester', async () => {
    for (const setUp of [() => signIn(null), () => mockGetToken.mockRejectedValue(new Error('bad')), () => signIn('other@example.com')]) {
      setUp();
      const cards = await cardsRequest();
      expect(cards.status).toBe(404);
      expect(await cards.text()).toBe('Not found');
      expectPrivateNoindex(cards);
      const image = await imageRequest('InventedCard.jpg');
      expect(image.status).toBe(404);
      expectPrivateNoindex(image);
    }
    expect(calls.filter((c) => c.startsWith('read'))).toEqual([]);
  });

  it('gives a playtester an image as JPEG bytes, cached for good, and ignores ?v=', async () => {
    signIn('tester@example.com');
    for (const query of ['', '?v=3', '?v=99']) {
      const response = await imageRequest('InventedCard.jpg', query);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
      expect(response.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
      expectPrivateNoindex(response);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(IMAGE_BYTES);
    }
  });

  it('answers 404 to an unknown image', async () => {
    signIn('tester@example.com');
    const response = await imageRequest('NoSuchCard.jpg');
    expect(response.status).toBe(404);
    expectPrivateNoindex(response);
    expect(calls).toContain('readImage:NoSuchCard');
  });

  it('answers 404 to a malformed image name with no store call', async () => {
    signIn('tester@example.com');
    for (const file of ['InventedCard.png', 'InventedCard', '.jpg', '..%2Fx.jpg', 'a..b.jpg', 'a b.jpg', 'a*.jpg', 'a:b.jpg']) {
      expect((await imageRequest(file)).status).toBe(404);
    }
    expect(calls).toEqual([]);
    expect(mockGetPlaytestStore).not.toHaveBeenCalled();
  });

  it('answers 502 with upstream_unreachable when the store fails', async () => {
    mockGetPlaytestStore.mockReturnValue(failingStore);
    signIn('tester@example.com');
    for (const response of [await cardsRequest(), await imageRequest('InventedCard.jpg')]) {
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'Playtest service unreachable', code: 'upstream_unreachable' });
      expectPrivateNoindex(response);
    }
    // An owner's image read fails the same way once the set is not needed.
    signIn('owner@example.com');
    expect((await imageRequest('InventedCard.jpg')).status).toBe(502);
  });

  it('answers 502 when the store is not configured', async () => {
    mockGetPlaytestStore.mockImplementation(() => { throw new Error('Playtest store not configured'); });
    signIn('tester@example.com');
    expect((await cardsRequest()).status).toBe(502);
  });
});

describe('playtest owners', () => {
  it('parses PLAYTEST_ADMIN_EMAILS', () => {
    expect(playtestOwnerEmails({ PLAYTEST_ADMIN_EMAILS: ' A@x.com,, b@y.com ' })).toEqual(['a@x.com', 'b@y.com']);
    expect(playtestOwnerEmails({})).toEqual([]);
  });

  it('reads the env var at call time', () => {
    const original = process.env.PLAYTEST_ADMIN_EMAILS;
    process.env.PLAYTEST_ADMIN_EMAILS = 'owner@example.com';
    expect(isPlaytestOwner('Owner@example.com')).toBe(true);
    expect(isPlaytestOwner(null)).toBe(false);
    process.env.PLAYTEST_ADMIN_EMAILS = '';
    expect(isPlaytestOwner('owner@example.com')).toBe(false);
    process.env.PLAYTEST_ADMIN_EMAILS = original;
  });
});

describe('isPlaytestImageFile', () => {
  it('takes letters, digits, _, - and . only', () => {
    expect(isPlaytestImageFile('PT001_front')).toBe(true);
    expect(isPlaytestImageFile('pt-1.2')).toBe(true);
    for (const bad of ['', '.hidden', 'a/b', 'a..b', 'a b', 'x'.repeat(200)]) expect(isPlaytestImageFile(bad)).toBe(false);
  });
});

describe('redisPlaytestStore', () => {
  function stubRedis(values: Record<string, string>, members: string[]) {
    const read: string[] = [];
    const redis = {
      mget: async (...keys: string[]) => { read.push(...keys); return keys.map((k) => values[k] ?? null); },
      get: async (key: string) => { read.push(key); return values[key] ?? null; },
      sismember: async (key: string, member: string) => { read.push(`${key}:${member}`); return members.includes(member) ? 1 : 0; },
    };
    return { redis: redis as unknown as Redis, read };
  }

  it('pins the key names', () => {
    expect([PLAYTEST_VERSION_KEY, PLAYTEST_CARDS_KEY, PLAYTEST_EMAILS_KEY, PLAYTEST_UPLOADED_AT_KEY, playtestImageKey('X1')])
      .toEqual(['playtest:version', 'playtest:cards', 'playtest:emails', 'playtest:uploadedAt', 'playtest:img:X1']);
  });

  it('reads the version and the cards in one call, and an image and the set by key', async () => {
    const { redis, read } = stubRedis(
      { 'playtest:version': '7', 'playtest:cards': '{"looks":"like json"}', 'playtest:img:X1': 'AAAA' },
      ['a@x.com'],
    );
    const store = redisPlaytestStore(redis);
    expect(await store.readCards()).toEqual({ version: 7, tsv: '{"looks":"like json"}' });
    expect(await store.readImage('X1')).toBe('AAAA');
    expect(await store.readImage('X2')).toBeNull();
    expect(await store.hasPlaytester('a@x.com')).toBe(true);
    expect(await store.hasPlaytester('b@x.com')).toBe(false);
    expect(read).toEqual([
      'playtest:version', 'playtest:cards', 'playtest:img:X1', 'playtest:img:X2',
      'playtest:emails:a@x.com', 'playtest:emails:b@x.com',
    ]);
  });

  it('reads an empty store as version 0 and no cards', async () => {
    const { redis } = stubRedis({}, []);
    expect(await redisPlaytestStore(redis).readCards()).toEqual({ version: 0, tsv: '' });
  });
});

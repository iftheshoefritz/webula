/**
 * @jest-environment node
 */

// Every card row, name and image here is invented: no test or fixture holds a real playtest card.

const mockGetToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));
jest.mock('../../lib/playtestStore', () => ({
  ...jest.requireActual('../../lib/playtestStore'),
  getPlaytestStore: jest.fn(),
}));

import { GET as getCards } from '../../app/api/playtest/cards/route';
import { GET as getImage } from '../../app/api/playtest/images/[set]/[file]/route';
import { isPlaytestOwner, playtestOwnerEmails } from '../../lib/playtestAccess';
import { getPlaytestStore, isPlaytestImageFile, isPlaytestSetName, type PlaytestStore } from '../../lib/playtestStore';

const TSV = 'Name\tType\nInvented Card\tEvent\n';
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

type MemorySet = { name: string; version: number; tsv: string; images: Record<string, string> };

function memoryStore(opts: { sets?: MemorySet[]; emails?: string[] } = {}) {
  const calls: string[] = [];
  const sets = opts.sets ?? [];
  const store: PlaytestStore = {
    async readSets() {
      calls.push('readSets');
      return sets.map(({ name, version, tsv }) => ({ key: name.toLowerCase(), name, version, tsv }));
    },
    async readImage(setKey, imageFile) {
      calls.push(`readImage:${setKey}/${imageFile}`);
      return sets.find((set) => set.name.toLowerCase() === setKey)?.images[imageFile] ?? null;
    },
    async hasPlaytester(email) {
      calls.push(`hasPlaytester:${email}`);
      return (opts.emails ?? []).includes(email);
    },
  };
  return { store, calls };
}

const failingStore: PlaytestStore = {
  readSets: async () => { throw new Error('connect ECONNREFUSED'); },
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
const imageRequest = (file: string, query = '', set = 'testseta') =>
  getImage(new Request(`http://localhost/api/playtest/images/${set}/${file}${query}`), { params: Promise.resolve({ set, file }) });

function signIn(email: string | null) {
  mockGetToken.mockResolvedValue(email ? { email } : null);
}

function expectPrivateNoindex(response: Response) {
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  expect(response.headers.get('Cache-Control')).toMatch(/^private\b/);
  expect(response.headers.get('Cache-Control')).not.toMatch(/public/);
}

const TSV_B = 'Name\tType\nInvented Other\tEvent\n';
const stored: { sets: MemorySet[]; emails: string[] } = {
  sets: [
    { name: 'TestSetA', version: 3, tsv: TSV, images: { InventedCard: Buffer.from(IMAGE_BYTES).toString('base64') } },
    { name: 'TestSetB', version: 1, tsv: TSV_B, images: {} },
  ],
  emails: ['tester@example.com'],
};
const SETS_ANSWER = { sets: [{ name: 'TestSetA', version: 3, tsv: TSV }, { name: 'TestSetB', version: 1, tsv: TSV_B }] };

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

  it('gives a playtester every set in testing, its name, version and cards, private and no-cache', async () => {
    signIn('Tester@Example.com');
    const response = await cardsRequest();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SETS_ANSWER);
    expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
    expectPrivateNoindex(response);
    expect(calls).toContain('hasPlaytester:tester@example.com');
  });

  it('gives a playtester { sets: [] } before the first upload', async () => {
    useStore({ emails: ['tester@example.com'] });
    signIn('tester@example.com');
    const response = await cardsRequest();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sets: [] });
  });

  it('gives an owner the cards without a set lookup, in any case and with spaces', async () => {
    signIn('OWNER@example.COM');
    const response = await cardsRequest();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SETS_ANSWER);
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

  it('answers 404 to an unknown image, an image of another set, and a set not in testing', async () => {
    signIn('tester@example.com');
    for (const [file, set] of [['NoSuchCard.jpg', 'testseta'], ['InventedCard.jpg', 'testsetb'], ['InventedCard.jpg', 'testsetc']]) {
      const response = await imageRequest(file, '', set);
      expect(response.status).toBe(404);
      expectPrivateNoindex(response);
    }
    expect(calls).toContain('readImage:testseta/NoSuchCard');
    expect(calls).toContain('readImage:testsetc/InventedCard');
  });

  it('answers 404 to a malformed image name or set with no store call', async () => {
    signIn('tester@example.com');
    for (const file of ['InventedCard.png', 'InventedCard', '.jpg', '..%2Fx.jpg', 'a..b.jpg', 'a b.jpg', 'a*.jpg', 'a:b.jpg']) {
      expect((await imageRequest(file)).status).toBe(404);
    }
    // The set is the key, lowercased, of a name the store could hold.
    for (const set of ['TestSetA', '..', '.hidden', 'a b', 'a:b', '']) {
      expect((await imageRequest('InventedCard.jpg', '', set)).status).toBe(404);
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

describe('isPlaytestSetName (#1644)', () => {
  it('takes letters, digits, _, - and ., from a letter or a digit', () => {
    for (const good of ['TestSetA', 'testset-b', 'Set_2.1', '9Missions']) expect(isPlaytestSetName(good)).toBe(true);
    for (const bad of ['', '.hidden', '-x', 'a/b', 'a..b', 'a b', 'a:b', 'x'.repeat(65)]) expect(isPlaytestSetName(bad)).toBe(false);
  });
});

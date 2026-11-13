/**
 * @jest-environment node
 */

// Every set, card row, name, image and email here is invented: no test holds a real playtest card.

const mockGetToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));
jest.mock('../../lib/playtestStore', () => ({
  ...jest.requireActual('../../lib/playtestStore'),
  getPlaytestStore: jest.fn(),
  getPlaytestAdminStore: jest.fn(),
}));
jest.mock('../../lib/loadCards', () => ({
  loadCards: () => ({ data: [{ originalName: 'A Real Card Name' }], columns: [] }),
}));

import { POST as postCards } from '../../app/api/playtest/admin/cards/route';
import { DELETE as deleteEmail, GET as getEmails, POST as postEmail } from '../../app/api/playtest/admin/emails/route';
import { POST as postImages } from '../../app/api/playtest/admin/images/route';
import { DELETE as deleteSet } from '../../app/api/playtest/admin/sets/route';
import { GET as getStatus } from '../../app/api/playtest/admin/status/route';
import { PLAYTEST_COLUMNS, normalisePlaytestTsv } from '../../lib/playtestCards';
import {
  getPlaytestAdminStore,
  getPlaytestStore,
  PLAYTEST_EMAILS_KEY,
  playtestSetKeys,
  redisPlaytestStore,
  type PlaytestAdminStore,
} from '../../lib/playtestStore';
import { fakeRedis, type FakeRedis } from '../fixtures/fakeRedis';

const OWNER = 'owner@example.com';

function row(name: string, collectorsInfo: string, imageFile: string, set = 'TestSetA', type = 'Event'): string {
  const fields: Record<string, string> = Object.fromEntries(PLAYTEST_COLUMNS.map((c) => [c, '']));
  Object.assign(fields, { Name: name, Set: set, ImageFile: imageFile, CollectorsInfo: collectorsInfo, Type: type });
  return PLAYTEST_COLUMNS.map((c) => fields[c]).join('\t');
}
const tsvOf = (...rows: string[]) => [PLAYTEST_COLUMNS.join('\t'), ...rows].join('\n');
const normalised = (text: string) => normalisePlaytestTsv(text, new Set()).tsv;

const GOOD_TSV = tsvOf(row('Invented Event One', '9101', 'PT9101'), row('Invented Event Two', '9102', 'PT9102'));
const OLD_TSV = normalised(tsvOf(row('Invented Old', '9100', 'PT9100'), row('Invented Event One', '9101', 'PT9101')));
const B_TSV = normalised(tsvOf(row('Invented B One', '9201', 'PT9201', 'TestSetB')));
const A = playtestSetKeys('testseta');
const B = playtestSetKeys('testsetb');
const TIME = '2026-01-01T00:00:00.000Z';

const mockAdminStore = getPlaytestAdminStore as jest.MockedFunction<typeof getPlaytestAdminStore>;
const mockReadStore = getPlaytestStore as jest.MockedFunction<typeof getPlaytestStore>;
let fake: FakeRedis;

// The real store on an in-memory Redis that holds the sets of `opts`, already published.
function useStore(opts: { sets?: Record<string, { version: number; tsv: string; images?: string[] }>; images?: Record<string, string[]>; emails?: string[]; fail?: boolean } = {}) {
  const strings: Record<string, string> = {};
  const names: string[] = [];
  for (const [name, set] of Object.entries(opts.sets ?? {})) {
    const keys = playtestSetKeys(name.toLowerCase());
    names.push(name);
    Object.assign(strings, { [keys.version]: String(set.version), [keys.uploadedAt]: TIME, [keys.cards]: set.tsv });
    (set.images ?? []).forEach((image) => { strings[keys.image(image)] = 'AAAA'; });
  }
  for (const [key, images] of Object.entries(opts.images ?? {})) {
    images.forEach((image) => { strings[playtestSetKeys(key).image(image)] = 'AAAA'; });
  }
  fake = fakeRedis(strings, { 'playtest:sets': names, [PLAYTEST_EMAILS_KEY]: opts.emails ?? [] });
  let store: PlaytestAdminStore = redisPlaytestStore(fake.redis);
  if (opts.fail) {
    store = Object.fromEntries(Object.keys(store).map((k) => [k, async () => { throw new Error('connect ECONNREFUSED'); }])) as unknown as PlaytestAdminStore;
  }
  mockAdminStore.mockReturnValue(store);
  mockReadStore.mockReturnValue(store);
  fake.log.length = 0;
  return store;
}

// The writes the in-memory Redis saw since `useStore`.
const writes = () => fake.log.filter((c) => /^(set|mset|del|incr|sadd|srem|copy) /.test(c));

function signIn(email: string | null) {
  mockGetToken.mockResolvedValue(email ? { email } : null);
}

const url = (path: string) => `http://localhost/api/playtest/admin/${path}`;
const jsonBody = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const IMAGE = { imageFile: 'PT9101', base64: 'AAAA' };
const cards = (body: string, replace?: string) =>
  postCards(new Request(url(`cards${replace === undefined ? '' : `?replace=${replace}`}`), { method: 'POST', body }));

const requests: [string, () => Promise<Response>][] = [
  ['GET status', () => getStatus(new Request(url('status')))],
  ['POST images', () => postImages(new Request(url('images'), jsonBody('POST', { set: 'TestSetA', images: [IMAGE] })))],
  ['POST cards', () => cards(GOOD_TSV)],
  ['DELETE sets', () => deleteSet(new Request(url('sets'), jsonBody('DELETE', { name: 'TestSetA' })))],
  ['GET emails', () => getEmails(new Request(url('emails')))],
  ['POST emails', () => postEmail(new Request(url('emails'), jsonBody('POST', { email: 'new@example.com' })))],
  ['DELETE emails', () => deleteEmail(new Request(url('emails'), jsonBody('DELETE', { email: 'old@example.com' })))],
];

beforeEach(() => {
  process.env.PLAYTEST_ADMIN_EMAILS = `${OWNER}, other.owner@example.com`;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.PLAYTEST_ADMIN_EMAILS;
  jest.restoreAllMocks();
});

describe('the playtest admin routes: who may call them', () => {
  const callers: [string, string | null][] = [
    ['a signed-out caller', null],
    ['a signed-in caller who is not an owner', 'someone@example.com'],
    ['a playtester who is not an owner', 'tester@example.com'],
  ];
  for (const [who, email] of callers) {
    for (const [name, request] of requests) {
      it(`answers 404 to ${who}: ${name}, and writes nothing`, async () => {
        useStore({ emails: ['tester@example.com', 'old@example.com'], images: { testseta: ['PT9101', 'PT9102'] } });
        signIn(email);
        const response = await request();
        expect(response.status).toBe(404);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
        expect(await response.text()).toBe('Not found');
        expect(fake.log).toEqual([]);
      });
    }
  }

  it('lets an owner in whatever the case of the email', async () => {
    useStore();
    signIn('Owner@Example.com');
    expect((await getStatus(new Request(url('status')))).status).toBe(200);
  });
});

describe('the playtest admin routes: an owner', () => {
  beforeEach(() => signIn(OWNER));

  it('reads the status of every set, counting the cards and the images from the stored TSV', async () => {
    useStore({ sets: { TestSetA: { version: 2, tsv: OLD_TSV }, TestSetB: { version: 5, tsv: B_TSV } }, emails: ['b@example.com', 'a@example.com'] });
    const response = await getStatus(new Request(url('status')));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      sets: [
        {
          name: 'TestSetA', version: 2, uploadedAt: TIME, cards: 2, images: 2,
          cardNames: ['Invented Old', 'Invented Event One'], collectorsInfo: ['9100', '9101'],
        },
        { name: 'TestSetB', version: 5, uploadedAt: TIME, cards: 1, images: 1, cardNames: ['Invented B One'], collectorsInfo: ['9201'] },
      ],
      legacyError: null,
      emails: ['a@example.com', 'b@example.com'],
    });
  });

  it('writes a batch of images under its set and leaves the version alone', async () => {
    useStore();
    const response = await postImages(new Request(url('images'), jsonBody('POST', {
      set: 'TestSetA',
      images: [IMAGE, { imageFile: 'PT9102', base64: 'BBBB' }],
    })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ written: 2 });
    expect(writes()).toEqual([`mset ${A.image('PT9101')} ${A.image('PT9102')}`]);
  });

  it.each([
    ['a name with a path', { set: 'TestSetA', images: [{ imageFile: '../secret', base64: 'AAAA' }] }],
    ['a name with a colon', { set: 'TestSetA', images: [{ imageFile: 'a:b', base64: 'AAAA' }] }],
    ['a body that is not base64', { set: 'TestSetA', images: [{ imageFile: 'PT9101', base64: 'not base64!' }] }],
    ['no set', { images: [IMAGE] }],
    ['a set with a colon', { set: 'a:b', images: [IMAGE] }],
  ])('rejects %s and writes nothing', async (_, body) => {
    useStore();
    const response = await postImages(new Request(url('images'), jsonBody('POST', body)));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('bad_request');
    expect(fake.log).toEqual([]);
  });

  it('writes nothing for a TSV with an error', async () => {
    useStore({ images: { testseta: ['PT9101', 'PT9103'] } });
    const bad = tsvOf(row('Invented Event One', '9101', 'PT9101'), row('A Real Card Name', '9103', 'PT9103'));
    const response = await cards(bad);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('bad_request');
    expect(body.errors[0].message).toBe('The name is the name of a real card');
    expect(writes()).toEqual([]);
  });

  it('writes nothing when the store lacks an image the TSV names under its set', async () => {
    useStore({ images: { testseta: ['PT9101'], testsetb: ['PT9102'] } });
    const response = await cards(GOOD_TSV);
    expect(response.status).toBe(400);
    expect((await response.json()).missingImages).toEqual(['PT9102']);
    expect(writes()).toEqual([]);
  });

  it('publishes a new set: the cards, the time, the version, and then the index', async () => {
    useStore({ sets: { TestSetB: { version: 4, tsv: B_TSV } }, images: { testseta: ['PT9101', 'PT9102'] } });
    const response = await cards(GOOD_TSV);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ set: 'TestSetA', version: 1, cards: 2, images: 2 });
    expect(writes()).toEqual([`set ${A.cards}`, `set ${A.uploadedAt}`, `incr ${A.version}`, 'sadd playtest:sets TestSetA']);
    const status = await (await getStatus(new Request(url('status')))).json();
    expect(status.sets.map((set: { name: string; version: number }) => [set.name, set.version])).toEqual([['TestSetA', 1], ['TestSetB', 4]]);
  });

  it('replaces a set under its own name: bumps its version, and deletes only the images it no longer names', async () => {
    useStore({ sets: { TestSetA: { version: 2, tsv: OLD_TSV, images: ['PT9100', 'PT9101'] } }, images: { testseta: ['PT9102'] } });
    const response = await cards(GOOD_TSV, 'TestSetA');
    expect(response.status).toBe(200);
    expect((await response.json()).version).toBe(3);
    expect(writes()).toEqual([
      `set ${A.cards}`, `del ${A.image('PT9100')}`, `set ${A.uploadedAt}`, `incr ${A.version}`, 'sadd playtest:sets TestSetA',
    ]);
  });

  it('replaces A with B: B is listed, then A, its cards and its images go', async () => {
    useStore({ sets: { TestSetA: { version: 2, tsv: OLD_TSV, images: ['PT9100', 'PT9101'] } }, images: { testsetb: ['PT9301'] } });
    const next = tsvOf(row('Invented Event One', '9101', 'PT9301', 'TestSetB'));
    const response = await cards(next, 'TestSetA');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ set: 'TestSetB', version: 1, cards: 1, images: 1 });
    expect(writes()).toEqual([
      `set ${B.cards}`, `set ${B.uploadedAt}`, `incr ${B.version}`, 'sadd playtest:sets TestSetB',
      'srem playtest:sets TestSetA',
      `del ${A.cards} ${A.uploadedAt} ${A.version} ${A.image('PT9100')} ${A.image('PT9101')}`,
    ]);
  });

  it.each([
    ['a new set whose name is in testing', GOOD_TSV, undefined, /already in testing/],
    ['a replace of a set not in testing', tsvOf(row('Invented Event One', '9101', 'PT9101', 'TestSetC')), 'TestSetD', /TestSetD is not in testing/],
    ['a replace whose new name is another set in testing', tsvOf(row('Invented New', '9301', 'PT9101', 'TestSetB')), 'TestSetA', /TestSetB is already in testing/],
    ['rows with two Set values', tsvOf(row('Invented X', '9301', 'PT9101'), row('Invented Y', '9302', 'PT9102', 'TestSetC')), undefined, /more than one Set/],
    ['rows with no Set', tsvOf(row('Invented X', '9301', 'PT9101', '')), undefined, /no Set/],
    ['a Set with a space', tsvOf(row('Invented X', '9301', 'PT9101', 'Test Set')), undefined, /letters, digits/],
    ['a set named as a real set', tsvOf(row('Invented X', '9301', 'PT9101', 'Ph')), undefined, /a real set/],
    ['a set named playtest', tsvOf(row('Invented X', '9301', 'PT9101', 'Playtest')), undefined, /a real set/],
    ['a card name of another set in testing', tsvOf(row('Invented B One', '9301', 'PT9101', 'TestSetC')), undefined, /playtest set TestSetB/],
    ['a CollectorsInfo of another set in testing', tsvOf(row('Invented New', '09201', 'PT9101', 'TestSetC')), undefined, /playtest set TestSetB/],
  ])('rejects %s with a 400 and writes nothing', async (_, tsv, replace, message) => {
    useStore({
      sets: { TestSetA: { version: 2, tsv: OLD_TSV }, TestSetB: { version: 1, tsv: B_TSV } },
      images: { testseta: ['PT9101', 'PT9102'], testsetb: ['PT9101'], testsetc: ['PT9101', 'PT9102'] },
    });
    const response = await cards(tsv, replace);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('bad_request');
    expect(JSON.stringify(body)).toMatch(message);
    expect(writes()).toEqual([]);
  });

  it('lets a replace reuse the card names and CollectorsInfos of the set it replaces', async () => {
    useStore({ sets: { TestSetB: { version: 1, tsv: B_TSV } }, images: { testsetc: ['PT9201'] } });
    const next = tsvOf(row('Invented B One', '9201', 'PT9201', 'TestSetC'));
    expect((await cards(next, 'TestSetB')).status).toBe(200);
  });

  it('removes a set and its images, and answers 400 for a set not in testing', async () => {
    useStore({ sets: { TestSetA: { version: 2, tsv: OLD_TSV, images: ['PT9100', 'PT9101'] }, TestSetB: { version: 1, tsv: B_TSV } } });
    const response = await deleteSet(new Request(url('sets'), jsonBody('DELETE', { name: 'testseta' })));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ removed: 'testseta' });
    expect([...fake.strings.keys()].filter((k) => k.startsWith('playtest:set:testseta:'))).toEqual([]);
    expect([...fake.sets.get('playtest:sets')!]).toEqual(['TestSetB']);
    fake.log.length = 0;
    const again = await deleteSet(new Request(url('sets'), jsonBody('DELETE', { name: 'TestSetA' })));
    expect(again.status).toBe(400);
    expect(writes()).toEqual([]);
    expect((await deleteSet(new Request(url('sets'), jsonBody('DELETE', { name: '../x' })))).status).toBe(400);
  });

  it('adds and removes a playtester, lowercased and trimmed', async () => {
    useStore({ emails: ['old@example.com'] });
    const added = await postEmail(new Request(url('emails'), jsonBody('POST', { email: '  New@Example.COM ' })));
    expect(await added.json()).toEqual({ emails: ['new@example.com', 'old@example.com'] });
    const removed = await deleteEmail(new Request(url('emails'), jsonBody('DELETE', { email: 'OLD@example.com' })));
    expect(await removed.json()).toEqual({ emails: ['new@example.com'] });
    expect(writes()).toEqual(['sadd playtest:emails new@example.com', 'srem playtest:emails old@example.com']);
  });

  it('rejects a value that is not an email', async () => {
    useStore();
    const response = await postEmail(new Request(url('emails'), jsonBody('POST', { email: 'not an email' })));
    expect(response.status).toBe(400);
    expect(fake.log).toEqual([]);
  });

  it('answers 502 when the store cannot be reached', async () => {
    useStore({ fail: true });
    for (const [, request] of requests) {
      const response = await request();
      expect(response.status).toBe(502);
      expect((await response.json()).code).toBe('upstream_unreachable');
    }
  });
});

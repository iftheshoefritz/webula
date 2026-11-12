/**
 * @jest-environment node
 */

// Every card row, name, image and email here is invented: no test holds a real playtest card.

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
import { GET as getStatus } from '../../app/api/playtest/admin/status/route';
import { PLAYTEST_COLUMNS, normalisePlaytestTsv } from '../../lib/playtestCards';
import { getPlaytestAdminStore, getPlaytestStore, type PlaytestAdminStore } from '../../lib/playtestStore';

const OWNER = 'owner@example.com';

function row(name: string, collectorsInfo: string, imageFile: string, type = 'Event'): string {
  const fields: Record<string, string> = Object.fromEntries(PLAYTEST_COLUMNS.map((c) => [c, '']));
  Object.assign(fields, { Name: name, Set: 'Playtest', ImageFile: imageFile, CollectorsInfo: collectorsInfo, Type: type });
  return PLAYTEST_COLUMNS.map((c) => fields[c]).join('\t');
}
const tsvOf = (...rows: string[]) => [PLAYTEST_COLUMNS.join('\t'), ...rows].join('\n');

const GOOD_TSV = tsvOf(row('Invented Event One', '9101', 'PT9101'), row('Invented Event Two', '9102', 'PT9102'));
const OLD_TSV = normalisePlaytestTsv(tsvOf(row('Invented Old', '9100', 'PT9100'), row('Invented Event One', '9101', 'PT9101')), new Set()).tsv;

function memoryStore(opts: { tsv?: string; images?: string[]; emails?: string[]; fail?: boolean } = {}) {
  const calls: string[] = [];
  const images = new Set(opts.images ?? []);
  let emails = [...(opts.emails ?? [])];
  const guard = () => { if (opts.fail) throw new Error('connect ECONNREFUSED'); };
  const store: PlaytestAdminStore = {
    async readCards() { guard(); return { version: 2, tsv: opts.tsv ?? '' }; },
    async readImage() { guard(); return null; },
    async hasPlaytester(email) { guard(); return emails.includes(email); },
    async readStatus() { guard(); calls.push('readStatus'); return { version: 2, uploadedAt: '2026-01-01T00:00:00.000Z', tsv: opts.tsv ?? '' }; },
    async writeImages(list) { guard(); calls.push(`writeImages:${list.map((i) => i.imageFile).join(',')}`); list.forEach((i) => images.add(i.imageFile)); },
    async missingImages(list) { guard(); calls.push('missingImages'); return list.filter((i) => !images.has(i)); },
    async publishCards(tsv, uploadedAt, remove) {
      guard();
      calls.push('setCards', ...(remove.length ? [`removeImages:${remove.join(',')}`] : []), 'setUploadedAt', 'bumpVersion');
      return 3;
    },
    async listPlaytesters() { guard(); return [...emails].sort(); },
    async addPlaytester(email) { guard(); calls.push(`add:${email}`); emails.push(email); },
    async removePlaytester(email) { guard(); calls.push(`remove:${email}`); emails = emails.filter((e) => e !== email); },
  };
  return { store, calls };
}

const mockAdminStore = getPlaytestAdminStore as jest.MockedFunction<typeof getPlaytestAdminStore>;
const mockReadStore = getPlaytestStore as jest.MockedFunction<typeof getPlaytestStore>;
let calls: string[];

function useStore(opts: Parameters<typeof memoryStore>[0] = {}) {
  const made = memoryStore(opts);
  calls = made.calls;
  mockAdminStore.mockReturnValue(made.store);
  mockReadStore.mockReturnValue(made.store);
  return made.store;
}

function signIn(email: string | null) {
  mockGetToken.mockResolvedValue(email ? { email } : null);
}

const url = (path: string) => `http://localhost/api/playtest/admin/${path}`;
const jsonBody = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const IMAGE = { imageFile: 'PT9101', base64: 'AAAA' };

const requests: [string, () => Promise<Response>][] = [
  ['GET status', () => getStatus(new Request(url('status')))],
  ['POST images', () => postImages(new Request(url('images'), jsonBody('POST', { images: [IMAGE] })))],
  ['POST cards', () => postCards(new Request(url('cards'), { method: 'POST', body: GOOD_TSV }))],
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
        useStore({ emails: ['tester@example.com', 'old@example.com'], images: ['PT9101', 'PT9102'] });
        signIn(email);
        const response = await request();
        expect(response.status).toBe(404);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
        expect(await response.text()).toBe('Not found');
        expect(calls).toEqual([]);
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

  it('reads the status, counting the cards and the images from the stored TSV', async () => {
    useStore({ tsv: OLD_TSV, emails: ['b@example.com', 'a@example.com'] });
    const response = await getStatus(new Request(url('status')));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      version: 2,
      uploadedAt: '2026-01-01T00:00:00.000Z',
      cards: 2,
      images: 2,
      emails: ['a@example.com', 'b@example.com'],
    });
  });

  it('writes a batch of images and leaves the version alone', async () => {
    useStore();
    const response = await postImages(new Request(url('images'), jsonBody('POST', {
      images: [IMAGE, { imageFile: 'PT9102', base64: 'BBBB' }],
    })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ written: 2 });
    expect(calls).toEqual(['writeImages:PT9101,PT9102']);
  });

  it.each([
    ['a name with a path', { imageFile: '../secret', base64: 'AAAA' }],
    ['a name with a colon', { imageFile: 'a:b', base64: 'AAAA' }],
    ['a body that is not base64', { imageFile: 'PT9101', base64: 'not base64!' }],
  ])('rejects %s and writes nothing', async (_, image) => {
    useStore();
    const response = await postImages(new Request(url('images'), jsonBody('POST', { images: [image] })));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('bad_request');
    expect(calls).toEqual([]);
  });

  it('writes nothing for a TSV with an error', async () => {
    useStore({ tsv: OLD_TSV, images: ['PT9100', 'PT9101', 'PT9102'] });
    const bad = tsvOf(row('Invented Event One', '9101', 'PT9101'), row('A Real Card Name', '9103', 'PT9103'));
    const response = await postCards(new Request(url('cards'), { method: 'POST', body: bad }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('bad_request');
    expect(body.errors[0].message).toBe('The name is the name of a real card');
    expect(calls).toEqual([]);
  });

  it('writes nothing when the store lacks an image the TSV names', async () => {
    useStore({ images: ['PT9101'] });
    const response = await postCards(new Request(url('cards'), { method: 'POST', body: GOOD_TSV }));
    expect(response.status).toBe(400);
    expect((await response.json()).missingImages).toEqual(['PT9102']);
    expect(calls).toEqual(['missingImages']);
  });

  it('publishes a good upload: the images, the cards, the removal of old images, then the version last', async () => {
    useStore({ tsv: OLD_TSV, images: ['PT9100'] });
    await postImages(new Request(url('images'), jsonBody('POST', { images: [IMAGE, { imageFile: 'PT9102', base64: 'BBBB' }] })));
    const response = await postCards(new Request(url('cards'), { method: 'POST', body: GOOD_TSV }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 3, cards: 2, images: 2, removedImages: 1 });
    expect(calls).toEqual([
      'writeImages:PT9101,PT9102',
      'missingImages',
      'readStatus',
      'setCards',
      'removeImages:PT9100',
      'setUploadedAt',
      'bumpVersion',
    ]);
    expect(calls[calls.length - 1]).toBe('bumpVersion');
  });

  it('adds and removes a playtester, lowercased and trimmed', async () => {
    useStore({ emails: ['old@example.com'] });
    const added = await postEmail(new Request(url('emails'), jsonBody('POST', { email: '  New@Example.COM ' })));
    expect(await added.json()).toEqual({ emails: ['new@example.com', 'old@example.com'] });
    const removed = await deleteEmail(new Request(url('emails'), jsonBody('DELETE', { email: 'OLD@example.com' })));
    expect(await removed.json()).toEqual({ emails: ['new@example.com'] });
    expect(calls).toEqual(['add:new@example.com', 'remove:old@example.com']);
  });

  it('rejects a value that is not an email', async () => {
    useStore();
    const response = await postEmail(new Request(url('emails'), jsonBody('POST', { email: 'not an email' })));
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
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

describe('redisPlaytestStore: the writes of the upload', () => {
  it('publishes the cards, removes the old images and writes the time before it bumps the version', async () => {
    const { redisPlaytestStore } = jest.requireActual('../../lib/playtestStore') as typeof import('../../lib/playtestStore');
    const log: string[] = [];
    const redis = {
      set: async (key: string) => { log.push(`set ${key}`); return 'OK'; },
      del: async (...keys: string[]) => { log.push(`del ${keys.join(' ')}`); return keys.length; },
      incr: async (key: string) => { log.push(`incr ${key}`); return 4; },
      mset: async (values: Record<string, string>) => { log.push(`mset ${Object.keys(values).join(' ')}`); return 'OK'; },
      pipeline: () => {
        const keys: string[] = [];
        const pipeline = {
          exists: (key: string) => { keys.push(key); return pipeline; },
          exec: async () => { log.push(`exists ${keys.join(' ')}`); return keys.map((k) => (k.endsWith('PT1') ? 1 : 0)); },
        };
        return pipeline;
      },
    };
    const store = redisPlaytestStore(redis as unknown as import('@upstash/redis').Redis);
    await store.writeImages([{ imageFile: 'PT1', base64: 'AAAA' }]);
    expect(await store.missingImages(['PT1', 'PT2'])).toEqual(['PT2']);
    expect(await store.publishCards('tsv', '2026-01-01T00:00:00.000Z', ['PT0'])).toBe(4);
    expect(log).toEqual([
      'mset playtest:img:PT1',
      'exists playtest:img:PT1 playtest:img:PT2',
      'set playtest:cards',
      'del playtest:img:PT0',
      'set playtest:uploadedAt',
      'incr playtest:version',
    ]);
  });
});

/**
 * @jest-environment node
 */

// The per-set playtest store and its migration (#1644), on an in-memory Redis. Every set, card and
// image here is invented: no test holds a real playtest card.

import { PLAYTEST_COLUMNS, normalisePlaytestTsv } from '../../lib/playtestCards';
import {
  LEGACY_CARDS_KEY,
  LEGACY_UPLOADED_AT_KEY,
  LEGACY_VERSION_KEY,
  PLAYTEST_EMAILS_KEY,
  PLAYTEST_SETS_KEY,
  playtestSetKeys,
  redisPlaytestStore,
} from '../../lib/playtestStore';
import { fakeRedis } from '../fixtures/fakeRedis';

function row(set: string, name: string, collectorsInfo: string, imageFile: string): string {
  const fields: Record<string, string> = Object.fromEntries(PLAYTEST_COLUMNS.map((c) => [c, '']));
  Object.assign(fields, { Name: name, Set: set, ImageFile: imageFile, CollectorsInfo: collectorsInfo, Type: 'Event' });
  return PLAYTEST_COLUMNS.map((c) => fields[c]).join('\t');
}
const tsvOf = (...rows: string[]) => normalisePlaytestTsv([PLAYTEST_COLUMNS.join('\t'), ...rows].join('\n'), new Set()).tsv;

const A_TSV = tsvOf(row('TestSetA', 'Invented A1', '9001', 'A1'), row('TestSetA', 'Invented A2', '9002', 'A2'));
const A2_TSV = tsvOf(row('TestSetA', 'Invented A1', '9001', 'A1'), row('TestSetA', 'Invented A3', '9003', 'A3'));
const B_TSV = tsvOf(row('TestSetB', 'Invented B1', '9101', 'B1'));
const A = playtestSetKeys('testseta');
const B = playtestSetKeys('testsetb');
const TIME = '2026-11-01T00:00:00.000Z';

describe('the keys of a set', () => {
  it('pins the key names', () => {
    expect([A.version, A.uploadedAt, A.cards, A.image('X1'), PLAYTEST_SETS_KEY, PLAYTEST_EMAILS_KEY]).toEqual([
      'playtest:set:testseta:version', 'playtest:set:testseta:uploadedAt', 'playtest:set:testseta:cards',
      'playtest:set:testseta:img:X1', 'playtest:sets', 'playtest:emails',
    ]);
  });
});

describe('redisPlaytestStore: sets', () => {
  async function publishAB() {
    const fake = fakeRedis();
    const store = redisPlaytestStore(fake.redis);
    await store.writeImages('testseta', [{ imageFile: 'A1', base64: 'AAAA' }, { imageFile: 'A2', base64: 'AAAB' }]);
    await store.publishSet({ name: 'TestSetA', tsv: A_TSV, uploadedAt: TIME, replaces: null });
    await store.writeImages('testsetb', [{ imageFile: 'B1', base64: 'BBBB' }]);
    await store.publishSet({ name: 'TestSetB', tsv: B_TSV, uploadedAt: TIME, replaces: null });
    return { fake, store };
  }

  it('reads no sets before the first upload', async () => {
    const store = redisPlaytestStore(fakeRedis().redis);
    expect(await store.readSets()).toEqual([]);
    expect(await store.readStatus()).toEqual({ sets: [], legacyError: null });
  });

  it('lists two sets, each with its own version, and a re-upload of A bumps only A', async () => {
    const { fake, store } = await publishAB();
    expect(await store.readSets()).toEqual([
      { key: 'testseta', name: 'TestSetA', version: 1, tsv: A_TSV },
      { key: 'testsetb', name: 'TestSetB', version: 1, tsv: B_TSV },
    ]);
    await store.writeImages('testseta', [{ imageFile: 'A3', base64: 'AAAC' }]);
    expect(await store.publishSet({ name: 'TestSetA', tsv: A2_TSV, uploadedAt: TIME, replaces: 'testseta' })).toBe(2);
    expect((await store.readSets()).map((s) => [s.name, s.version])).toEqual([['TestSetA', 2], ['TestSetB', 1]]);
    // Only the image the new TSV no longer names goes.
    expect(fake.strings.has(A.image('A1'))).toBe(true);
    expect(fake.strings.has(A.image('A2'))).toBe(false);
    expect(fake.strings.has(A.image('A3'))).toBe(true);
  });

  it('reads an image by set, and none of another set or a set not in testing', async () => {
    const { store } = await publishAB();
    expect(await store.readImage('testseta', 'A1')).toBe('AAAA');
    expect(await store.readImage('testsetb', 'A1')).toBeNull();
    expect(await store.readImage('testsetc', 'A1')).toBeNull();
  });

  it('does not show an image of a set before its cards are published', async () => {
    const fake = fakeRedis();
    const store = redisPlaytestStore(fake.redis);
    await store.writeImages('testseta', [{ imageFile: 'A1', base64: 'AAAA' }]);
    expect(await store.missingImages('testseta', ['A1', 'A2'])).toEqual(['A2']);
    expect(await store.missingImages('testsetb', ['A1'])).toEqual(['A1']);
    expect(await store.readImage('testseta', 'A1')).toBeNull();
  });

  it('writes the cards and bumps the version before it lists the set', async () => {
    const fake = fakeRedis();
    await redisPlaytestStore(fake.redis).publishSet({ name: 'TestSetA', tsv: A_TSV, uploadedAt: TIME, replaces: null });
    const writes = fake.log.filter((c) => /^(set|incr|sadd) /.test(c));
    expect(writes).toEqual([
      `set ${A.cards}`, `set ${A.uploadedAt}`, `incr ${A.version}`, `sadd ${PLAYTEST_SETS_KEY} TestSetA`,
    ]);
  });

  it('replaces A with B: B is listed first, then A, its cards, version, time and images go', async () => {
    const { fake, store } = await publishAB();
    await store.removeSet('testsetb');
    const B2 = tsvOf(row('TestSetB', 'Invented A1', '9001', 'A1'));
    await store.writeImages('testsetb', [{ imageFile: 'A1', base64: 'NEW1' }]);
    fake.log.length = 0;
    expect(await store.publishSet({ name: 'TestSetB', tsv: B2, uploadedAt: TIME, replaces: 'testseta' })).toBe(1);
    expect(await store.readSets()).toEqual([{ key: 'testsetb', name: 'TestSetB', version: 1, tsv: B2 }]);
    for (const key of [A.cards, A.version, A.uploadedAt, A.image('A1'), A.image('A2')]) expect(fake.strings.has(key)).toBe(false);
    expect(fake.strings.get(B.image('A1'))).toBe('NEW1');
    const order = fake.log.filter((c) => c.startsWith('sadd') || c.startsWith('srem'));
    expect(order).toEqual([`sadd ${PLAYTEST_SETS_KEY} TestSetB`, `srem ${PLAYTEST_SETS_KEY} TestSetA`]);
  });

  it('removes a set and its images, and says false for a set not in testing', async () => {
    const { fake, store } = await publishAB();
    expect(await store.removeSet('testseta')).toBe(true);
    expect(await store.removeSet('testseta')).toBe(false);
    expect((await store.readSets()).map((s) => s.name)).toEqual(['TestSetB']);
    expect([...fake.strings.keys()].filter((k) => k.startsWith('playtest:set:testseta:'))).toEqual([]);
    expect(fake.strings.get(B.image('B1'))).toBe('BBBB');
  });

  it('keeps the playtesters in playtest:emails', async () => {
    const fake = fakeRedis({}, { [PLAYTEST_EMAILS_KEY]: ['a@example.com'] });
    const store = redisPlaytestStore(fake.redis);
    expect(await store.hasPlaytester('a@example.com')).toBe(true);
    await store.addPlaytester('b@example.com');
    await store.removePlaytester('a@example.com');
    expect(await store.listPlaytesters()).toEqual(['b@example.com']);
  });
});

describe('redisPlaytestStore: the migration of the keys of before #1644', () => {
  const legacy = (tsv: string) => ({
    [LEGACY_VERSION_KEY]: '7',
    [LEGACY_UPLOADED_AT_KEY]: TIME,
    [LEGACY_CARDS_KEY]: tsv,
    'playtest:img:A1': 'AAAA',
    'playtest:img:A2': 'AAAB',
  });

  it('moves the legacy keys to the set their TSV names, keeps the version, and deletes them', async () => {
    const fake = fakeRedis(legacy(A_TSV), { [PLAYTEST_EMAILS_KEY]: ['a@example.com'] });
    const store = redisPlaytestStore(fake.redis);
    expect(await store.readSets()).toEqual([{ key: 'testseta', name: 'TestSetA', version: 7, tsv: A_TSV }]);
    expect(await store.readImage('testseta', 'A2')).toBe('AAAB');
    expect((await store.readStatus()).sets[0].uploadedAt).toBe(TIME);
    expect([...fake.strings.keys()].filter((k) => !k.startsWith('playtest:set:'))).toEqual([]);
    expect(await store.hasPlaytester('a@example.com')).toBe(true);
  });

  it('is a no-op the second time, and with a second store that runs it too', async () => {
    const fake = fakeRedis(legacy(A_TSV));
    await redisPlaytestStore(fake.redis).readSets();
    const after = new Map(fake.strings);
    await redisPlaytestStore(fake.redis).readSets();
    expect(fake.strings).toEqual(after);
  });

  it('gives the same data when two requests run it at once', async () => {
    const fake = fakeRedis(legacy(A_TSV));
    const [first, second] = await Promise.all([
      redisPlaytestStore(fake.redis).readSets(),
      redisPlaytestStore(fake.redis).readSets(),
    ]);
    expect(first).toEqual([{ key: 'testseta', name: 'TestSetA', version: 7, tsv: A_TSV }]);
    expect(second).toEqual(first);
    expect(fake.strings.get(A.image('A1'))).toBe('AAAA');
    expect(fake.strings.has(LEGACY_CARDS_KEY)).toBe(false);
  });

  it.each([
    ['two set names', tsvOf(row('TestSetA', 'Invented A1', '9001', 'A1'), row('TestSetB', 'Invented B1', '9101', 'A2'))],
    ['no set name', tsvOf(row('', 'Invented A1', '9001', 'A1'))],
  ])('does not run for a legacy TSV with %s, and the status says so', async (_, tsv) => {
    const fake = fakeRedis(legacy(tsv));
    const store = redisPlaytestStore(fake.redis);
    expect(await store.readSets()).toEqual([]);
    const status = await store.readStatus();
    expect(status.sets).toEqual([]);
    expect(status.legacyError).toMatch(/could not move to a set/);
    expect(fake.strings.get(LEGACY_CARDS_KEY)).toBe(tsv);
    expect([...fake.strings.keys()].some((k) => k.startsWith('playtest:set:'))).toBe(false);
  });
});

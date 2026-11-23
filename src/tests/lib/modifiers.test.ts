// Issue #1887: the static modifiers. The rows give, on the fixture tables and on 200 seeded random tables of the
// modelled cards, every value the hook readers gave on `main` before them (`modifierEquivalence.json`); the
// registry refuses a row no evaluator reads; and Biological Distinctiveness, a new row, is data only. The tables
// are built from the card data, so an update of `cards_with_processed_columns.txt` changes them: check the change,
// then record the values of the rows again with `MODIFIER_EQUIVALENCE=record yarn test modifiers.test`.
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import equivalence from '../fixtures/modifierEquivalence.json';
import { cardData, fixtureTables, modifierTable, modifierValuesOf } from '../fixtures/modifierTables';
import { ATTRIBUTE_REGISTRY, personnelAttributesOnTable } from '../../app/decks/practice/attributeModels';
import { attributesOnTableOf } from '../../app/decks/practice/attributesOnTable';
import { RANGE_SPAN_REGISTRY } from '../../app/decks/practice/rangeModels';
import type { CardInstance, TableState } from '../../app/decks/practice/tableReducer';
import { MODIFIER_ROWS, modifierRowsOf, row, rowsByTitle } from '../../lib/modifiers';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

// The values as JSON reads them back: an `undefined` field is dropped, as in the recording.
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

const digest = (values: unknown) => createHash('sha1').update(JSON.stringify(values)).digest('hex');

if (process.env.MODIFIER_EQUIVALENCE === 'record') {
  const fixtures = Object.fromEntries(fixtureTables().map(([name, table]) => [name, plain(modifierValuesOf(table))]));
  const random = Object.fromEntries(Object.keys(equivalence.random).map((seed) => [seed, digest(modifierValuesOf(modifierTable(Number(seed), equivalence.titles)))]));
  const lines = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  const text = `{\n "titles": ${JSON.stringify(equivalence.titles)},\n "fixtures": {\n${lines(fixtures)}\n },\n "random": {\n${lines(random)}\n }\n}\n`;
  writeFileSync(join(process.cwd(), 'src/tests/fixtures/modifierEquivalence.json'), text);
}

describe('the modifier rows give what the hook readers gave (#1887)', () => {
  it.each(fixtureTables())('on the %s fixture table', (name, table) => {
    expect(plain(modifierValuesOf(table))).toEqual((equivalence.fixtures as Record<string, unknown>)[name]);
  });

  it('on 200 seeded random tables of the modelled cards', () => {
    const differ = Object.entries(equivalence.random).filter(([seed, recorded]) => digest(modifierValuesOf(modifierTable(Number(seed), equivalence.titles))) !== recorded);
    expect(differ.map(([seed]) => seed)).toEqual([]);
  });

  it('indexes the titles of the hook registries, and one more', () => {
    const now = [...new Set([...ATTRIBUTE_REGISTRY.keys(), ...RANGE_SPAN_REGISTRY.keys()])].sort();
    expect(now.filter((t) => !equivalence.titles.includes(t))).toEqual(['biological distinctiveness']);
    expect(equivalence.titles.filter((t) => !now.includes(t))).toEqual([]);
  });
});

describe('the registry of modifier rows', () => {
  it('keeps every row of a title, the two of I.K.S. Vorn Ship of Traitors among them', () => {
    expect(modifierRowsOf('i.k.s. vorn ship of traitors').map((r) => [r.source, r.target])).toEqual([
      ['self', 'self'],
      ['shipRow', 'any'],
    ]);
    expect(modifierRowsOf('nobody')).toEqual([]);
    expect(MODIFIER_ROWS.every((r) => r.scope === 'whileInPlay' && !r.eachTitleOnce)).toBe(true);
  });

  it('refuses two rows of one title that change one quantity from one place', () => {
    expect(() => rowsByTitle([row('Twice', 'self', 'self', { range: 1 }), row('Twice', 'self', 'self', { range: 2, weapons: 1 })])).toThrow(
      'two rows of "Twice" change range from self'
    );
    expect(() => rowsByTitle([row('Twice', 'self', 'self', { range: 1 }), row('Twice', 'aboard', 'itsShip', { range: 2 })])).not.toThrow();
  });

  it('refuses a row whose place no evaluator of its quantity reads', () => {
    expect(() => rowsByTitle([row('Nowhere', 'mission', 'any', { range: 1 })])).toThrow('a place no evaluator reads');
    expect(() => rowsByTitle([row('Nowhere', 'core', 'any', { span: { reduce: () => 1 } })])).toThrow('a place no evaluator reads');
  });

  it('refuses a permission at a place no check reads, and one that neither allows nor forbids (#1915)', () => {
    expect(() => rowsByTitle([row('Gated', 'core', 'play', { play: 'forbid' })])).toThrow('changes play from core to play, a place no evaluator reads');
    expect(() => rowsByTitle([row('Hulk', 'self', 'self', { attempt: 'forbid' })])).toThrow('a place no evaluator reads');
    expect(() => rowsByTitle([row('Miser', 'played', 'play', { spendToDraw: 'forbid' })])).toThrow('a place no evaluator reads');
    expect(() => rowsByTitle([row('Odd', 'played', 'play', { play: 'maybe' as 'allow' })])).toThrow('with neither allow nor forbid');
    const ok = rowsByTitle([
      row('Gated', 'played', 'play', { play: 'forbid' }),
      row('Gated', 'played', 'play', { playPlace: 'allow' }),
      row('Hulk', 'shipRow', 'crew', { attempt: 'forbid' }),
      row('Crowd', 'core', 'attempting', { attempt: 'forbid' }),
      row('Miser', 'core', 'turnLimit', { spendToDraw: 'forbid' }),
    ]);
    expect(ok.get('gated')?.length).toBe(2);
  });
});

describe('Biological Distinctiveness (#1887)', () => {
  // "Plays in your core. Each of your [Bor] personnel is attributes +1 for each personnel on this event."
  const named = (name: string) => cardData.find((r) => r.originalName === name)!;
  let n = 0;
  const instance = (data: any, placedOn: CardInstance[] = []): CardInstance => ({ id: `bd-${n++}`, card: data, face: 'up', placedOn });
  const borg = instance(named('Annexation Drone'));
  const other = instance(cardData.find((r) => r.type === 'personnel' && r.affiliation === 'federation')!);
  const table = (onEvent: number): TableState =>
    ({
      missions: [{ mission: null, awayTeam: [borg, other], ships: [], underMission: [] }],
      core: [instance(named('Biological Distinctiveness'), Array.from({ length: onEvent }, () => instance(named('Annexation Drone'))))],
      hand: [],
      discard: [],
      brig: [],
      score: 0,
      rangeUsed: {},
    }) as unknown as TableState;

  it('makes each [Bor] personnel attributes +1 for each personnel on it', () => {
    expect(personnelAttributesOnTable(table(2), borg)).toEqual({ integrity: 7, cunning: 7, strength: 7 });
    expect(attributesOnTableOf(table(2), true)).toEqual({ [borg.id]: { integrity: 7, cunning: 7, strength: 7 } });
  });

  it('changes nothing with no personnel on it, for a non-[Bor] personnel, or with the card text off', () => {
    expect(personnelAttributesOnTable(table(0), borg)).toEqual({ integrity: 5, cunning: 5, strength: 5 });
    expect(attributesOnTableOf(table(0), true)).toEqual({});
    expect(personnelAttributesOnTable(table(2), other)).toEqual(personnelAttributesOnTable(table(0), other));
    expect(personnelAttributesOnTable(table(2), borg, false)).toEqual({ integrity: 5, cunning: 5, strength: 5 });
  });
});

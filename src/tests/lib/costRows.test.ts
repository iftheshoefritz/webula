// Issue #1888: the cost rows. The rows and the residual cost models give, on the fixture tables and on 200 seeded
// random tables of the cost-modelled cards, every charge, reason, grant, cap and pending discount the hook readers
// gave on `main` before them (`costEquivalence.json`). The tables are built from the card data, so an update of
// `cards_with_processed_columns.txt` changes them: check the change, then record the values again with
// `COST_EQUIVALENCE=record yarn test costRows.test`.
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import equivalence from '../fixtures/costEquivalence.json';
import { costFixtureTables, costTable, costValuesOf } from '../fixtures/costTables';
import { COST_REGISTRY, COST_ROWS, costModelOf, costRegistryOf } from '../../lib/costModels/registry';
import type { CostFacts } from '../../lib/costModels/model';
import { inCore, nextPlay, off, onLimit, own, withRows } from '../../lib/costModels/rows';
import { row, rowsByTitle } from '../../lib/modifiers';
import { moveCharge } from '../../lib/playCost';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

const digest = (values: unknown) => createHash('sha1').update(JSON.stringify(values)).digest('hex');

const SEEDS = Array.from({ length: 200 }, (_, i) => String(i + 1));

if (process.env.COST_EQUIVALENCE === 'record') {
  const titles = [...COST_REGISTRY.keys()].map((t) => t.toLowerCase()).sort();
  const fixtures = Object.fromEntries(costFixtureTables().map(([name, t]) => [name, digest(costValuesOf(t))]));
  const random = Object.fromEntries(SEEDS.map((seed) => [seed, digest(costValuesOf(costTable(Number(seed), titles)))]));
  const lines = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  const text = `{\n "titles": ${JSON.stringify(titles)},\n "fixtures": {\n${lines(fixtures)}\n },\n "random": {\n${lines(random)}\n }\n}\n`;
  writeFileSync(join(process.cwd(), 'src/tests/fixtures/costEquivalence.json'), text);
}

describe('the cost rows give what the hook readers gave (#1888)', () => {
  it.each(costFixtureTables())('on the %s fixture table', (name, t) => {
    expect(digest(costValuesOf(t))).toBe((equivalence.fixtures as Record<string, string>)[name]);
  });

  it('on 200 seeded random tables of the cost-modelled cards', () => {
    const differ = Object.entries(equivalence.random).filter(([seed, recorded]) => digest(costValuesOf(costTable(Number(seed), equivalence.titles))) !== recorded);
    expect(differ.map(([seed]) => seed)).toEqual([]);
  });
});

describe('the cost rows (#1888)', () => {
  it('hold every static cost change of the registry, and the hooks of a model come from its rows', () => {
    expect(COST_ROWS.length).toBeGreaterThan(100);
    expect(COST_ROWS.every((r) => COST_REGISTRY.get(r.title)?.rows?.includes(r))).toBe(true);
    const nanoprobes = costModelOf('Borg Nanoprobes')!;
    expect(nanoprobes.rows?.map((r) => [r.source, r.target, r.scope])).toEqual([['played', 'play', 'whileInPlay']]);
    expect(nanoprobes.playCost).toBeDefined();
    expect(costModelOf('Sarish Rez Ministerial Adjutant')?.rows?.map((r) => r.scope)).toEqual(['nextPlay']);
    expect(costModelOf('Romulus Patient Stronghold')?.rows?.map((r) => [r.source, r.eachTitleOnce])).toEqual([['mission', true]]);
    expect(costModelOf('Gint The First Grand Nagus')?.rows?.map((r) => r.source)).toEqual(['played', 'unstopped']);
    // A choice stays on the residual model, with no row.
    expect(costModelOf('Goran')?.rows).toBeUndefined();
  });

  it('refuses a cost row no evaluator reads, a discount out of its scope, and a mission or personnel row read per copy', () => {
    expect(() => rowsByTitle([row('Nowhere', 'shipRow', 'play', { cost: off(1) })])).toThrow('a place no evaluator reads');
    expect(() => rowsByTitle([row('Nowhere', 'played', 'play', { cost: { label: 'next', amount: 1, applies: () => true } })])).toThrow('needs the scope nextPlay');
    expect(() => rowsByTitle([{ ...row('Nowhere', 'core', 'play', { cost: off(1) }), scope: 'nextPlay' }])).toThrow('a discount of its own play alone');
    expect(() => rowsByTitle([row('Nowhere', 'mission', 'play', { cost: off(1) })])).toThrow('counts each title once');
    expect(() => costRegistryOf([withRows({ title: 'Twice', family: 'ownCost' }, own(off(1)), own(off(2)))])).toThrow('two rows of "Twice" change cost from played');
    expect(() => costRegistryOf([withRows({ title: 'Both', family: 'ownCost', playCost: () => null }, own(off(1)))])).toThrow('a cost row of played and its hook');
    expect(() =>
      costRegistryOf([
        withRows(
          { title: 'Fine', family: 'limit' },
          inCore(off(1)),
          onLimit('core', { grant: () => ({ amount: 1, reason: 'in your core' }) }),
          nextPlay({ label: 'next event', amount: 1, applies: () => true })
        ),
      ])
    ).not.toThrow();
  });
});

describe('Hollow Pleasantries (#1888)', () => {
  // "Plays in your core. When you play a Vorta, each opponent may draw a card. That Vorta is cost -1."
  const facts = (core: string[]): CostFacts => ({ commanded: [], core, hand: [] });
  const vorta = { name: 'an invented vorta', originalName: 'An Invented Vorta', type: 'personnel', cost: '3', species: 'Vorta' };
  const human = { ...vorta, name: 'an invented human', originalName: 'An Invented Human', species: 'Human' };
  const charge = (card: typeof vorta, core: string[]) => moveCharge('playAndDraw', 'hand', 'awayTeam', card, facts(core), 'c0', { missionIndex: 0 });

  it('makes a Vorta played from the hand cost −1 while it is in the core', () => {
    expect(charge(vorta, ['Hollow Pleasantries'])).toEqual({ kind: 'play', cost: 2, source: { title: 'Hollow Pleasantries', reason: '−1 on a Vorta' } });
    expect(costModelOf('Hollow Pleasantries')).toMatchObject({ title: 'Hollow Pleasantries', family: 'standingRule' });
  });

  it('changes nothing for a non-Vorta, or with it out of the core', () => {
    expect(charge(human, ['Hollow Pleasantries'])).toEqual({ kind: 'play', cost: 3 });
    expect(charge(vorta, [])).toEqual({ kind: 'play', cost: 3 });
  });

  it('counts each copy in the core', () => {
    expect(charge(vorta, ['Hollow Pleasantries', 'Hollow Pleasantries'])).toEqual({
      kind: 'play',
      cost: 1,
      source: { title: 'Hollow Pleasantries', reason: '−2 on a Vorta (2 copies)' },
    });
  });
});

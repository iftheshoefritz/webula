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
import { COST_REGISTRY } from '../../lib/costModels/registry';

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

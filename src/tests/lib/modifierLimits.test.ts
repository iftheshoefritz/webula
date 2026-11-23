// Issue #1833: "(limit N)" is a named field of a counted change. The evaluator applies the limit, and a registry
// test reads the "(limit …)" phrases of every modelled title's game text against the limits of its rows, both ways.
import { cardTitleOf } from '../../lib/cardTitle';
import { COST_ROWS } from '../../lib/costModels/registry';
import { countedCost } from '../../lib/costModels/rows';
import { amountOf, type AmountContext, clampToLimit, counted, MODIFIER_ROWS, type ModifierRow, rowLimits } from '../../lib/modifiers';
import { cardRows } from './backlogData';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

const c = {} as AmountContext;
const fixed = (n: number) => () => n;

describe('the counted change (#1833)', () => {
  it.each([
    [2, 2],
    [4, 4],
    [6, 4],
  ])('caps %i items at +1 each and a limit of +4 at %i', (n, total) => {
    expect(amountOf(counted(fixed(n), 1, 4), c)).toBe(total);
  });

  it('stops a fall at a negative limit', () => {
    expect(amountOf(counted(fixed(2), -1, -3), c)).toBe(-2);
    expect(amountOf(counted(fixed(5), -1, -3), c)).toBe(-3);
  });

  it('has no cap with no limit, and multiplies by the amount per item', () => {
    expect(amountOf(counted(fixed(9), 2), c)).toBe(18);
    expect(clampToLimit(9, undefined)).toBe(9);
  });

  it('sums a list part by part, the cap on its own part only', () => {
    expect(amountOf([-3, counted(fixed(6), 1, 5)], c)).toBe(2);
    expect(amountOf([fixed(-3), counted(fixed(2), 1, 5)], c)).toBe(-1);
  });

  it('reads the limits of a row, each quantity and each part, and of a counted cost', () => {
    const capped = counted(fixed(1), 1, 3);
    expect(rowLimits({ changes: { range: [fixed(-3), capped], weapons: capped } })).toEqual([3, 3]);
    expect(rowLimits({ changes: { integrity: counted(fixed(1), -1, -3), strength: counted(fixed(1), 1, 3) } })).toEqual([-3, 3]);
    expect(rowLimits({ changes: { range: 2, weapons: fixed(1) } })).toEqual([]);
    expect(rowLimits({ changes: { cost: countedCost({ of: 'personnel', unstopped: true, species: 'borg' }, -1, -5) } })).toEqual([-5]);
  });
});

// The "(limit …)" phrases of a game text that cap a number, signed: "(limit +4)", "(limit -3/+3)", and "(limit 5)"
// beside a cost reduction as −5. A use limit ("per turn") and a play rule ("one per ship") are no cap on a number,
// and the pattern does not match them.
function printedLimits(text: string): number[] {
  const limits: number[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    for (const m of sentence.matchAll(/\(limit ([+-]?\d+)(?:\/([+-]?\d+))?\)/gi)) {
      for (const part of [m[1], m[2]]) {
        if (part === undefined) continue;
        const n = Number(part);
        limits.push(/^[+-]/.test(part) || !/cost -/i.test(sentence) ? n : -n);
      }
    }
  }
  return limits;
}

describe('every printed "(limit N)" of a modelled title has its row limit (#1833)', () => {
  const rows = new Map<string, ModifierRow[]>();
  for (const r of [...MODIFIER_ROWS, ...COST_ROWS]) rows.set(r.title.toLowerCase(), [...(rows.get(r.title.toLowerCase()) ?? []), r]);
  const printed = new Map<string, Set<number>>();
  for (const card of cardRows()) {
    const title = cardTitleOf(card.name).toLowerCase();
    if (!rows.has(title)) continue;
    const set = printed.get(title) ?? new Set<number>();
    for (const n of printedLimits(card.gametext)) set.add(n);
    printed.set(title, set);
  }
  const sorted = (s: Iterable<number>) => [...new Set(s)].sort((a, b) => a - b);

  it('reads the phrases of the text', () => {
    expect(printedLimits('This ship is attributes +1 for each of your Cadets aboard (limit +4).')).toEqual([4]);
    expect(printedLimits('Integrity -1 and Strength +1 for each non-Bajoran present (limit -3/+3).')).toEqual([-3, 3]);
    expect(printedLimits('When you play this ship, it is cost -1 for each Borg you command (limit 5).')).toEqual([-5]);
    expect(printedLimits('Plays on your ship (limit one per ship). Order - (Limit 2 per turn)')).toEqual([]);
  });

  it('finds the capped titles in the card data', () => {
    expect([...printed].filter(([, s]) => s.size > 0).length).toBeGreaterThanOrEqual(10);
  });

  it('matches the limits of the rows with the text, both ways', () => {
    const mismatches = [...printed]
      .map(([title, set]) => ({ title, printed: sorted(set), rows: sorted(rows.get(title)!.flatMap(rowLimits)) }))
      .filter((m) => JSON.stringify(m.printed) !== JSON.stringify(m.rows));
    expect(mismatches).toEqual([]);
  });
});

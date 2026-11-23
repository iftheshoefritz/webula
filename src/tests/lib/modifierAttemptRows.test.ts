// Issue #1889: the bot's attempt modifiers as rows. The bonus and the losses of `PileModifiers` convert to
// `thisAttempt` rows and back, the text reads them with the words of before, and no evaluator reads them, so the
// attributes on the table do not count them.
import { fixtureTables } from '../fixtures/modifierTables';
import { personnelAttributesOnTable } from '../../app/decks/practice/attributeModels';
import type { CardInstance, TableState } from '../../app/decks/practice/tableReducer';
import type { PileModifiers } from '../../lib/dilemmaBot/pile/model';
import { modifiersClause, modifiersText } from '../../lib/dilemmaBot/pile/resolve';
import { MODIFIER_ROWS, rowsByTitle } from '../../lib/modifiers';
import { ATTEMPT_ROW_TITLE, attemptModifiersOf, attemptRowsOf } from '../../lib/modifiers/attempt';

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

const NAMES: Record<string, string> = { 'card-1': 'Data', 'card-2': 'Worf', 'card-3': 'Troi' };
const nameOf = (id: string) => NAMES[id] ?? id;

describe('the attempt modifiers as rows (#1889)', () => {
  it.each<[string, PileModifiers]>([
    ['a bonus', { attrBonus: 1 }],
    ['a loss of 2 sizes over several ids', { attrLoss: { 'card-2': 2, 'card-3': 1, 'card-1': 2 } }],
    ['both', { attrBonus: -2, attrLoss: { 'card-3': 1, 'card-1': 3 } }],
  ])('a round trip gives back %s, in the same key order', (_, m) => {
    const back = attemptModifiersOf(attemptRowsOf(m));
    expect(back).toEqual(m);
    expect(Object.keys(back.attrLoss ?? {})).toEqual(Object.keys(m.attrLoss ?? {}));
  });

  it('a bonus changes the three attributes of every attempting personnel, a loss those of one card', () => {
    const [bonus, loss] = attemptRowsOf({ attrBonus: 1, attrLoss: { 'card-1': 2 } });
    expect(bonus).toEqual({ title: ATTEMPT_ROW_TITLE, source: 'attempt', target: 'attempting', changes: { integrity: 1, cunning: 1, strength: 1 }, scope: 'thisAttempt' });
    expect(loss).toEqual({ title: ATTEMPT_ROW_TITLE, source: 'attempt', target: 'card', targetId: 'card-1', changes: { integrity: -2, cunning: -2, strength: -2 }, scope: 'thisAttempt' });
  });

  it('no modifiers, a bonus of 0 and a loss of 0 give no rows', () => {
    expect(attemptRowsOf({})).toEqual([]);
    expect(attemptRowsOf({ attrBonus: 0, attrLoss: { 'card-1': 0 } })).toEqual([]);
    expect(attemptRowsOf({ abilitiesOff: true, firstSkillOff: true, overwhelmed: true })).toEqual([]);
  });

  it('the rows of one target sum', () => {
    const rows = [...attemptRowsOf({ attrBonus: 1, attrLoss: { 'card-1': 1 } }), ...attemptRowsOf({ attrBonus: 1, attrLoss: { 'card-1': 2 } })];
    expect(attemptModifiersOf(rows)).toEqual({ attrBonus: 2, attrLoss: { 'card-1': 3 } });
  });

  it('the text reads as before', () => {
    expect(modifiersText({ attrBonus: 1 }, nameOf)).toBe('+1 attributes');
    expect(modifiersText({ attrLoss: { 'card-1': 2, 'card-2': 2 } }, nameOf)).toBe('−2 attributes: Data, Worf');
    expect(modifiersText({ attrBonus: 1, attrLoss: { 'card-1': 2, 'card-2': 2, 'card-3': 1 } }, nameOf)).toBe(
      '+1 attributes · −1 attributes: Troi · −2 attributes: Data, Worf'
    );
    expect(modifiersClause({}, { attrLoss: { 'card-1': 2, 'card-2': 2 } }, nameOf)).toBe('−2 attributes: Data, Worf for the rest of the attempt');
  });

  it('the registry holds no attempt row, and refuses one', () => {
    expect(MODIFIER_ROWS.filter((r) => r.scope === 'thisAttempt' || r.source === 'attempt')).toEqual([]);
    expect(() => rowsByTitle(attemptRowsOf({ attrBonus: 1 }))).toThrow(/a place no evaluator reads/);
    expect(() => rowsByTitle(attemptRowsOf({ attrLoss: { 'card-1': 1 } }))).toThrow(/a place no evaluator reads/);
  });

  it('the attributes on the table do not count the attempt modifiers', () => {
    const [, table] = fixtureTables()[0];
    const personnel: CardInstance[] = table.missions.flatMap((s) => [...s.awayTeam, ...s.ships.flatMap((sh) => sh.crew ?? [])]).filter((c) => c.card.type === 'personnel');
    expect(personnel.length).toBeGreaterThan(0);
    const before = personnel.map((p) => personnelAttributesOnTable(table, p));
    const attempt = { missionIndex: 0, modifiers: { attrBonus: 1, attrLoss: { [personnel[0].id]: 2 } } } as unknown as TableState['attempt'];
    const withAttempt: TableState = { ...table, opponent: 'bot', attempt };
    expect(personnel.map((p) => personnelAttributesOnTable(withAttempt, p))).toEqual(before);
  });
});

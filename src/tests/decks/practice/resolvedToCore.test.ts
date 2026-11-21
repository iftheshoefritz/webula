// Resolved → Core (#1796): a core event with a "When you play this event" clause plays into the resolving
// zone, and once resolved goes to the core, in one log entry that one undo takes back.
import { readFileSync } from 'fs';
import { join } from 'path';
import { initialTableState, CardInstance, MissionSlot, MISSION_SLOTS, TableState } from '../../../app/decks/practice/tableReducer';
import {
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  logEntryText,
  turnCounters,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { resolvesOnPlay, resolvesThenCore } from '../../../lib/playCost';

const cardRows = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
  const col = (h: string) => head.indexOf(h);
  return rows.map((r) => ({
    name: r[col('Name')],
    originalName: r[col('Name')],
    type: r[col('Type')].toLowerCase(),
    cost: r[col('Cost')],
    gametext: r[col('gametext')] ?? '',
  }));
})();

const cardNamed = (name: string) => {
  const found = cardRows.find((r) => r.name === name);
  if (!found) throw new Error(`no card ${name}`);
  return found;
};

// The page reads the card data lowercased (`useDataFetching`).
const lowercased = (name: string) => {
  const row = cardNamed(name);
  return { ...row, gametext: row.gametext.toLowerCase() };
};

describe('resolvesThenCore (#1796)', () => {
  it.each(['Peak Performance', 'Under Scrutiny', 'Political Putsch', 'The Inner Light', 'Holding Cell'])(
    'is true for %s, as written and lowercased',
    (name) => {
      expect(resolvesThenCore(cardNamed(name))).toBe(true);
      expect(resolvesThenCore(lowercased(name))).toBe(true);
      expect(resolvesOnPlay(cardNamed(name))).toBe(false);
    }
  );

  // Code of the Ushaan and Surprise Party play in the core with no play text; Thirst for Knowledge's and
  // Unimatrix Zero's clauses only change their own cost; These Are The Voyages resolves at once.
  it.each(['Code of the Ushaan', 'Surprise Party', 'Thirst for Knowledge', 'Unimatrix Zero', 'These Are The Voyages'])(
    'is false for %s, as written and lowercased',
    (name) => {
      expect(resolvesThenCore(cardNamed(name))).toBe(false);
      expect(resolvesThenCore(lowercased(name))).toBe(false);
    }
  );

  it('is false for a card of any other type, and for no card', () => {
    expect(resolvesThenCore({ type: 'interrupt', gametext: 'Plays in your core. When you play this event, draw a card.' })).toBe(false);
    expect(resolvesThenCore(undefined)).toBe(false);
  });
});

const peak = cardNamed('Peak Performance');
const inst = (id: string, card: any): CardInstance => ({ id, card: { ...card }, face: 'up' });
const slots = (): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, () => ({ mission: null, ships: [], awayTeam: [], underMission: [] }));
const table = (): TableState => ({ ...initialTableState, missions: slots(), hand: [inst('card-1', peak)] });

const run = (start: TableState | GameState, ...actions: GameAction[]): GameState =>
  actions.reduce(
    (state, action) => gameReducer(state, withShuffleOrders(state.table, action, state.log)),
    'log' in start ? start : initialGameState(start)
  );

describe('Resolved → Core (#1796)', () => {
  const played = () => run(table(), { type: 'move', id: 'card-1', to: 'resolving' });

  it('charges the play into the resolving zone at its printed cost', () => {
    const before = played();
    expect(before.table.resolving?.id).toBe('card-1');
    expect(turnCounters(before.log, 1).spent).toBe(1);
    expect(logEntryText(before.log[before.log.length - 1])).toBe('Played Peak Performance (cost 1)');
  });

  it('moves the event to the core, uncharged, in one entry that one undo takes back', () => {
    const before = played();
    const resolved = run(before, { type: 'move', id: 'card-1', to: 'core' });
    expect(resolved.table.resolving).toBeNull();
    expect(resolved.table.core.map((c) => c.id)).toEqual(['card-1']);
    expect(resolved.log).toHaveLength(before.log.length + 1);
    expect(logEntryText(resolved.log[resolved.log.length - 1])).toBe('Resolved Peak Performance, and it went to the core');
    expect(turnCounters(resolved.log, 1).spent).toBe(1);
    const undone = gameReducer(resolved, { type: 'undo' });
    expect(undone.table).toEqual(before.table);
    expect(undone.log).toEqual(before.log);
  });
});

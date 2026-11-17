// The resolving zone (#1727): the one event the player played and whose text is resolving, its charge,
// its log text, the turn that waits on it, and the save.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  tableReducer,
  initialTableState,
  CardInstance,
  MissionSlot,
  MISSION_SLOTS,
  TableState,
} from '../../../app/decks/practice/tableReducer';
import {
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  logEntryText,
  turnCounters,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { fromSavedGame, toSavedGame, toSavedHistory } from '../../../app/decks/practice/savedGame';
import { resolvesOnPlay } from '../../../lib/playCost';
import { DeckList } from '../../../types';

// The rows of the card data by name, with the fields `moveCharge` and `resolvesOnPlay` read.
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
    collectorsinfo: r[col('CollectorsInfo')],
    gametext: r[col('gametext')] ?? '',
  }));
})();

const cardNamed = (name: string) => {
  const found = cardRows.find((r) => r.name === name);
  if (!found) throw new Error(`no card ${name}`);
  return found;
};

describe('resolvesOnPlay (#1727)', () => {
  it.each(['These Are The Voyages', 'At What Cost?', 'Tactical Planning'])('is true for %s', (name) => {
    expect(resolvesOnPlay(cardNamed(name))).toBe(true);
  });

  it('is false for Surprise Party, which plays in the core', () => {
    expect(resolvesOnPlay(cardNamed('Surprise Party'))).toBe(false);
  });

  // The card data of the page is lowercased (`useDataFetching`), so the clause matches in any case (#1729).
  it('is false for Surprise Party with its text lowercased, as the page reads it', () => {
    const row = cardNamed('Surprise Party')!;
    expect(resolvesOnPlay({ ...row, gametext: row.gametext.toLowerCase() })).toBe(false);
  });

  it('is false for an event that plays on a mission', () => {
    const onMission = cardRows.find((r) => r.type === 'event' && r.gametext.includes('Plays on a mission'));
    expect(onMission).toBeDefined();
    expect(resolvesOnPlay(onMission)).toBe(false);
  });

  it('is false for every interrupt', () => {
    const interrupts = cardRows.filter((r) => r.type === 'interrupt');
    expect(interrupts.length).toBeGreaterThan(0);
    expect(interrupts.filter(resolvesOnPlay)).toEqual([]);
  });

  it('is false for a card of any other type, and for no card', () => {
    expect(resolvesOnPlay({ type: 'personnel', gametext: '' })).toBe(false);
    expect(resolvesOnPlay(undefined)).toBe(false);
  });
});

const voyages = cardNamed('These Are The Voyages');
const atWhatCost = cardNamed('At What Cost?');

const inst = (id: string, card: any): CardInstance => ({ id, card: { ...card }, face: 'up' });

const slots = (): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, () => ({ mission: null, ships: [], awayTeam: [], underMission: [] }));

const table = (overrides: Partial<TableState> = {}): TableState => ({
  ...initialTableState,
  missions: slots(),
  hand: [inst('card-1', voyages), inst('card-2', atWhatCost)],
  ...overrides,
});

const run = (start: TableState | GameState, ...actions: GameAction[]): GameState =>
  actions.reduce(
    (state, action) => gameReducer(state, withShuffleOrders(state.table, action, state.log)),
    'log' in start ? start : initialGameState(start)
  );

const toResolving = (id: string) => ({ type: 'move', id, to: 'resolving' }) as const;

describe('tableReducer: the resolving zone (#1727)', () => {
  it('starts a new game and a reset at null', () => {
    expect(initialTableState.resolving).toBeNull();
    const reset = tableReducer(table({ resolving: inst('card-9', voyages) }), { type: 'reset', cards: [], missions: [], dilemmas: [] });
    expect(reset.resolving).toBeNull();
  });

  it('takes one card from the hand, face up', () => {
    const next = tableReducer(table(), toResolving('card-1'));
    expect(next.resolving).toMatchObject({ id: 'card-1', face: 'up' });
    expect(next.hand.map((c) => c.id)).toEqual(['card-2']);
  });

  it('refuses a second card while it holds one', () => {
    const first = tableReducer(table(), toResolving('card-1'));
    expect(tableReducer(first, toResolving('card-2'))).toBe(first);
    expect(tableReducer(first, toResolving('card-1'))).toBe(first);
  });

  it('is empty again once its card moves anywhere', () => {
    const first = tableReducer(table(), toResolving('card-1'));
    const discarded = tableReducer(first, { type: 'move', id: 'card-1', to: 'discard' });
    expect(discarded.resolving).toBeNull();
    expect(discarded.discard.map((c) => c.id)).toEqual(['card-1']);
    const back = tableReducer(first, { type: 'move', id: 'card-1', to: 'hand' });
    expect(back.resolving).toBeNull();
    expect(back.hand.map((c) => c.id)).toEqual(['card-2', 'card-1']);
  });

  it('holds advanceSegment and nextTurn while it holds a card, and lets them go once it is empty', () => {
    const resolving = tableReducer(table(), toResolving('card-1'));
    expect(tableReducer(resolving, { type: 'advanceSegment' })).toBe(resolving);
    expect(tableReducer(resolving, { type: 'nextTurn' })).toBe(resolving);
    const empty = tableReducer(resolving, { type: 'move', id: 'card-1', to: 'discard' });
    expect(tableReducer(empty, { type: 'advanceSegment' }).segment).toBe('orders');
    expect(tableReducer(empty, { type: 'nextTurn' }).turn).toBe(2);
  });
});

describe('gameReducer: the charge and the log of the resolving zone (#1727)', () => {
  it('charges These Are The Voyages 1 into the resolving zone, and logs a play', () => {
    const state = run(table(), toResolving('card-1'));
    expect(state.log).toHaveLength(1);
    expect(logEntryText(state.log[0])).toBe('Played These Are The Voyages (cost 1)');
    expect(turnCounters(state.log, 1).spent).toBe(1);
  });

  it('charges At What Cost? 0', () => {
    const state = run(table(), toResolving('card-2'));
    expect(logEntryText(state.log[0])).toMatch(/^Played At What Cost\? \(cost 0\b/);
    expect(turnCounters(state.log, 1).spent).toBe(0);
  });

  it('charges nothing out of the resolving zone, and logs the resolve', () => {
    const state = run(table(), toResolving('card-1'), { type: 'move', id: 'card-1', to: 'discard' });
    expect(state.log).toHaveLength(2);
    expect(logEntryText(state.log[1])).toBe('Resolved These Are The Voyages, and it went to the discard pile');
    expect(turnCounters(state.log, 1).spent).toBe(1);
  });

  it('charges nothing for a move from the hand straight to the discard pile', () => {
    const state = run(table(), { type: 'move', id: 'card-1', to: 'discard' });
    expect(turnCounters(state.log, 1).spent).toBe(0);
    expect(logEntryText(state.log[0])).toBe('Moved These Are The Voyages from the hand to the discard pile');
  });

  it('charges nothing outside play and draw', () => {
    const state = run(table({ segment: 'orders' }), toResolving('card-1'));
    expect(turnCounters(state.log, 1).spent).toBe(0);
    expect(logEntryText(state.log[0])).toBe('Moved These Are The Voyages from the hand to the resolving zone');
  });

  it('makes no entry for a refused second play, nor for a held next-turn button', () => {
    const state = run(table(), toResolving('card-1'), toResolving('card-2'), { type: 'advanceSegment' }, { type: 'nextTurn' });
    expect(state.log).toHaveLength(1);
    expect(state.undo).toHaveLength(1);
    expect(state.table.hand.map((c) => c.id)).toEqual(['card-2']);
  });

  it('takes the play back with one undo, and redo plays it again', () => {
    const played = run(table(), toResolving('card-1'));
    const undone = gameReducer(played, { type: 'undo' });
    expect(undone.table.resolving).toBeNull();
    expect(undone.table.hand.map((c) => c.id)).toEqual(['card-1', 'card-2']);
    expect(turnCounters(undone.log, 1).spent).toBe(0);
    const redone = gameReducer(undone, { type: 'redo' });
    expect(redone.table.resolving?.id).toBe('card-1');
    expect(turnCounters(redone.log, 1).spent).toBe(1);
  });
});

describe('savedGame: the resolving zone (#1727)', () => {
  const deck: DeckList = {
    voyages: { count: 1, row: voyages },
    atWhatCost: { count: 1, row: atWhatCost },
  };

  it('keeps the resolving card through a save and its history', () => {
    const game = run(table(), toResolving('card-1'));
    const json = JSON.stringify(toSavedGame(game.table, deck, 'builder', undefined, undefined, game.log));
    const restored = fromSavedGame(json, deck, toSavedHistory(game, deck))!;
    expect(restored.table.resolving).toMatchObject({ id: 'card-1', face: 'up', card: voyages });
    expect(restored.undo).toHaveLength(1);
    expect(restored.undo[0].resolving).toBeNull();
    expect(restored.undo[0].hand.map((c) => c.id)).toEqual(['card-1', 'card-2']);
  });

  it('restores a save from before #1727 with null', () => {
    const saved = toSavedGame(table(), deck, 'builder');
    delete (saved.table as Record<string, unknown>).resolving;
    expect(fromSavedGame(JSON.stringify(saved), deck)!.table.resolving).toBeNull();
  });

  it.each([
    ['a string', 'card-1'],
    ['an object with no key', { id: 'card-1', face: 'up' }],
    ['a key not in the deck', { id: 'card-1', face: 'up', key: 'elsewhere' }],
  ])('restores a malformed resolving card, %s, with null and keeps the rest of the save', (_, resolving) => {
    const saved = toSavedGame(table(), deck, 'builder');
    const restored = fromSavedGame(JSON.stringify({ ...saved, table: { ...saved.table, resolving } }), deck)!;
    expect(restored.table.resolving).toBeNull();
    expect(restored.table.hand.map((c) => c.id)).toEqual(['card-1', 'card-2']);
  });
});

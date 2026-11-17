// Cancel of the resolving event (#1728): the event goes back to the end of the hand, and the play's
// charge is refunded through the log, its pending discount included, in one entry that one undo takes back.
import { readFileSync } from 'fs';
import { join } from 'path';
import { initialTableState, CardInstance, MissionSlot, MISSION_SLOTS, TableState } from '../../../app/decks/practice/tableReducer';
import {
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  isLogEntry,
  LogEntry,
  logEntryText,
  pendingDiscountsOf,
  turnCounters,
  turnPlaysOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { fromSavedGame, toSavedGame, toSavedHistory } from '../../../app/decks/practice/savedGame';
import { DeckList } from '../../../types';

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
const play = { type: 'move', id: 'card-1', to: 'resolving' } as const;
const cancel = { type: 'cancelResolving' } as const;

describe('cancelResolving (#1728)', () => {
  it('moves the event to the end of the hand, refunds its charge and logs one entry', () => {
    const played = run(table(), play);
    expect(turnCounters(played.log, 1).spent).toBe(1);
    const cancelled = run(played, cancel);
    expect(cancelled.table.resolving).toBeNull();
    expect(cancelled.table.hand.map((c) => c.id)).toEqual(['card-2', 'card-1']);
    expect(cancelled.log).toHaveLength(2);
    expect(logEntryText(cancelled.log[1])).toBe('Cancelled playing These Are The Voyages');
    expect(turnCounters(cancelled.log, 1).spent).toBe(0);
    expect(turnPlaysOf(cancelled.log, 1)).toEqual([]);
  });

  it('is taken back by one undo, charged again, and redo cancels again', () => {
    const cancelled = run(table(), play, cancel);
    const undone = gameReducer(cancelled, { type: 'undo' });
    expect(undone.table.resolving?.id).toBe('card-1');
    expect(undone.log).toHaveLength(1);
    expect(turnCounters(undone.log, 1).spent).toBe(1);
    const redone = gameReducer(undone, { type: 'redo' });
    expect(redone.table.resolving).toBeNull();
    expect(turnCounters(redone.log, 1).spent).toBe(0);
  });

  it('changes nothing and logs nothing with nothing resolving', () => {
    const state = initialGameState(table());
    expect(gameReducer(state, cancel)).toBe(state);
  });

  it('moves an event that was no play back too, and refunds nothing', () => {
    const state = run(table({ segment: 'orders' }), play, cancel);
    expect(state.table.hand.map((c) => c.id)).toEqual(['card-2', 'card-1']);
    expect(state.log[1]).not.toHaveProperty('target');
    expect(logEntryText(state.log[1])).toBe('Cancelled playing These Are The Voyages');
  });

  it('refunds only the cancelled play, after a correction of its charge too', () => {
    const played = run(table(), { type: 'move', id: 'card-2', to: 'core' }, play);
    const corrected = run(played, { type: 'correctCharge', target: { entry: 1, move: 0, card: 0 }, cost: 3 });
    expect(turnCounters(corrected.log, 1).spent).toBe(3);
    const cancelled = run(corrected, cancel);
    expect(turnCounters(cancelled.log, 1).spent).toBe(0);
    // A play again makes a new charge, which a second Cancel refunds.
    const again = run(cancelled, play);
    expect(turnCounters(again.log, 1).spent).toBe(1);
    expect(turnCounters(run(again, cancel).log, 1).spent).toBe(0);
  });

  it('leaves a pending discount the play used pending again', () => {
    const origin = { entry: 0, move: 0, card: 0 };
    const log: LogEntry[] = [
      {
        kind: 'move',
        moves: [{ cards: ['Sarish Rez Ministerial Adjutant'], from: { kind: 'hand' }, to: { kind: 'core' }, costs: [3] }],
        turn: 1,
        segment: 'playAndDraw',
      },
      {
        kind: 'move',
        moves: [
          {
            cards: ['These Are The Voyages'],
            from: { kind: 'hand' },
            to: { kind: 'resolving' },
            costs: [0],
            sources: [{ title: 'Sarish Rez', reason: 'the next play', discount: origin }],
          },
        ],
        turn: 1,
        segment: 'playAndDraw',
      },
    ];
    const state: GameState = { table: table({ hand: [inst('card-2', atWhatCost)], resolving: inst('card-1', voyages) }), log, undo: [], redo: [] };
    expect(pendingDiscountsOf(state.log, 1)).toEqual([]);
    const cancelled = gameReducer(state, cancel);
    expect(pendingDiscountsOf(cancelled.log, 1).map((d) => d.origin)).toEqual([origin]);
    // One undo uses it again.
    expect(pendingDiscountsOf(gameReducer(cancelled, { type: 'undo' }).log, 1)).toEqual([]);
  });

  it('keeps the entry through a save', () => {
    const deck: DeckList = { voyages: { count: 1, row: voyages }, atWhatCost: { count: 1, row: atWhatCost } };
    const game = run(table(), play, cancel);
    expect(isLogEntry(game.log[1])).toBe(true);
    const json = JSON.stringify(toSavedGame(game.table, deck, 'builder', undefined, undefined, game.log));
    const restored = fromSavedGame(json, deck, toSavedHistory(game, deck))!;
    expect(restored.log.map(logEntryText)).toEqual(game.log.map(logEntryText));
    expect(turnCounters(restored.log, 1).spent).toBe(0);
  });
});

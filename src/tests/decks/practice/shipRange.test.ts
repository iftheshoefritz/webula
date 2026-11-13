import {
  tableReducer,
  initialTableState,
  CardInstance,
  MISSION_SLOTS,
  TableState,
} from '../../../app/decks/practice/tableReducer';
import { gameReducer, initialGameState, logEntryText, LogEntry } from '../../../app/decks/practice/gameLog';
import { toSavedGame, toSavedHistory, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { DeckList } from '../../../types';

// The range a ship uses when it moves between missions (#1634): its printed Range less the
// printed spans of the two missions of each move, this turn.
const row = (collectorsinfo: string, name: string, type: string, extra: Record<string, string> = {}) => ({
  collectorsinfo,
  name,
  originalName: name,
  imagefile: `${collectorsinfo}.jpg`,
  type,
  ...extra,
});

const deck: DeckList = {
  moab: { count: 1, row: row('1M1', 'Moab IV', 'mission', { span: '2' }) },
  angel: { count: 1, row: row('1M2', 'Angel I', 'mission', { span: '2' }) },
  far: { count: 1, row: row('1M3', 'Far Away', 'mission', { span: '3' }) },
  relativity: { count: 1, row: row('1S1', 'Relativity', 'ship', { range: '8' }) },
  defiant: { count: 1, row: row('1S2', 'Defiant', 'ship', { range: '6' }) },
  data: { count: 1, row: row('1P1', 'Data', 'personnel') },
};

const inst = (id: string, key: string, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { ...deck[key].row },
  face: 'up',
  ...extra,
});

const missionCards = [inst('card-1', 'moab'), inst('card-2', 'angel'), inst('card-3', 'far')];

const start = (): TableState => ({
  ...initialTableState,
  hand: [inst('card-12', 'defiant')],
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: missionCards[i] ?? null,
    ships: i === 0 ? [inst('card-10', 'relativity', { crew: [inst('card-20', 'data')] }), inst('card-11', 'defiant')] : [],
    awayTeam: [],
    underMission: [],
  })),
});

const toRow = (id: string, missionIndex: number) => ({ type: 'move' as const, id, to: { zone: 'shipRow' as const, missionIndex } });

const lastText = (log: LogEntry[]) => logEntryText(log[log.length - 1]);

describe('tableReducer: the range a ship uses (#1634)', () => {
  it('adds the spans of both missions to a ship that moves between two ship rows', () => {
    const moved = tableReducer(start(), toRow('card-10', 1));
    expect(moved.rangeUsed).toEqual({ 'card-10': 4 });
    const again = tableReducer(moved, toRow('card-10', 2));
    expect(again.rangeUsed).toEqual({ 'card-10': 9 });
  });

  it('uses no range for a ship entering play, a drop on its own row, a ship leaving play, or the crew', () => {
    const table = start();
    expect(tableReducer(table, toRow('card-12', 1)).rangeUsed).toBeUndefined();
    expect(tableReducer(table, toRow('card-10', 0))).toBe(table);
    expect(tableReducer(table, { type: 'move', id: 'card-10', to: 'core' }).rangeUsed).toBeUndefined();
    expect(
      tableReducer(table, { type: 'move', id: 'card-20', to: { zone: 'crew', shipId: 'card-11' } }).rangeUsed
    ).toBeUndefined();
  });

  it('clears the range used at the next turn', () => {
    const moved = tableReducer(start(), toRow('card-10', 1));
    const next = tableReducer(moved, { type: 'nextTurn' });
    expect(next).not.toHaveProperty('rangeUsed');
  });
});

describe('the game log of a ship move (#1634)', () => {
  it('names the range used and the range left, then the overrun', () => {
    let game = gameReducer(initialGameState(start()), toRow('card-10', 1));
    expect(lastText(game.log)).toBe('Moved Relativity from Moab IV to Angel I (used range 4, 4 left)');
    game = gameReducer(game, toRow('card-10', 0));
    expect(lastText(game.log)).toBe('Moved Relativity from Angel I to Moab IV (used range 4, 0 left)');
    game = gameReducer(game, toRow('card-10', 1));
    expect(lastText(game.log)).toBe('Moved Relativity from Moab IV to Angel I (used range 4, over by 4)');
  });

  it('gives each ship of a group its own numbers', () => {
    const game = gameReducer(initialGameState(start()), {
      type: 'batch',
      actions: [toRow('card-10', 2), toRow('card-11', 2)],
    });
    expect(lastText(game.log)).toBe(
      'Moved Relativity and Defiant from Moab IV to Far Away (Relativity used range 5, 3 left; Defiant used range 5, 1 left)'
    );
  });

  it('adds nothing to a ship entering play, nor to an entry from before #1634', () => {
    const game = gameReducer(initialGameState(start()), toRow('card-12', 1));
    expect(lastText(game.log)).toBe('Moved Defiant from the hand to Angel I');
    const old: LogEntry = {
      turn: 1,
      kind: 'move',
      moves: [{ cards: ['Relativity'], from: { kind: 'shipRow', mission: 'Moab IV' }, to: { kind: 'shipRow', mission: 'Angel I' } }],
    };
    expect(logEntryText(old)).toBe('Moved Relativity from Moab IV to Angel I');
  });

  it('takes back the range used with one undo, and redo puts it back', () => {
    const moved = gameReducer(initialGameState(start()), toRow('card-10', 1));
    const undone = gameReducer(moved, { type: 'undo' });
    expect(undone.table.rangeUsed).toBeUndefined();
    expect(gameReducer(undone, { type: 'redo' }).table.rangeUsed).toEqual({ 'card-10': 4 });
  });
});

describe('the save of the range used (#1634)', () => {
  it('keeps the range used and its undo through a reload', () => {
    const game = gameReducer(initialGameState(start()), toRow('card-10', 1));
    const json = JSON.stringify(toSavedGame(game.table, deck, 'builder', undefined, undefined, game.log));
    const restored = fromSavedGame(json, deck, toSavedHistory(game, deck))!;
    expect(restored.table.rangeUsed).toEqual({ 'card-10': 4 });
    expect(logEntryText(restored.log[0])).toBe('Moved Relativity from Moab IV to Angel I (used range 4, 4 left)');
    const undone = gameReducer(
      { table: restored.table, log: restored.log, undo: restored.undo, redo: restored.redo },
      { type: 'undo' }
    );
    expect(undone.table.rangeUsed).toBeUndefined();
  });

  it('drops a malformed range used', () => {
    for (const rangeUsed of [{ 'card-10': -1 }, { 'card-10': 1.5 }, { 'card-10': '4' }, [4], 'x']) {
      const save = toSavedGame(start(), deck, 'builder');
      (save.table as any).rangeUsed = rangeUsed;
      expect(fromSavedGame(JSON.stringify(save), deck)!.table).not.toHaveProperty('rangeUsed');
    }
  });
});

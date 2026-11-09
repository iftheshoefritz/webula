import {
  tableReducer,
  initialTableState,
  createCardInstances,
  CardInstance,
  TableState,
  MISSION_SLOTS,
} from '../../../app/decks/practice/tableReducer';
import { toSavedGame, toSavedHistory, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { gameReducer, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import { DeckList } from '../../../types';

// The bot's brig (#1580): a hidden zone for the player's personnel the bot holds captive.

describe("the bot's brig on a dealt table", () => {
  const deck = [
    ...Array.from({ length: 40 }, (_, i) => ({ collectorsinfo: `p${i}`, name: `p${i}`, type: 'personnel' })),
    ...Array.from({ length: 2 }, (_, i) => ({ collectorsinfo: `s${i}`, name: `s${i}`, type: 'ship' })),
    ...Array.from({ length: 5 }, (_, i) => ({ collectorsinfo: `e${i}`, name: `e${i}`, type: 'event' })),
  ];
  const payload = () => ({
    cards: createCardInstances(deck),
    missions: createCardInstances(
      [0, 1, 2].map((i) => ({ collectorsinfo: `m${i}`, name: `m${i}`, type: 'mission' })),
      'up'
    ),
    dilemmas: createCardInstances(
      Array.from({ length: 10 }, (_, i) => ({ collectorsinfo: `d${i}`, name: `d${i}`, type: 'dilemma' }))
    ),
  });
  const dealt = () => tableReducer(initialTableState, { type: 'resetWithPiles', ...payload() });

  it('starts empty', () => {
    expect(initialTableState.botBrig).toEqual([]);
    expect(dealt().botBrig).toEqual([]);
  });

  it('takes an away team personnel out of the away team, and clears stopped', () => {
    const table = dealt();
    const captive = table.missions[0].awayTeam[0];
    const stopped = tableReducer(table, { type: 'setStopped', ids: [captive.id], stopped: true });
    expect(stopped.missions[0].awayTeam[0].stopped).toBe(true);

    const next = tableReducer(stopped, { type: 'move', id: captive.id, to: 'botBrig' });

    expect(next.missions[0].awayTeam.map((c) => c.id)).not.toContain(captive.id);
    expect(next.missions[0].awayTeam).toHaveLength(table.missions[0].awayTeam.length - 1);
    expect(next.botBrig.map((c) => c.id)).toEqual([captive.id]);
    expect(next.botBrig[0].stopped).toBeUndefined();
  });

  it('is emptied by a new game', () => {
    const table = dealt();
    const captive = table.missions[0].awayTeam[0];
    const moved = tableReducer(table, { type: 'move', id: captive.id, to: 'botBrig' });
    expect(tableReducer(moved, { type: 'reset', ...payload() }).botBrig).toEqual([]);
    expect(tableReducer(moved, { type: 'resetWithPiles', ...payload() }).botBrig).toEqual([]);
  });
});

describe("the bot's brig in the log, undo, redo and the save", () => {
  const row = (collectorsinfo: string, type: string, name = `Card ${collectorsinfo}`) => ({
    collectorsinfo,
    name,
    originalName: name,
    imagefile: collectorsinfo,
    type,
  });
  const savedDeck: DeckList = {
    mission: { count: 1, row: row('1M1', 'mission', 'Moab IV') },
    personnel: { count: 2, row: row('1P1', 'personnel', 'Data') },
  };
  const inst = (id: string, card: any, face: 'up' | 'down' = 'up'): CardInstance => ({ id, card: { ...card }, face });
  const startTable = (): TableState => ({
    ...initialTableState,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? inst('card-1', savedDeck.mission.row) : null,
      ships: [],
      awayTeam: i === 0 ? [inst('card-2', savedDeck.personnel.row), inst('card-3', savedDeck.personnel.row)] : [],
      underMission: [],
    })),
  });
  const captured = () => gameReducer(initialGameState(startTable()), { type: 'move', id: 'card-2', to: 'botBrig' });

  it('logs the move as one entry that names the bot\'s brig', () => {
    const game = captured();
    expect(game.log).toHaveLength(1);
    expect(logEntryText(game.log[0])).toMatch(/to the bot's brig$/);
  });

  it('undoes and redoes the move', () => {
    const undone = gameReducer(captured(), { type: 'undo' });
    expect(undone.table.botBrig).toEqual([]);
    expect(undone.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['card-2', 'card-3']);
    const redone = gameReducer(undone, { type: 'redo' });
    expect(redone.table.botBrig.map((c) => c.id)).toEqual(['card-2']);
    expect(redone.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['card-3']);
  });

  it('keeps the card and the undo through a reload', () => {
    const game = captured();
    const json = JSON.stringify(toSavedGame(game.table, savedDeck, 'builder', undefined, undefined, game.log));
    const restored = fromSavedGame(json, savedDeck, toSavedHistory(game, savedDeck))!;
    expect(restored.table).toEqual(game.table);
    expect(restored.table.botBrig.map((c) => c.id)).toEqual(['card-2']);

    const undone = gameReducer(
      { table: restored.table, log: restored.log, undo: restored.undo, redo: restored.redo },
      { type: 'undo' }
    );
    expect(undone.table.botBrig).toEqual([]);
    expect(undone.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['card-2', 'card-3']);
  });

  it('loads a save from before the zone with an empty bot brig', () => {
    const save = toSavedGame(startTable(), savedDeck, 'builder');
    const { botBrig, ...older } = save.table;
    expect(botBrig).toEqual([]);
    const restored = fromSavedGame(JSON.stringify({ ...save, table: older }), savedDeck)!;
    expect(restored).not.toBeNull();
    expect(restored.table.botBrig).toEqual([]);
    expect(restored.table).toEqual(startTable());
  });
});

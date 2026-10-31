import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { toSavedGame, toSavedHistory, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { GameAction, gameReducer, GameState, initialGameState, withShuffleOrders } from '../../../app/decks/practice/gameLog';
import { writeSavedHistory } from '../../../app/decks/practice/gameHistory';
import { DeckList } from '../../../types';

// The undo and redo histories in the save (#1401).

const row = (collectorsinfo: string, type: string) => ({ collectorsinfo, name: `Card ${collectorsinfo}`, imagefile: collectorsinfo, type });

const deck: DeckList = {
  mission: { count: 1, row: row('1M1', 'mission') },
  personnel: { count: 6, row: row('1P1', 'personnel') },
  event: { count: 2, row: row('1E1', 'event') },
  dilemma: { count: 4, row: row('1D1', 'dilemma') },
};

const inst = (id: string, card: any, face: 'up' | 'down' = 'down'): CardInstance => ({ id, card: { ...card }, face });

const startTable = (): TableState => ({
  ...initialTableState,
  drawDeck: [
    inst('card-1', deck.personnel.row),
    inst('card-2', deck.personnel.row),
    inst('card-3', deck.event.row),
    inst('card-4', deck.event.row),
    inst('card-5', deck.personnel.row),
  ],
  // A face-up dilemma on top, so a draw shuffles the pile first (#1283).
  dilemmaPile: [
    inst('card-6', deck.dilemma.row, 'up'),
    inst('card-7', deck.dilemma.row),
    inst('card-8', deck.dilemma.row, 'up'),
    inst('card-9', deck.dilemma.row),
  ],
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission: i === 0 ? inst('card-10', deck.mission.row, 'up') : null,
    ships: [],
    awayTeam: i === 0 ? [inst('card-11', deck.personnel.row, 'up'), inst('card-12', deck.personnel.row, 'up')] : [],
    underMission: [],
  })),
});

// Each action as the page dispatches it, with its shuffle chosen first.
const play = (start: TableState, actions: GameAction[]): GameState =>
  actions.reduce((state, action) => gameReducer(state, withShuffleOrders(state.table, action)), initialGameState(start));

const playedGame = (): GameState => {
  const played = play(startTable(), [
    { type: 'shuffle', location: 'drawDeck' },
    { type: 'drawCard', from: 'drawDeck', to: 'hand' },
    { type: 'drawCard', from: 'dilemmaPile', to: 'dilemmaHand' },
    { type: 'startAttempt', missionIndex: 0, personnel: 2, subtract: 0 },
    { type: 'move', id: 'card-12', to: 'core' },
    { type: 'endAttempt' },
    { type: 'adjustScore', delta: 5 },
    { type: 'shuffle', location: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } },
    { type: 'nextTurn' },
  ]);
  return [{ type: 'undo' } as const, { type: 'undo' } as const].reduce(gameReducer, played);
};

const save = (game: GameState): string => JSON.stringify(toSavedGame(game.table, deck, 'builder', undefined, undefined, game.log));

describe('the saved undo and redo histories (#1401)', () => {
  it('restores the undo and the redo chains that the game had in memory', () => {
    const game = playedGame();
    expect(game.undo.length).toBeGreaterThan(5);
    expect(game.redo).toHaveLength(2);

    const restored = fromSavedGame(save(game), deck, toSavedHistory(game, deck))!;

    expect(restored.table).toEqual(game.table);
    expect(restored.log).toEqual(game.log);
    expect(restored.undo).toEqual(game.undo);
    expect(restored.redo).toEqual(game.redo);
  });

  it('brings back the order a shuffle replaced, with undo after the restore', () => {
    const game = play(startTable(), [{ type: 'shuffle', location: 'dilemmaPile' }]);
    const restored = fromSavedGame(save(game), deck, toSavedHistory(game, deck))!;
    const undone = gameReducer(
      { table: restored.table, log: restored.log, undo: restored.undo, redo: restored.redo },
      { type: 'undo' }
    );
    expect(undone.table.dilemmaPile).toEqual(startTable().dilemmaPile);
    expect(undone.redo[0].table.dilemmaPile).toEqual(game.table.dilemmaPile);
  });

  it('shares the unchanged fields of neighbouring restored tables', () => {
    const game = play(startTable(), [{ type: 'adjustScore', delta: 5 }, { type: 'adjustScore', delta: 5 }]);
    const restored = fromSavedGame(save(game), deck, toSavedHistory(game, deck))!;
    expect(restored.undo[0].drawDeck).toBe(restored.undo[1].drawDeck);
    expect(restored.undo[1].missions[0]).toBe(restored.table.missions[0]);
  });

  it('restores empty histories from a save with no history', () => {
    const game = playedGame();
    const restored = fromSavedGame(save(game), deck)!;
    expect(restored.table).toEqual(game.table);
    expect(restored.log).toEqual(game.log);
    expect(restored.undo).toEqual([]);
    expect(restored.redo).toEqual([]);
  });

  it('drops the history, and keeps the table and the log, when a step does not match the table', () => {
    const game = playedGame();
    const history = toSavedHistory(game, deck);
    // A later action that the history never saw.
    const later = play(game.table, [{ type: 'move', id: 'card-1', to: 'discard' }]);
    const stale = { ...later, log: game.log };

    const restored = fromSavedGame(save(stale), deck, history)!;

    expect(restored.table).toEqual(later.table);
    expect(restored.log).toEqual(game.log);
    expect(restored.undo).toEqual([]);
    expect(restored.redo).toEqual([]);
  });

  it('drops the history when the log has another length than the history saw', () => {
    const game = playedGame();
    const history = toSavedHistory(game, deck);
    const restored = fromSavedGame(save({ ...game, log: game.log.slice(1) }), deck, history)!;
    expect(restored.undo).toEqual([]);
  });

  it('drops the history when a card key is missing from the deck', () => {
    const game = playedGame();
    const history = toSavedHistory(game, deck).replace(/"key":"event"/g, '"key":"gone"');
    const restored = fromSavedGame(save(game), deck, history)!;
    expect(restored.table).toEqual(game.table);
    expect(restored.undo).toEqual([]);
    expect(restored.redo).toEqual([]);
  });

  it('drops a history with bad JSON or an unknown version', () => {
    const game = playedGame();
    expect(fromSavedGame(save(game), deck, '{')!.undo).toEqual([]);
    const history = JSON.parse(toSavedHistory(game, deck));
    expect(fromSavedGame(save(game), deck, JSON.stringify({ ...history, version: 99 }))!.undo).toEqual([]);
  });

  it('repairs a restored undo table as it repairs the table', () => {
    const game = play(startTable(), [{ type: 'startAttempt', missionIndex: 0, personnel: 2, subtract: 0 }]);
    const history = JSON.parse(toSavedHistory(game, deck));
    // An attempt at a slot with no mission card does not load.
    history.undo[0].f.attempt[1] = { v: { ...game.table.attempt, missionIndex: 3 } };
    const savedGame = JSON.parse(save(game));
    savedGame.table.attempt = { ...game.table.attempt, missionIndex: 3 };
    const restored = fromSavedGame(JSON.stringify(savedGame), deck, JSON.stringify(history))!;
    expect(restored.table.attempt).toBeUndefined();
    expect(restored.undo).toHaveLength(1);
    expect(restored.undo[0].attempt).toBeUndefined();
  });

  describe('writeSavedHistory, with a full quota', () => {
    const game = (): GameState => playedGame();

    it('keeps the newest undo steps that fit, and remembers how many', () => {
      const g = game();
      const written: string[] = [];
      const room = toSavedHistory(g, deck, 2).length;
      const write = (json: string) => {
        if (json.length > room) throw new Error('QuotaExceededError');
        written.push(json);
      };
      const limit = writeSavedHistory(g, (keep, keepRedo) => toSavedHistory(g, deck, keep, keepRedo), write, jest.fn(), Infinity);

      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(2);
      const restored = fromSavedGame(save(g), deck, written[0])!;
      expect(restored.undo).toEqual(g.undo.slice(g.undo.length - limit));
      expect(restored.redo).toEqual(g.redo);
    });

    it('drops the redo steps, then removes the key, when nothing fits', () => {
      const g = game();
      const remove = jest.fn();
      const seen: string[] = [];
      const limit = writeSavedHistory(
        g,
        (keep, keepRedo) => toSavedHistory(g, deck, keep, keepRedo),
        (json) => {
          seen.push(json);
          throw new Error('QuotaExceededError');
        },
        remove,
        Infinity
      );
      expect(limit).toBe(0);
      expect(JSON.parse(seen[seen.length - 1])).toMatchObject({ undo: [], redo: [] });
      expect(remove).toHaveBeenCalled();
    });

    it('keeps every step when the write fits', () => {
      const g = game();
      const write = jest.fn();
      expect(writeSavedHistory(g, (keep, keepRedo) => toSavedHistory(g, deck, keep, keepRedo), write, jest.fn(), Infinity)).toBe(Infinity);
      expect(write).toHaveBeenCalledTimes(1);
    });
  });
});

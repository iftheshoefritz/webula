import {
  tableReducer,
  initialTableState,
  createCardInstances,
  seedInstanceIds,
  CardInstance,
  TableState,
  MISSION_SLOTS,
} from '../../../app/decks/practice/tableReducer';
import { toSavedGame, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { LogEntry } from '../../../app/decks/practice/gameLog';
import { DeckList } from '../../../types';

const row = (collectorsinfo: string, type: string, extra: Record<string, any> = {}) => ({
  collectorsinfo,
  name: `Card ${collectorsinfo}`,
  imagefile: `${collectorsinfo}.jpg`,
  type,
  ...extra,
});

// Two rows share an `imagefile` and a `collectorsinfo` on purpose: only the deck key tells them apart.
const deck: DeckList = {
  mission: { count: 1, row: row('1M1', 'mission') },
  ship: { count: 1, row: row('1S1', 'ship') },
  personnelA: { count: 2, row: row('1P1', 'personnel') },
  personnelB: { count: 1, row: row('1P1', 'personnel', { name: 'Other personnel' }) },
  event: { count: 1, row: row('1E1', 'event') },
  dilemma: { count: 1, row: row('1D1', 'dilemma') },
};

const inst = (id: string, card: any, face: 'up' | 'down' = 'up', extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { ...card },
  face,
  ...extra,
});

// A dealt table with cards in several zones, a crew, a placed card, a stopped card, and a flipped
// mission whose `backimagefile` came from the card database (the deck row lacks it).
const dealtTable = (): TableState => ({
  ...initialTableState,
  drawDeck: [inst('card-1', deck.personnelA.row, 'down')],
  hand: [inst('card-2', deck.personnelB.row)],
  core: [inst('card-3', deck.event.row)],
  dilemmaPile: [inst('card-4', deck.dilemma.row, 'down')],
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
    mission:
      i === 0
        ? inst('card-5', { ...deck.mission.row, backimagefile: '1M1b.jpg' }, 'up', {
            flipped: true,
            placedOn: [inst('card-9', deck.event.row)],
          })
        : null,
    ships: i === 0 ? [inst('card-6', deck.ship.row, 'up', { crew: [inst('card-7', deck.personnelA.row)] })] : [],
    awayTeam: i === 1 ? [inst('card-12', deck.personnelA.row, 'down', { stopped: true })] : [],
    underMission: [],
  })),
  turn: 3,
  score: 15,
});

describe('savedGame', () => {
  it('round-trips a dealt table through JSON', () => {
    const table = dealtTable();
    const json = JSON.stringify(toSavedGame(table, deck, 'builder'));
    const restored = fromSavedGame(json, deck);
    expect(restored).not.toBeNull();
    expect(restored!.table).toEqual(table);
    expect(restored!.source).toBe('builder');
    expect(restored!.maxInstanceId).toBe(12);
  });

  it('keeps a face-up dilemma at the bottom of the dilemma pile face up (#987)', () => {
    const table = tableReducer(dealtTable(), { type: 'move', id: 'card-2', to: 'dilemmaPile', position: 'bottom' });
    const restored = fromSavedGame(JSON.stringify(toSavedGame(table, deck, 'builder')), deck)!;
    expect(restored.table.dilemmaPile.map((c) => [c.id, c.face])).toEqual([
      ['card-4', 'down'],
      ['card-2', 'up'],
    ]);
  });

  it('keeps the two rows that share a collectorsinfo apart', () => {
    const restored = fromSavedGame(JSON.stringify(toSavedGame(dealtTable(), deck, 'builder')), deck)!;
    expect(restored.table.drawDeck[0].card.name).toBe('Card 1P1');
    expect(restored.table.hand[0].card.name).toBe('Other personnel');
  });

  it('saves no card row inside the table, and repairs the mission row in the saved deck', () => {
    const save = toSavedGame(dealtTable(), deck, 'builder');
    const json = JSON.stringify(save.table);
    expect(json).not.toContain('imagefile');
    expect(json).not.toContain('"card"');
    expect(save.table.hand[0]).toEqual({ id: 'card-2', key: 'personnelB', face: 'up' });
    expect(save.dealtDeck.mission.row.backimagefile).toBe('1M1b.jpg');
    expect(deck.mission.row).not.toHaveProperty('backimagefile');
  });

  it('drops a builder save when the current deck differs by one count', () => {
    const json = JSON.stringify(toSavedGame(dealtTable(), deck, 'builder'));
    const edited = { ...deck, personnelA: { ...deck.personnelA, count: 3 } };
    expect(fromSavedGame(json, edited)).toBeNull();
  });

  it('restores a drive save even when the current deck differs', () => {
    const json = JSON.stringify(toSavedGame(dealtTable(), deck, 'drive', 'file-1'));
    const restored = fromSavedGame(json, {});
    expect(restored).not.toBeNull();
    expect(restored!.source).toBe('drive');
    expect(restored!.driveFileId).toBe('file-1');
    expect(restored!.table).toEqual(dealtTable());
  });

  it('saves the Drive deck name and restores it (#1407)', () => {
    const save = toSavedGame(dealtTable(), deck, 'drive', 'file-1', undefined, [], 'Borg Deck');
    expect(save.driveFileName).toBe('Borg Deck');
    expect(fromSavedGame(JSON.stringify(save), {})!.driveFileName).toBe('Borg Deck');
    // A save made before #1407 has no name.
    expect(fromSavedGame(JSON.stringify(toSavedGame(dealtTable(), deck, 'drive', 'file-1')), {})!.driveFileName).toBeUndefined();
  });

  it('saves the game log and restores it (#1400)', () => {
    const log: LogEntry[] = [
      { kind: 'draw', from: 'drawDeck', to: 'hand', turn: 1 },
      { kind: 'nextTurn', turn: 2 },
      { kind: 'move', moves: [{ cards: ['Card 1E1'], from: { kind: 'hand' }, to: { kind: 'core' } }], turn: 2 },
    ];
    const save = toSavedGame(dealtTable(), deck, 'builder', undefined, undefined, log);
    expect(save.log).toEqual(log);
    const restored = fromSavedGame(JSON.stringify(save), deck);
    expect(restored!.log).toEqual(log);
    expect(restored!.table).toEqual(dealtTable());
  });

  it('restores a save with no log, or a malformed one, with an empty log and the table (#1400)', () => {
    const { log: _log, ...old } = toSavedGame(dealtTable(), deck, 'builder');
    expect(fromSavedGame(JSON.stringify(old), deck)!.log).toEqual([]);
    for (const bad of ['text', { kind: 'nextTurn', turn: 2 }, [{ kind: 'nextTurn' }], [{ kind: 'nope', turn: 1 }], [null]]) {
      const restored = fromSavedGame(JSON.stringify({ ...old, log: bad }), deck);
      expect(restored!.log).toEqual([]);
      expect(restored!.table).toEqual(dealtTable());
    }
  });

  it('drops bad JSON and an unknown version', () => {
    expect(fromSavedGame('{not json', deck)).toBeNull();
    const save = { ...toSavedGame(dealtTable(), deck, 'builder'), version: 99 };
    expect(fromSavedGame(JSON.stringify(save), deck)).toBeNull();
  });

  it('keeps the bot game flag (#1289)', () => {
    const json = JSON.stringify(toSavedGame({ ...dealtTable(), opponent: 'bot' }, deck, 'builder'));
    expect(fromSavedGame(json, deck)!.table.opponent).toBe('bot');
    expect('opponent' in fromSavedGame(JSON.stringify(toSavedGame(dealtTable(), deck, 'builder')), deck)!.table).toBe(false);
  });

  it('restores a version-1 save with no bot game flag, and drops a later version (#1289)', () => {
    const save: any = toSavedGame(dealtTable(), deck, 'builder');
    const restored = fromSavedGame(JSON.stringify({ ...save, version: 1 }), deck);
    expect(restored).not.toBeNull();
    expect(restored!.table.opponent).toBeUndefined();
    expect(restored!.table).toEqual(dealtTable());
    expect(fromSavedGame(JSON.stringify({ ...save, version: 3 }), deck)).toBeNull();
  });

  it('keeps the bot\'s pile of a bot game, and a save with none restores as a Chula bot game (#1520)', () => {
    const botPile = { id: 'beginner:fed.txt', name: 'Federation Starter - Lucas Thompson', affiliations: ['federation'] };
    const json = JSON.stringify(toSavedGame({ ...dealtTable(), opponent: 'bot', botPile }, deck, 'builder'));
    expect(fromSavedGame(json, deck)!.table.botPile).toEqual(botPile);
    const chula = fromSavedGame(JSON.stringify(toSavedGame({ ...dealtTable(), opponent: 'bot' }, deck, 'builder')), deck)!.table;
    expect(chula.opponent).toBe('bot');
    expect('botPile' in chula).toBe(false);
    // A pile with no bot game, or a pile that is not sound, is dropped.
    expect('botPile' in fromSavedGame(JSON.stringify(toSavedGame({ ...dealtTable(), botPile }, deck, 'builder')), deck)!.table).toBe(false);
    const bad: any = toSavedGame({ ...dealtTable(), opponent: 'bot' }, deck, 'builder');
    bad.table.botPile = { id: 3, name: 'x' };
    expect('botPile' in fromSavedGame(JSON.stringify(bad), deck)!.table).toBe(false);
  });

  it('keeps the bot\'s Unexpected Difficulties and its use in a bot game, and drops them outside one (#1563)', () => {
    const botPile = { id: 'beginner:tos.txt', name: 'TOS', affiliations: ['federation'], unexpectedDifficulties: true as const };
    const used = { ...dealtTable(), opponent: 'bot' as const, botPile, botUsedUnexpectedDifficulties: true as const };
    const restored = fromSavedGame(JSON.stringify(toSavedGame(used, deck, 'builder')), deck)!.table;
    expect(restored.botPile).toEqual(botPile);
    expect(restored.botUsedUnexpectedDifficulties).toBe(true);
    const solo = fromSavedGame(JSON.stringify(toSavedGame({ ...used, opponent: undefined }, deck, 'builder')), deck)!.table;
    expect('botUsedUnexpectedDifficulties' in solo).toBe(false);
    expect('botPile' in solo).toBe(false);
    const bad: any = toSavedGame(used, deck, 'builder');
    bad.table.botUsedUnexpectedDifficulties = 'yes';
    bad.table.botPile.unexpectedDifficulties = 1;
    const repaired = fromSavedGame(JSON.stringify(bad), deck)!.table;
    expect('botUsedUnexpectedDifficulties' in repaired).toBe(false);
    expect('botPile' in repaired).toBe(false);
  });

  it('drops an opponent that is not the bot (#1289)', () => {
    const save: any = toSavedGame(dealtTable(), deck, 'builder');
    save.table.opponent = 'human';
    expect('opponent' in fromSavedGame(JSON.stringify(save), deck)!.table).toBe(false);
  });

  it('drops a save with a card whose key is not in the saved deck', () => {
    const save = toSavedGame(dealtTable(), deck, 'drive');
    save.table.hand[0].key = 'missing';
    expect(fromSavedGame(JSON.stringify(save), deck)).toBeNull();
  });

  it('keeps a completed mission, and loads an older save with no completion as not complete (#991)', () => {
    const table = tableReducer(dealtTable(), { type: 'setMissionCompleted', missionIndex: 0, completed: true });
    const save: any = toSavedGame(table, deck, 'builder');
    expect(fromSavedGame(JSON.stringify(save), deck)!.table.missions[0].completed).toBe(true);

    delete save.table.missions[0].completed;
    const old = fromSavedGame(JSON.stringify(save), deck)!;
    expect(old.table.missions.every((slot) => !slot.completed)).toBe(true);
  });

  it('gives a top-level field that the save lacks its default', () => {
    const save: any = toSavedGame(dealtTable(), deck, 'builder');
    delete save.table.score;
    delete save.table.brig;
    const restored = fromSavedGame(JSON.stringify(save), deck)!;
    expect(restored.table.score).toBe(initialTableState.score);
    expect(restored.table.brig).toEqual([]);
    expect(restored.table.turn).toBe(3);
  });

  it('seedInstanceIds moves the next instance ID past every restored ID', () => {
    const restored = fromSavedGame(JSON.stringify(toSavedGame(dealtTable(), deck, 'builder')), deck)!;
    seedInstanceIds(restored.maxInstanceId);
    const [created] = createCardInstances([deck.event.row]);
    expect(Number(created.id.replace('card-', ''))).toBeGreaterThan(12);
  });
});

describe('tableReducer restore', () => {
  it('replaces the state', () => {
    const next = dealtTable();
    expect(tableReducer(initialTableState, { type: 'restore', state: next })).toBe(next);
  });
});

// An invented playtest card (#1615): no playtest card is ever committed.
describe('a saved game with a playtest card (#1615)', () => {
  it('restores the playtest row unchanged', () => {
    const gadget = row('PT-9004A', 'equipment', { originalName: 'Test Gadget', imagefile: '9004A', set: 'playtest' });
    const playtestDeck: DeckList = {
      mission: { count: 1, row: row('1M1', 'mission') },
      'PT-9004A': { count: 2, row: gadget },
    };
    const table = tableReducer(initialTableState, {
      type: 'reset',
      cards: createCardInstances([gadget, gadget]),
      missions: createCardInstances([row('1M1', 'mission')], 'up'),
      dilemmas: [],
    });
    const json = JSON.stringify(toSavedGame(table, playtestDeck, 'builder'));

    const restored = fromSavedGame(json, playtestDeck);

    expect(restored).not.toBeNull();
    const cards = [...restored!.table.drawDeck, ...restored!.table.hand];
    expect(cards).toHaveLength(2);
    cards.forEach((card) => expect(card.card).toEqual(gadget));
    expect(restored!.dealtDeck['PT-9004A'].row).toEqual(gadget);
  });
});

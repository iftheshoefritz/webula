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

  it('drops bad JSON and an unknown version', () => {
    expect(fromSavedGame('{not json', deck)).toBeNull();
    const save = { ...toSavedGame(dealtTable(), deck, 'builder'), version: 99 };
    expect(fromSavedGame(JSON.stringify(save), deck)).toBeNull();
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

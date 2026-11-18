import {
  initialTableState,
  CardInstance,
  MissionSlot,
  MISSION_SLOTS,
  TableAction,
  TableState,
  tableReducer,
} from '../../../app/decks/practice/tableReducer';
import {
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  logEntryText,
  turnCharges,
  turnPlaysOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import {
  completionBatch,
  completionEffectOf,
  destroyShipsActions,
  discardActions,
  discardCandidates,
  discardableInvolved,
  downloadActions,
  downloadCandidates,
  flipActions,
  hqSlotsFor,
  involvedPersonnel,
  placeAtHqActions,
  toDeckBottomActions,
} from '../../../app/decks/practice/completionEffects';
import { toSavedGame, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { DeckList } from '../../../types';

// The effects of completing a mission on the player's own cards (#1757), with invented personnel.

const card = (name: string, type: string, extra: Record<string, string> = {}) => ({
  name: name.toLowerCase(),
  originalName: name,
  type,
  ...extra,
});
const inst = (id: string, name: string, type = 'personnel', extra: Record<string, string> = {}, more: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: card(name, type, extra),
  face: 'up',
  ...more,
});
const mission = (id: string, name: string, missiontype: string, extra: Record<string, string> = {}) =>
  inst(id, name, 'mission', { missiontype, ...extra });
const slots = (overrides: Partial<MissionSlot>[] = []): MissionSlot[] =>
  Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: null, ships: [], awayTeam: [], underMission: [], ...overrides[i] }));
const table = (overrides: Partial<TableState> = {}): TableState => ({ ...initialTableState, missions: slots(), ...overrides });
const play = (state: GameState, ...actions: GameAction[]) =>
  actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);

const ann = inst('p1', 'Ann Invented', 'personnel', { cost: '5', affiliation: 'federation', icons: '[DS9]', unique: 'Y' });
const bo = inst('p2', 'Bo Invented', 'personnel', { cost: '2', affiliation: 'federation', icons: '[DS9]', unique: 'Y' });
const cy = inst('p3', 'Cy Invented', 'personnel', { cost: '4', affiliation: 'federation', unique: 'Y' });
const kit = inst('q1', 'An Invented Kit', 'equipment', { cost: '1' });

describe('the effects of completing a mission (#1757)', () => {
  describe('who is involved', () => {
    const aldea = mission('m0', 'Aldea Aid Legendary Civilization', 'p');
    const start = () => table({ missions: slots([{ mission: aldea, awayTeam: [ann, bo, cy, kit] }]) });

    it('records the unstopped personnel of the row when the attempt ends, no equipment and no stopped one', () => {
      let t = tableReducer(start(), { type: 'startAttempt', missionIndex: 0, personnel: 3, subtract: 0 } as TableAction);
      expect(t.attempt).toBeDefined();
      t = tableReducer(t, { type: 'setStopped', ids: ['p2'], stopped: true });
      // In progress, the live row counts.
      expect(involvedPersonnel(t, 0).map((c) => c.id)).toEqual(['p1', 'p3']);
      t = tableReducer(t, { type: 'endAttempt' });
      expect(t.missions[0].involved).toEqual(['p1', 'p3']);
      expect(involvedPersonnel(t, 0).map((c) => c.id)).toEqual(['p1', 'p3']);
      // A personnel who left the table is no longer involved.
      t = tableReducer(t, { type: 'move', id: 'p1', to: 'discard' });
      expect(involvedPersonnel(t, 0).map((c) => c.id)).toEqual(['p3']);
    });

    it('has no one involved at a mission with no attempt', () => {
      expect(involvedPersonnel(start(), 0)).toEqual([]);
    });

    it('keeps the record through a save, and drops a malformed one alone', () => {
      const deck = { aldea: { count: 1, row: aldea.card }, ann: { count: 1, row: ann.card } } as unknown as DeckList;
      const t = { ...start(), missions: slots([{ mission: aldea, awayTeam: [ann], involved: ['p1'] }]) };
      const restored = fromSavedGame(JSON.stringify(toSavedGame(t, deck, 'drive')), deck);
      const saved = toSavedGame(t, deck, 'drive');
      expect(saved.table.missions[0].involved).toEqual(['p1']);
      const bad = { ...saved, table: { ...saved.table, missions: saved.table.missions.map((s, i) => (i === 0 ? { ...s, involved: [1] } : s)) } };
      const repaired = fromSavedGame(JSON.stringify(bad), deck);
      expect(restored!.table.missions[0].involved).toEqual(['p1']);
      expect(repaired!.table.missions[0].involved).toBeUndefined();
      expect(repaired!.table.missions[0].mission?.id).toBe('m0');
    });
  });

  it('finds the effect by the mission title, a *VP version too, and none for another mission', () => {
    const t = table({
      missions: slots([
        { mission: mission('m0', 'Gateway Flee in Terror *VP', 'p') },
        { mission: mission('m1', 'An Invented Mission', 'p') },
      ]),
    });
    expect(completionEffectOf(t, 0)?.kind).toBe('flip');
    expect(completionEffectOf(t, 1)).toBeUndefined();
  });

  it('Saturn downloads Population 9 Billion - All Borg and shuffles the draw deck, in one entry and one undo', () => {
    const borg = inst('e1', 'Population 9 Billion - All Borg', 'event', { cost: '5' }, { face: 'down' });
    const others = ['d1', 'd2', 'd3'].map((id) => inst(id, `Filler ${id}`, 'event', {}, { face: 'down' }));
    const t = table({ drawDeck: [others[0], borg, others[1], others[2]], missions: slots([{ mission: mission('m0', 'Saturn Continue Invasion', 's') }]) });
    const effect = completionEffectOf(t, 0)!;
    expect(downloadCandidates(t, effect).map((c) => c.id)).toEqual(['e1']);
    const start = initialGameState(t);
    const done = play(start, completionBatch(0, downloadActions('e1')));
    expect(done.table.missions[0].completed).toBe(true);
    expect(done.table.hand.map((c) => c.id)).toEqual(['e1']);
    expect(done.table.drawDeck).toHaveLength(3);
    expect(done.log).toHaveLength(1);
    expect(logEntryText(done.log[0])).toBe(
      'Marked Saturn Continue Invasion complete, and moved Population 9 Billion - All Borg from the draw deck to the hand, then shuffled the draw deck'
    );
    // No charge and no play.
    expect(turnCharges(done.log, done.table.turn)).toEqual([]);
    expect(turnPlaysOf(done.log, done.table.turn)).toEqual([]);
    const undone = play(done, { type: 'undo' });
    expect(undone.table).toEqual(t);
    expect(undone.log).toEqual([]);
  });

  describe('Starbase 718', () => {
    const hq = mission('m1', 'Earth Home of Starfleet Command', 'h');
    const klingonHq = mission('m2', "Qo'noS Heart of the Empire", 'h');
    const dup = inst('p9', 'Ann Invented', 'personnel', { cost: '1', affiliation: 'federation', unique: 'Y' });
    const plain = inst('p8', 'A Plain Invented', 'personnel', { cost: '1', affiliation: 'federation', unique: 'N' });
    const onTable = inst('p7', 'Dee Invented', 'personnel', { cost: '1', affiliation: 'federation', unique: 'Y' });
    const dee = inst('p6', 'Dee Invented', 'personnel', { cost: '1', affiliation: 'federation', unique: 'Y' });
    const start = () =>
      table({
        discard: [ann, dup, plain, dee, bo, { ...cy, removedFromGame: true }],
        missions: slots([
          { mission: mission('m0', 'Starbase 718 Investigate Cryosatellite', 's') },
          { mission: hq, awayTeam: [onTable] },
          { mission: klingonHq },
        ]),
      });

    it('offers each unique personnel of the discard pile once, none named like one on the table or removed from the game', () => {
      expect(discardCandidates(start()).map((c) => c.id)).toEqual(['p1', 'p2']);
    });

    it('offers only the headquarters where every pick could be played', () => {
      expect(hqSlotsFor(start(), [ann, bo])).toEqual([1]);
      expect(hqSlotsFor(start(), [])).toEqual([1, 2]);
    });

    it('places the picks in the away team of the headquarters, uncharged, in one entry', () => {
      const done = play(initialGameState(start()), completionBatch(0, placeAtHqActions(['p1'], 1)));
      expect(done.table.missions[1].awayTeam.map((c) => c.id)).toEqual(['p7', 'p1']);
      expect(done.log).toHaveLength(1);
      expect(turnCharges(done.log, done.table.turn)).toEqual([]);
      expect(logEntryText(done.log[0])).toMatch(/^Marked Starbase 718 Investigate Cryosatellite complete, and moved Ann Invented from the discard pile/);
    });
  });

  describe('Bassen Rift', () => {
    const ship = inst('s1', 'An Invented Ship', 'ship', { cost: '3' }, { crew: [ann, bo], placedOn: [inst('e2', 'An Invented Event', 'event')] });
    const start = (involved: string[]) =>
      table({ missions: slots([{ mission: mission('m0', 'Bassen Rift Interdict Genocidal Praetor', 's'), ships: [ship], involved }]) });

    it('offers only the involved personnel who cost 4 or more', () => {
      const t = start(['p1', 'p2']);
      expect(discardableInvolved(t, 0, completionEffectOf(t, 0)!).map((c) => c.id)).toEqual(['p1']);
      expect(discardableInvolved(start([]), 0, completionEffectOf(t, 0)!)).toEqual([]);
    });

    it('discards the picked personnel', () => {
      const done = play(initialGameState(start(['p1'])), completionBatch(0, discardActions(['p1'])));
      expect(done.table.discard.map((c) => c.id)).toEqual(['p1']);
      expect(done.table.missions[0].ships).toHaveLength(1);
    });

    it('destroys every ship here, with its crew and the cards on it', () => {
      const t = start([]);
      const done = play(initialGameState(t), completionBatch(0, destroyShipsActions(t, 0)));
      expect(done.table.missions[0].ships).toEqual([]);
      expect(done.table.discard.map((c) => c.id).sort()).toEqual(['e2', 'p1', 'p2', 's1']);
      expect(done.log).toHaveLength(1);
      expect(done.table.missions[0].completed).toBe(true);
    });
  });

  it('Aldea puts the picks beneath the draw deck in the order picked', () => {
    const deckCard = inst('d1', 'Filler', 'event', {}, { face: 'down' });
    const t = table({ drawDeck: [deckCard], missions: slots([{ mission: mission('m0', 'Aldea Aid Legendary Civilization', 'p'), awayTeam: [ann, bo], involved: ['p1', 'p2'] }]) });
    const done = play(initialGameState(t), completionBatch(0, toDeckBottomActions(['p2', 'p1'])));
    expect(done.table.drawDeck.map((c) => c.id)).toEqual(['d1', 'p2', 'p1']);
    expect(done.table.missions[0].awayTeam).toEqual([]);
  });

  describe('Gateway', () => {
    const gateway = mission('m0', 'Gateway Flee in Terror', 'p', { backimagefile: 'gateway-back.jpg' });

    it('flips the mission with its completion, in one entry, and one undo takes back both', () => {
      const t = table({ missions: slots([{ mission: gateway }]) });
      const done = play(initialGameState(t), completionBatch(0, flipActions(t, 0)));
      expect(done.table.missions[0]).toEqual(expect.objectContaining({ completed: true, mission: expect.objectContaining({ flipped: true }) }));
      expect(done.log.map(logEntryText)).toEqual(['Marked Gateway Flee in Terror complete, and flipped it to its back']);
      expect(play(done, { type: 'undo' }).table).toEqual(t);
    });

    it('does not flip back when marked not complete, and has nothing to flip when already flipped', () => {
      const t = table({ missions: slots([{ mission: gateway }]) });
      const done = play(initialGameState(t), completionBatch(0, flipActions(t, 0)), { type: 'setMissionCompleted', missionIndex: 0, completed: false });
      expect(done.table.missions[0].mission?.flipped).toBe(true);
      expect(flipActions(done.table, 0)).toEqual([]);
    });
  });

  it('a plain completion keeps the plain entry', () => {
    const t = table({ missions: slots([{ mission: mission('m0', 'Saturn Continue Invasion', 's') }]) });
    const done = play(initialGameState(t), { type: 'setMissionCompleted', missionIndex: 0, completed: true });
    expect(done.log.map(logEntryText)).toEqual(['Marked Saturn Continue Invasion complete']);
  });
});

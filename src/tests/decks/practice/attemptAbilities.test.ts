import { initialTableState, nextSegmentOf, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { gameReducer, GameAction, GameState, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import { attemptAbilitiesOf } from '../../../app/decks/practice/attemptAbilities';
import { attributesOnTableOf } from '../../../app/decks/practice/attributesOnTable';
import { endOfTurnTriggerSetUp, pendingTriggersOf } from '../../../app/decks/practice/triggers';
import { fromSavedGame, toSavedGame } from '../../../app/decks/practice/savedGame';
import type { DeckList } from '../../../types';
import { ATTEMPT_ABILITIES, ATTEMPT_ABILITY_TITLES, changesText, killsAtEndOfTurn } from '../../../lib/attemptAbilities';
import { triggerRowsOf } from '../../../lib/triggers';

// Issue #1835: the abilities used during an attempt (Storil Courageous Captain, Worf Honorable Explorer, Ikat'ika
// Honorable Warrior), their change for the rest of the attempt, and their delayed kill at the end of the turn. The
// titles are real; the rows hold only the fields the readers use, and the rest of the table is invented.

const card = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
});
const named = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) =>
  card(id, { type, name: name.toLowerCase(), originalName: name, ...extra });
const person = (id: string, name = `Crewman ${id}`) => named(id, name, 'personnel', { integrity: '5', cunning: '5', strength: '5' });
const storil = person('storil', 'Storil Courageous Captain');
const worf = person('worf', 'Worf Honorable Explorer');
const ikat = person('ikat', "Ikat'ika Honorable Warrior");
const ship = (crew: CardInstance[]): CardInstance => ({ ...named('ship', 'U.S.S. Saratoga', 'ship', { weapons: '6', shields: '7', range: '7' }), crew });
const space = named('m-space', 'Bilana System', 'mission', { missiontype: 's', quadrant: 'a' });
const planet = named('m-planet', 'Moab IV', 'mission', { missiontype: 'p', quadrant: 'a' });
const gamma = named('m-gamma', 'New Bajor', 'mission', { missiontype: 'p', quadrant: 'g' });

function table(crew: CardInstance[], awayTeam: CardInstance[] = [], gammaTeam: CardInstance[] = []): TableState {
  const cards = [planet, space, gamma];
  return {
    ...initialTableState,
    segment: 'playAndDraw',
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: cards[i] ?? null,
      ships: i === 1 ? [ship(crew)] : [],
      awayTeam: i === 0 ? awayTeam : i === 2 ? gammaTeam : [],
      underMission: [],
    })),
  };
}

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);
const spaceAttempt: GameAction = { type: 'startAttempt', missionIndex: 1, shipId: 'ship', personnel: 2, subtract: 0 };
const use = (id: string): GameAction => ({ type: 'useAttemptAbility', id, index: 0 });
const weaponsOf = (s: GameState) => attributesOnTableOf(s.table, true).ship?.weapons;

describe('the attempt ability registry (#1835)', () => {
  it('holds Storil and the two shipped-deck rows, each with a delayed kill row, and Security Drills (#1959)', () => {
    expect(ATTEMPT_ABILITY_TITLES).toEqual(['Storil Courageous Captain', 'Worf Honorable Explorer', "Ikat'ika Honorable Warrior", 'Security Drills']);
    for (const a of ATTEMPT_ABILITIES.filter(killsAtEndOfTurn)) {
      expect(triggerRowsOf(a.title).map((r) => [r.event.kind, r.source, r.useCost, r.afterAbility])).toEqual([['turnEnding', 'table', { kind: 'killSelf' }, 0]]);
    }
    expect(changesText({ weapons: 5 })).toBe('Weapons +5');
    expect(changesText({ integrity: 2, cunning: 2, strength: 2 })).toBe('attributes +2');
  });
});

describe("Storil's ability (#1835)", () => {
  const start = () => run(initialGameState(table([storil, person('c2')])), spaceAttempt);

  it('is offered only while he is an unstopped member of the attempting group', () => {
    expect(attemptAbilitiesOf(initialGameState(table([storil])))).toEqual([]);
    const offers = attemptAbilitiesOf(start());
    expect(offers.map((o) => [o.id, o.targetId, o.ability.label])).toEqual([['storil', 'ship', 'Weapons +5']]);
    const stopped = run(start(), { type: 'setStopped', ids: ['storil'], stopped: true });
    expect(attemptAbilitiesOf(stopped)).toEqual([]);
  });

  it('raises the ship\'s Weapons by 5 for the rest of the attempt, in one entry, once a turn; one undo takes it back', () => {
    const before = start();
    expect(weaponsOf(before)).toBeUndefined();
    const used = run(before, use('storil'));
    expect(used.table.attempt?.timed).toEqual([{ title: 'Storil Courageous Captain', sourceId: 'storil', targetId: 'ship', changes: { weapons: 5 } }]);
    expect(weaponsOf(used)).toBe(11);
    expect(attributesOnTableOf(used.table, false)).toEqual({});
    expect(used.log).toHaveLength(before.log.length + 1);
    expect(logEntryText(used.log.at(-1)!)).toBe(
      'Storil Courageous Captain: made U.S.S. Saratoga Weapons +5 until the end of this mission attempt; it is killed at the end of this turn'
    );
    expect(attemptAbilitiesOf(used)).toEqual([]);
    expect(run(used, use('storil'))).toBe(used);
    const undone = run(used, { type: 'undo' });
    expect(undone.table.attempt?.timed).toBeUndefined();
    expect(attemptAbilitiesOf(undone)).toHaveLength(1);
  });

  it('ends with the attempt: the Weapons go back to printed', () => {
    const ended = run(start(), use('storil'), { type: 'endAttempt' });
    expect(ended.table.attempt).toBeUndefined();
    expect(weaponsOf(ended)).toBeUndefined();
  });

  // Rulebook v4, "3. Discard Excess Cards", p. 13: "Next, you may complete any actions that happen 'at the end of
  // each of your turns.' … Once you have done these things, your turn ends. At this time, all stopped cards … become
  // unstopped" (#1946).
  const advance: GameAction = { type: 'advanceSegment' };
  const killOffers = (s: GameState) => pendingTriggersOf(s).map((o) => [o.row.title, o.source?.id, o.event.kind]);

  it('takes the turn through discard, with 7 or fewer cards in hand, and offers the kill there', () => {
    const used = run(start(), use('storil'), { type: 'endAttempt' });
    expect(used.table.segment).toBe('orders');
    expect(pendingTriggersOf(used)).toEqual([]);
    expect(endOfTurnTriggerSetUp(used)).toBe(true);
    expect(nextSegmentOf(used.table, endOfTurnTriggerSetUp(used))).toBe('discard');
    const discard = run(used, advance);
    expect([discard.table.segment, discard.table.turn]).toEqual(['discard', 1]);
    expect(killOffers(discard)).toEqual([['Storil Courageous Captain', 'storil', 'turnEnding']]);
    // One undo goes back to orders.
    expect(run(discard, { type: 'undo' }).table.segment).toBe('orders');
  });

  it('keeps the offer through the discards of the segment; taken, he goes to the discard pile this turn, and one undo restores him', () => {
    const discard = run(start(), use('storil'), { type: 'endAttempt' }, advance);
    const moved = run(discard, { type: 'move', id: 'c2', to: 'discard' });
    const offers = pendingTriggersOf(moved);
    expect(offers.map((o) => [o.row.title, o.source?.id])).toEqual([['Storil Courageous Captain', 'storil']]);
    const killed = run(moved, { type: 'useTrigger', target: offers[0].target });
    expect(killed.table.discard.map((c) => c.id)).toEqual(['c2', 'storil']);
    expect(killed.table.turn).toBe(1);
    expect(killed.log.at(-1)).toMatchObject({ kind: 'triggerUsed', turn: 1, segment: 'discard' });
    expect(logEntryText(killed.log.at(-1)!)).toBe('Storil Courageous Captain: killed it');
    expect(pendingTriggersOf(killed)).toEqual([]);
    const undone = run(killed, { type: 'undo' });
    expect(undone.table.missions[1].ships[0].crew?.map((c) => c.id)).toEqual(['storil']);
    expect(pendingTriggersOf(undone)).toHaveLength(1);
  });

  it('is gone once skipped, and the turn still ends with it untaken, with no offer at the start of the next turn', () => {
    const discard = run(start(), use('storil'), { type: 'endAttempt' }, advance);
    const skipped = run(discard, { type: 'skipTrigger', target: pendingTriggersOf(discard)[0].target });
    expect(pendingTriggersOf(skipped)).toEqual([]);
    const next = run(discard, advance);
    expect([next.table.segment, next.table.turn]).toEqual(['playAndDraw', 2]);
    expect(pendingTriggersOf(next)).toEqual([]);
    expect(next.table.missions[1].ships[0].crew?.map((c) => c.id)).toEqual(['storil', 'c2']);
  });

  it('sets up no kill without a use, and none a turn later', () => {
    const ended = run(start(), { type: 'endAttempt' });
    expect(endOfTurnTriggerSetUp(ended)).toBe(false);
    const next = run(ended, advance);
    expect([next.table.segment, next.table.turn]).toEqual(['playAndDraw', 2]);
    expect(pendingTriggersOf(next)).toEqual([]);
    const twoLater = run(start(), use('storil'), { type: 'endAttempt' }, advance, advance, advance, advance);
    expect(twoLater.table.turn).toBe(3);
    expect(pendingTriggersOf(twoLater)).toEqual([]);
  });

  it('still offers, in a save from before #1946, a kill pending at the start of the next turn', () => {
    // The old log: the use, then a next turn straight from orders, with no discard segment.
    const used = run(start(), use('storil'), { type: 'endAttempt' });
    const old = run(used, { type: 'nextTurn' });
    expect(old.log.at(-1)).toMatchObject({ kind: 'nextTurn', turn: 2 });
    const offers = pendingTriggersOf(old);
    expect(offers.map((o) => [o.row.title, o.source?.id, o.event.kind])).toEqual([['Storil Courageous Captain', 'storil', 'turnStarted']]);
    const killed = run(old, { type: 'useTrigger', target: offers[0].target });
    expect(killed.table.discard.map((c) => c.id)).toEqual(['storil']);
  });

  it('is offered again the next turn', () => {
    const used = run(start(), use('storil'), { type: 'endAttempt' }, { type: 'nextTurn' });
    expect(attemptAbilitiesOf(run(used, spaceAttempt)).map((o) => o.id)).toEqual(['storil']);
  });

  it('keeps the change in a save, and drops a malformed one alone', () => {
    const used = run(start(), use('storil'));
    const cards = [planet, space, gamma, storil, person('c2'), ship([])];
    const deck: DeckList = Object.fromEntries(cards.map((c) => [c.id, { count: 1, row: c.card }]));
    const saved = JSON.parse(JSON.stringify(toSavedGame(used.table, deck, 'builder', undefined, undefined, used.log)));
    const restored = fromSavedGame(JSON.stringify(saved), deck);
    expect(restored?.table.attempt?.timed).toEqual(used.table.attempt?.timed);
    saved.table.attempt.timed = [{ title: 'x', sourceId: 'a', targetId: 'b', changes: { weapons: 'five' } }];
    const repaired = fromSavedGame(JSON.stringify(saved), deck);
    expect(repaired?.table.attempt).toBeDefined();
    expect(repaired?.table.attempt?.timed).toBeUndefined();
  });
});

describe("Worf's and Ikat'ika's abilities (#1835)", () => {
  const away = (slot: number, crew: CardInstance[]) =>
    run(initialGameState(slot === 0 ? table([], crew) : table([], [], crew)), { type: 'startAttempt', missionIndex: slot, personnel: crew.length, subtract: 0 });

  it('Worf is offered only at a [GQ] mission; Ikat\'ika anywhere', () => {
    expect(attemptAbilitiesOf(away(0, [worf, ikat])).map((o) => o.id)).toEqual(['ikat']);
    expect(attemptAbilitiesOf(away(2, [worf, ikat])).map((o) => o.id)).toEqual(['worf', 'ikat']);
  });

  it('makes him attributes +2 for the rest of the attempt', () => {
    const used = run(away(2, [worf]), use('worf'));
    expect(attributesOnTableOf(used.table, true).worf).toEqual({ integrity: 7, cunning: 7, strength: 7 });
    expect(logEntryText(used.log.at(-1)!)).toBe(
      'Worf Honorable Explorer: made itself attributes +2 until the end of this mission attempt; it is killed at the end of this turn'
    );
    expect(attributesOnTableOf(run(used, { type: 'endAttempt' }).table, true).worf).toBeUndefined();
  });

  // Glossary › "actions" › Effects, p. 16: "if one commands a stopped Ikat'ika, Honorable Warrior at the end of his
  // turn, Ikat'ika will be killed by his ability if it was used earlier that turn" (#1946).
  it("kills a stopped Ikat'ika at the end of the turn, before the next turn unstops him", () => {
    const stopped = run(away(0, [ikat]), use('ikat'), { type: 'endAttempt' }, { type: 'setStopped', ids: ['ikat'], stopped: true });
    const discard = run(stopped, { type: 'advanceSegment' });
    expect(discard.table.segment).toBe('discard');
    expect(discard.table.missions[0].awayTeam.find((c) => c.id === 'ikat')?.stopped).toBe(true);
    const offers = pendingTriggersOf(discard);
    expect(offers.map((o) => [o.row.title, o.source?.id])).toEqual([["Ikat'ika Honorable Warrior", 'ikat']]);
    const killed = run(discard, { type: 'useTrigger', target: offers[0].target });
    expect(killed.table.turn).toBe(1);
    expect(killed.table.discard.map((c) => c.id)).toEqual(['ikat']);
    expect(killed.table.missions[0].awayTeam).toEqual([]);
  });
});

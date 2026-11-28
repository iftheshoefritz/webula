import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { availableOrdersOf, gameReducer, GameAction, GameState, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import { attemptAbilitiesOf } from '../../../app/decks/practice/attemptAbilities';
import { attributesOnTableOf } from '../../../app/decks/practice/attributesOnTable';
import { costCandidates, orderCostCandidates } from '../../../app/decks/practice/orders';
import type { AttemptAbility } from '../../../lib/attemptAbilities';
import type { OrderCost, OrderModel } from '../../../lib/orderModels';

// Issue #1957: the cost `placeFromHandOnThis`, a card of the hand that passes a test placed on the ability's own
// card, for an order row and for an attempt-ability row, with one implementation. A card placed on an event from the
// hand is not in play (Rulebook v4, "In Play/Not In Play", p. 8: "Cards placed directly from one of these locations
// on an event, dilemma or in a brig are not in play unless specifically specified."), so it carries `notInPlay`
// (#1943). The rows, the events and the personnel are invented.

const FED: OrderCost = { kind: 'placeFromHandOnThis', test: [{ affiliations: ['federation'] }], text: 'a [Fed] card from hand' };

const ORDER: OrderModel = { title: 'Invented Muster', index: 0, text: 'Place a [Fed] card from hand on this event to draw a card.', cost: FED, steps: [] };

const ABILITY: AttemptAbility = {
  title: 'Invented Drills',
  index: 0,
  text: 'While your personnel is facing a dilemma, you may place a [Fed] card from hand on this event to make one of them Integrity +2.',
  label: 'Integrity +2',
  window: 'facingDilemma',
  source: 'core',
  cost: FED,
  steps: [{ kind: 'modify', target: 'chosenPersonnel', changes: { integrity: 2 } }],
};

jest.mock('../../../lib/orderModels', () => {
  const actual = jest.requireActual('../../../lib/orderModels');
  return { ...actual, orderModelsOf: (name: string) => (name === 'Invented Muster' ? [ORDER] : actual.orderModelsOf(name)) };
});

jest.mock('../../../lib/attemptAbilities', () => {
  const actual = jest.requireActual('../../../lib/attemptAbilities');
  return { ...actual, attemptAbilitiesOfTitle: (name: string) => (name === 'Invented Drills' ? [ABILITY] : actual.attemptAbilitiesOfTitle(name)) };
});

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, affiliation: string) =>
  card(id, { type: 'personnel', name: `crewman ${id}`, originalName: `Crewman ${id}`, affiliation, integrity: '5', cunning: '5', strength: '5' });
const event = (id: string, name: string) => card(id, { type: 'event', name: name.toLowerCase(), originalName: name });
const planet = card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p', quadrant: 'a' });
const fed = person('h-fed', 'federation');
const kli = person('h-kli', 'klingon');

function table(hand: CardInstance[], over: Partial<TableState> = {}): TableState {
  return {
    ...initialTableState,
    segment: 'orders',
    hand,
    core: [event('muster', 'Invented Muster'), event('drills', 'Invented Drills')],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: i === 0 ? planet : null, ships: [], awayTeam: i === 0 ? [person('p1', 'federation')] : [], underMission: [] })),
    ...over,
  };
}

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);
const coreCard = (s: GameState, id: string) => s.table.core.find((c) => c.id === id);

describe('an order whose cost places a [Fed] card from hand on its card (#1957)', () => {
  const start = (hand = [fed, kli]) => initialGameState(table(hand));
  const use = (ids?: string[]): GameAction => ({ type: 'useOrder', id: 'muster', order: 0, ...(ids ? { ids } : {}) });

  it('offers only the [Fed] cards of the hand', () => {
    const order = availableOrdersOf(start()).find((o) => o.instance.id === 'muster')!;
    expect(orderCostCandidates(start().table, order).map((c) => c.id)).toEqual(['h-fed']);
  });

  it('refuses a card that is not [Fed], no card, two cards, and any use with no [Fed] card in hand', () => {
    const before = start();
    expect(run(before, use(['h-kli']))).toBe(before);
    expect(run(before, use())).toBe(before);
    expect(run(before, use(['h-fed', 'h-kli']))).toBe(before);
    expect(run(before, use(['h-fed', 'h-fed']))).toBe(before);
    const none = start([kli]);
    expect(run(none, use(['h-kli']))).toBe(none);
  });

  it('places the card on the event, out of play, in one entry that one undo takes back', () => {
    const before = start();
    const used = run(before, use(['h-fed']));
    expect(used.table.hand.map((c) => c.id)).toEqual(['h-kli']);
    expect(coreCard(used, 'muster')?.placedOn?.map((c) => c.id)).toEqual(['h-fed']);
    expect(coreCard(used, 'muster')?.placedOn?.at(-1)?.notInPlay).toBe(true);
    expect(used.log).toHaveLength(before.log.length + 1);
    expect(used.log.at(-1)).toMatchObject({ kind: 'orderUsed', cost: { placedOnThis: ['Crewman h-fed'] } });
    expect(logEntryText(used.log.at(-1)!)).toBe("Used Invented Muster's order: placed Crewman h-fed on it");
    expect(run(used, { type: 'undo' }).table).toEqual(before.table);
  });
});

describe('an attempt ability whose cost places a [Fed] card from hand on its card (#1957)', () => {
  const attempt = (hand: CardInstance[]) =>
    table(hand, {
      segment: 'playAndDraw',
      dilemmaStack: [card('d1', { type: 'dilemma', name: 'invented snare', originalName: 'Invented Snare' })],
      attempt: { missionIndex: 0, personnel: 1, subtract: 0, draw: 1, spend: 1, phase: 'face', drawn: 0 },
    });
  const start = (hand = [fed, kli]) => initialGameState(attempt(hand));
  const use = (ids?: string[]): GameAction => ({ type: 'useAttemptAbility', id: 'drills', index: 0, targetId: 'p1', ...(ids ? { ids } : {}) });

  it('is offered while the dilemma is faced, and its cost offers only the [Fed] cards of the hand', () => {
    expect(attemptAbilitiesOf(start()).map((o) => [o.id, o.targetId])).toEqual([['drills', 'p1']]);
    expect(costCandidates(start().table, FED, 'drills').map((c) => c.id)).toEqual(['h-fed']);
  });

  it('refuses a card that is not [Fed], no card, two cards, and any use with no [Fed] card in hand', () => {
    const before = start();
    expect(run(before, use(['h-kli']))).toBe(before);
    expect(run(before, use())).toBe(before);
    expect(run(before, use(['h-fed', 'h-kli']))).toBe(before);
    const none = start([kli]);
    expect(run(none, use(['h-kli']))).toBe(none);
  });

  it('pays the cost and makes the change in one entry that one undo takes back', () => {
    const before = start();
    const used = run(before, use(['h-fed']));
    expect(used.table.hand.map((c) => c.id)).toEqual(['h-kli']);
    expect(coreCard(used, 'drills')?.placedOn?.map((c) => c.id)).toEqual(['h-fed']);
    expect(coreCard(used, 'drills')?.placedOn?.at(-1)?.notInPlay).toBe(true);
    expect(attributesOnTableOf(used.table, true).p1?.integrity).toBe(7);
    expect(used.log).toHaveLength(before.log.length + 1);
    expect(used.log.at(-1)).toMatchObject({ kind: 'attemptAbilityUsed', cost: { placedOnThis: ['Crewman h-fed'] }, changes: { integrity: 2 } });
    expect(logEntryText(used.log.at(-1)!)).toBe('Invented Drills: placed Crewman h-fed on it, made Crewman p1 Integrity +2 until the end of Invented Snare');
    expect(run(used, { type: 'undo' }).table).toEqual(before.table);
  });
});

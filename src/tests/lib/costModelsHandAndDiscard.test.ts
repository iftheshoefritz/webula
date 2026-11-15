import { costModelOf } from '../../lib/costModels/registry';
import { CostFacts, CostHandCard, countedCost, isCountedChoice } from '../../lib/costModels/model';
import { moveCharge } from '../../lib/playCost';
import { costFactsOf } from '../../app/decks/practice/costFacts';
import { CardInstance, initialTableState } from '../../app/decks/practice/tableReducer';

// The cost models that read the discard pile or the hand, or a "may" the player decides (#1700), with
// invented facts.

const facts = (f: Partial<CostFacts> = {}): CostFacts => ({ commanded: [], core: [], hand: [], ...f });
const card = (id: string, type: string, title = id): CostHandCard => ({ id, title, type });
const play = (name: string, type: string, cost: number) => ({ name: name.toLowerCase(), originalName: name, type, cost: String(cost) });
const charge = (name: string, type: string, cost: number, f: CostFacts, id = 'played') =>
  moveCharge('playAndDraw', 'hand', 'core', play(name, type, cost), f, id);
const choiceOf = (c: ReturnType<typeof charge>) => (c?.kind === 'play' ? c.source?.choice : undefined);

describe('the cost models of the hand and the discard pile (#1700)', () => {
  it('holds an ownCost model for each title, the *VP and *A copies too', () => {
    for (const title of [
      'Christening',
      'Treyam Militia Soldier',
      'Kulan Militia Soldier',
      'Kes Experienced Ocampa',
      'Thompson',
      'Defiant Mirror Warship',
      'Gonik',
      'Woteln',
    ])
      expect(costModelOf(title)).toMatchObject({ title, family: 'ownCost' });
    expect(costModelOf('Christening *VP')?.title).toBe('Christening');
    expect(costModelOf('Defiant Mirror Warship *A')?.title).toBe('Defiant Mirror Warship');
    expect(costModelOf('Defiant Mirror Warship *VP')?.title).toBe('Defiant Mirror Warship');
  });

  describe('Christening', () => {
    it('costs −3 with no ship on the table or in the hand, the played card not counted', () => {
      expect(charge('Christening', 'event', 3, facts({ hand: [card('played', 'event'), card('h1', 'event')] }))).toEqual({
        kind: 'play',
        cost: 0,
        source: { title: 'Christening', reason: 'no ship on the table or in hand' },
      });
    });

    it('costs the printed cost while a ship is on a ship row', () => {
      expect(charge('Christening', 'event', 3, facts({ ships: ['A Ship'] }))).toEqual({ kind: 'play', cost: 3 });
    });

    it('costs the printed cost while another card of the hand is a ship', () => {
      expect(charge('Christening', 'event', 3, facts({ hand: [card('h1', 'ship')] }))).toEqual({ kind: 'play', cost: 3 });
    });
  });

  describe.each([
    ['Treyam Militia Soldier', 'Treyam'],
    ['Kulan Militia Soldier', 'Kulan'],
  ])('%s', (title, label) => {
    it('costs the printed cost with no event in the discard pile', () => {
      expect(charge(title, 'personnel', 2, facts({ discard: [card('d1', 'personnel')] }))).toEqual({ kind: 'play', cost: 2 });
    });

    it('costs −1 for each event in the discard pile, never below 0', () => {
      expect(charge(title, 'personnel', 2, facts({ discard: [card('d1', 'event'), card('d2', 'interrupt')] }))).toEqual({
        kind: 'play',
        cost: 1,
        source: { title: label, reason: '1 event in your discard pile' },
      });
      expect(charge(title, 'personnel', 2, facts({ discard: [card('d1', 'event'), card('d2', 'event'), card('d3', 'event')] }))).toEqual({
        kind: 'play',
        cost: 0,
        source: { title: label, reason: '3 events in your discard pile' },
      });
    });
  });

  describe('Kes Experienced Ocampa', () => {
    it('offers −2 while another equipment or event is in the hand', () => {
      expect(charge('Kes Experienced Ocampa', 'personnel', 4, facts({ hand: [card('played', 'personnel'), card('h1', 'equipment')] }))).toEqual({
        kind: 'play',
        cost: 4,
        source: { title: 'Kes', reason: 'you may discard an equipment or event', choice: { label: 'Discard a card: −2', cost: 2 } },
      });
    });

    it('costs the printed cost with no other equipment or event in the hand', () => {
      expect(charge('Kes Experienced Ocampa', 'personnel', 4, facts({ hand: [card('h1', 'personnel')] }))).toEqual({ kind: 'play', cost: 4 });
    });
  });

  describe('Thompson', () => {
    it('offers "Lose 5 points: −3" at a score of 5', () => {
      expect(choiceOf(charge('Thompson', 'personnel', 3, facts({ score: 5 })))).toEqual({ label: 'Lose 5 points: −3', cost: 0 });
    });

    it('offers no choice at a score of 4', () => {
      expect(charge('Thompson', 'personnel', 3, facts({ score: 4 }))).toEqual({ kind: 'play', cost: 3 });
    });
  });

  it.each([
    ['Gonik', 3, 2, 'Opponent draws a card: −1'],
    ['Woteln', 3, 1, 'Choose a personnel in the opponent’s discard pile: −2'],
  ])('%s charges the printed cost with its choice', (title, printed, cost, label) => {
    const result = charge(title, 'personnel', printed, facts());
    expect(result).toMatchObject({ kind: 'play', cost: printed });
    expect(choiceOf(result)).toEqual({ label, cost });
  });

  describe('Defiant Mirror Warship', () => {
    it('offers a count of the other cards of the hand, −1 each', () => {
      const hand = [card('played', 'ship'), card('h1', 'event'), card('h2', 'personnel'), card('h3', 'interrupt')];
      const choice = choiceOf(charge('Defiant Mirror Warship *A', 'ship', 7, facts({ hand })));
      expect(choice).toEqual({ label: 'Cards discarded from hand', step: 1, max: 3, base: 7 });
      if (!isCountedChoice(choice)) throw new Error('no counted choice');
      expect(countedCost(choice, 2)).toBe(5);
    });

    it('costs the printed cost with no other card in the hand', () => {
      expect(charge('Defiant Mirror Warship', 'ship', 7, facts({ hand: [card('played', 'ship')] }))).toEqual({ kind: 'play', cost: 7 });
    });
  });
});

describe('costFactsOf of the discard pile, the ships and the score (#1700)', () => {
  const inst = (id: string, type: string, extra: Partial<CardInstance> = {}): CardInstance => ({ id, face: 'up', card: { name: id, type }, ...extra });

  it('reads the discard pile by title and type, the removed cards left out, the ships of every ship row and the score', () => {
    const f = costFactsOf({
      ...initialTableState,
      score: 15,
      discard: [inst('An Event', 'Event'), inst('Gone', 'Event', { removedFromGame: true })],
      missions: initialTableState.missions.map((s, i) => (i === 1 ? { ...s, ships: [inst('A Ship', 'Ship')] } : s)),
    });
    expect(f.discard).toEqual([{ id: 'An Event', title: 'An Event', type: 'event' }]);
    expect(f.ships).toEqual(['A Ship']);
    expect(f.score).toBe(15);
    expect(charge('Treyam Militia Soldier', 'personnel', 2, f)).toMatchObject({ cost: 1 });
    expect(charge('Christening', 'event', 3, f)).toEqual({ kind: 'play', cost: 3 });
  });
});

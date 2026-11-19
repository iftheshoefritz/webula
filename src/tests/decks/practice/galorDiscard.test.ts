import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  actionReveal,
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  logEntryText,
  turnCharges,
  turnCounters,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { costModelOf } from '../../../lib/costModels/registry';
import { CostDeckCard, CostFacts } from '../../../lib/costModels/model';

// Issue #1744: Alliance Galor discards the top three cards of the draw deck when played and costs −1 for
// each Human personnel among them; Type III Galor may discard the top three for −2, offered only while the
// draw deck holds three. With invented deck cards.

const card = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'down',
});
const personnel = (id: string, species: string) =>
  card(id, { type: 'personnel', name: `person ${id}`, originalName: `Person ${id}`, species });
const event = (id: string) => card(id, { type: 'event', name: `event ${id}`, originalName: `Event ${id}` });
const ship = (id: string, name: string, cost: number) => ({
  ...card(id, { type: 'ship', name: name.toLowerCase(), originalName: name, cost: String(cost), affiliation: 'cardassian' }),
  face: 'up' as const,
});

const ALLIANCE = ship('ag', 'Alliance Galor', 5);
const TYPE_III = ship('t3', 'Type III Galor', 6);

function table(deck: CardInstance[]): TableState {
  return {
    ...initialTableState,
    hand: [ALLIANCE, TYPE_III],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'bilana system', originalName: 'Bilana System', missiontype: 's' }) : null,
      ships: [],
      awayTeam: [],
      underMission: [],
    })),
    drawDeck: deck,
  };
}

const DECK = [personnel('d1', 'Human'), event('d2'), personnel('d3', 'Klingon/Human'), personnel('d4', 'Human')];
const playOf = (id: string): GameAction => ({ type: 'move', id, to: { zone: 'shipRow', missionIndex: 0 } });

function play(start: TableState, id: string): { state: GameState; chosen: GameAction } {
  const chosen = withShuffleOrders(start, playOf(id), []);
  return { state: gameReducer(initialGameState(start), chosen), chosen };
}

const deckCard = (id: string, type: string, species: string[] = []): CostDeckCard => ({ id, type, species });
const facts = (top: CostDeckCard[]): CostFacts => ({ commanded: [], core: [], hand: [], drawDeckTop: top });
const cost = (title: string, printed: number, f: CostFacts) => costModelOf(title)!.playCost!({ type: 'ship', printed }, f);

describe('the models (#1744)', () => {
  it('Alliance Galor counts the Human personnel of the top three and lists them to discard', () => {
    const top = [deckCard('a', 'personnel', ['human']), deckCard('b', 'personnel', ['vulcan']), deckCard('c', 'personnel', ['klingon', 'human'])];
    expect(cost('Alliance Galor', 5, facts(top))).toEqual({
      cost: 3,
      reason: '2 Human personnel of 3 cards discarded',
      discard: { ids: ['a', 'b', 'c'] },
    });
  });

  it('Alliance Galor counts only personnel, discards what a short deck holds, and nothing from an empty one', () => {
    expect(cost('Alliance Galor', 5, facts([deckCard('a', 'event', ['human'])]))).toMatchObject({ cost: 5, discard: { ids: ['a'] } });
    expect(cost('Alliance Galor', 5, facts([deckCard('a', 'personnel', ['human'])]))).toMatchObject({
      cost: 4,
      reason: '1 Human personnel of 1 card discarded',
    });
    const empty = cost('Alliance Galor', 5, facts([]));
    expect(empty).toEqual({ cost: 5, reason: 'no card discarded, the draw deck is empty' });
  });

  it('Type III Galor offers its choice only while the draw deck holds three cards', () => {
    const three = [deckCard('a', 'event'), deckCard('b', 'event'), deckCard('c', 'event')];
    expect(cost('Type III Galor', 6, facts(three))).toMatchObject({ cost: 6, choice: { label: 'Discard the top 3: −2', cost: 4, discardTop: 3 } });
    expect(cost('Type III Galor', 6, facts(three.slice(0, 2)))).toBeNull();
  });

  it('reads the top three of the draw deck into the facts, in every game', () => {
    expect(costFactsOf(table(DECK)).drawDeckTop).toEqual([
      { id: 'd1', type: 'personnel', species: ['human'] },
      { id: 'd2', type: 'event', species: [] },
      { id: 'd3', type: 'personnel', species: ['klingon', 'human'] },
    ]);
  });
});

describe('a play of Alliance Galor (#1744)', () => {
  it('discards the top three in one batch, one entry naming them and the count, charged 5 less the Humans', () => {
    const start = table(DECK);
    const { state, chosen } = play(start, 'ag');
    expect(chosen.type).toBe('batch');
    const actions = chosen.type === 'batch' ? chosen.actions : [];
    expect(actions[0]).toMatchObject({ type: 'move', id: 'ag', cost: 3, costDiscard: ['d1', 'd2', 'd3'] });
    expect(actions.slice(1)).toEqual(['d1', 'd2', 'd3'].map((id) => ({ type: 'move', id, to: 'discard' })));
    expect(actionReveal(chosen)).toEqual([]);

    expect(state.table.drawDeck.map((c) => c.id)).toEqual(['d4']);
    expect(state.table.discard.map((c) => c.id)).toEqual(['d1', 'd2', 'd3']);
    expect(state.log).toHaveLength(1);
    const text = logEntryText(state.log[0]);
    expect(text).toContain('2 Human personnel of 3 cards discarded');
    expect(text).toContain('Person d1');
    expect(text).toContain('Event d2');
    expect(text).toContain('Person d3');
    expect(turnCounters(state.log, state.table.turn).spent).toBe(3);

    const undone = gameReducer(state, { type: 'undo' });
    expect(undone.table).toBe(start);
    expect(undone.log).toEqual([]);
  });

  it('discards what a short deck holds and counts those', () => {
    const { state } = play(table([personnel('d1', 'Human')]), 'ag');
    expect(state.table.drawDeck).toEqual([]);
    expect(state.table.discard.map((c) => c.id)).toEqual(['d1']);
    expect(turnCounters(state.log, state.table.turn).spent).toBe(4);
  });
});

describe('Type III Galor\'s choice (#1744)', () => {
  const target = { entry: 0, move: 0, card: 0 };
  const discard: GameAction = { type: 'discardForCharge', target, source: 'Type III Galor' };

  it('charges 6 and discards nothing on the play', () => {
    const { state } = play(table(DECK), 't3');
    expect(state.table.drawDeck).toHaveLength(4);
    expect(state.table.discard).toEqual([]);
    expect(turnCharges(state.log, 1)[0]).toMatchObject({ cost: 6, source: { choice: { discardTop: 3 } } });
  });

  it('discards the top three and lowers the charge by 2 in one entry, once, and one undo takes both back', () => {
    const { state } = play(table(DECK), 't3');
    const after = gameReducer(state, discard);
    expect(after.table.drawDeck.map((c) => c.id)).toEqual(['d4']);
    expect(after.table.discard.map((c) => c.id)).toEqual(['d1', 'd2', 'd3']);
    expect(after.log).toHaveLength(2);
    expect(logEntryText(after.log[1])).toBe(
      'Discarded Person d1, Event d2 and Person d3 from the top of the draw deck: charged Type III Galor 4 counters (was 6) (Type III Galor)'
    );
    expect(turnCharges(after.log, 1)[0]).toMatchObject({ cost: 4, choiceTaken: true });
    expect(gameReducer(after, discard)).toBe(after);

    const undone = gameReducer(after, { type: 'undo' });
    expect(undone.table).toBe(state.table);
    expect(turnCharges(undone.log, 1)[0]).toMatchObject({ cost: 6 });
    expect(turnCharges(undone.log, 1)[0].choiceTaken).toBeUndefined();
  });

  it('offers nothing with fewer than three in the deck, and refuses the action once the deck runs short', () => {
    const { state: short } = play(table(DECK.slice(0, 2)), 't3');
    expect(turnCharges(short.log, 1)[0].source).toBeUndefined();

    const { state } = play(table(DECK), 't3');
    const drained = { ...state, table: { ...state.table, drawDeck: state.table.drawDeck.slice(0, 2) } };
    expect(gameReducer(drained, discard)).toBe(drained);
    expect(gameReducer(state, { ...discard, source: 'Another' })).toBe(state);
  });

  it('reads a malformed `discarded` as no discard', () => {
    const { state } = play(table(DECK), 't3');
    const after = gameReducer(state, discard);
    const entry = { ...after.log[1], discarded: [3, null] } as unknown as GameState['log'][number];
    expect(logEntryText(entry)).toBe('Charged Type III Galor 4 counters (was 6) (Type III Galor)');
  });
});

import { initialTableState, CardInstance, TableState, MISSION_SLOTS, tableReducer } from '../../../app/decks/practice/tableReducer';
import {
  GameAction,
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  pendingDiscountsOf,
  turnCharges,
  turnCounters,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { costFactsOf } from '../../../app/decks/practice/costFacts';
import { costUsesOf } from '../../../lib/costModels/registry';
import { costPlayOf, drawCharge, moveCharge } from '../../../lib/playCost';

// Issue #1763: The New Resistance in the core offers, for the play of a Dissident personnel, a reveal of the
// top card of the draw deck; a revealed Dissident personnel then plays from the draw deck at −3, once. No
// other move out of the draw deck is charged. With invented personnel.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const dissident = (id: string, cost: number, face: 'up' | 'down' = 'up') =>
  card(id, { type: 'personnel', name: `rebel ${id}`, originalName: `Rebel ${id}`, cost: String(cost), keywords: 'Dissident.', affiliation: 'bajoran' }, { face });
const plain = (id: string, cost: number) => card(id, { type: 'personnel', name: `plain ${id}`, originalName: `Plain ${id}`, cost: String(cost), affiliation: 'bajoran' }, { face: 'down' });
const RESISTANCE = card('nr', { type: 'event', name: 'the new resistance', originalName: 'The New Resistance', cost: '3' });

function table({ core = [RESISTANCE], deck = [dissident('top', 4, 'down'), plain('p2', 2)] }: { core?: CardInstance[]; deck?: CardInstance[] } = {}): TableState {
  return {
    ...initialTableState,
    hand: [dissident('h', 2), plain('hp', 2)],
    core,
    drawDeck: deck,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: [],
      awayTeam: [],
      underMission: [],
    })),
  };
}

const play = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => gameReducer(s, withShuffleOrders(s.table, a, s.log)), state);
const toAway = (id: string): GameAction => ({ type: 'move', id, to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } });
const reveal: GameAction = { type: 'useCard', target: { entry: 0, move: 0, card: 0 }, id: 'nr' };

describe('the offer (#1763)', () => {
  const uses = (id: string, t = table()) => costUsesOf(costPlayOf(t.hand.find((c) => c.id === id)?.card ?? dissident(id, 2).card, id), costFactsOf(t));

  it('offers one reveal for a Dissident personnel while The New Resistance is in the core and the deck has a card', () => {
    expect(uses('h')).toEqual([{ id: 'nr', title: 'The New Resistance', label: 'Reveal the top card (The New Resistance)', amount: 0, effect: 'revealTop' }]);
    const two = table({ core: [RESISTANCE, { ...RESISTANCE, id: 'nr2' }] });
    expect(uses('h', two)).toHaveLength(1);
  });

  it('offers nothing for a personnel that is not a Dissident, without the event, or with an empty deck', () => {
    expect(uses('hp')).toEqual([]);
    expect(uses('h', table({ core: [] }))).toEqual([]);
    expect(uses('h', table({ deck: [] }))).toEqual([]);
  });
});

describe('the reveal (#1763)', () => {
  const played = () => play(initialGameState(table()), toAway('h'));

  it('logs the top card and whether it is a Dissident, moves no card, and is one undo', () => {
    const before = played();
    expect(turnCharges(before.log, 1)[0].uses).toEqual([expect.objectContaining({ id: 'nr', effect: 'revealTop' })]);
    const after = play(before, reveal);
    expect(after.table).toBe(before.table);
    expect(after.log).toHaveLength(2);
    expect(logEntryText(after.log[1])).toBe('Revealed Rebel top (The New Resistance): a Dissident');
    expect(isLogEntry(JSON.parse(JSON.stringify(after.log[1])))).toBe(true);
    expect(turnCharges(after.log, 1)[0]).toMatchObject({ cost: 2, uses: [expect.objectContaining({ used: true })] });
    expect(play(after, reveal)).toBe(after);
    expect(play(after, { type: 'undo' }).log).toEqual(before.log);
  });

  it('says so when the top card is not a Dissident, and allows no play of it', () => {
    const state = play(initialGameState(table({ deck: [plain('p1', 2), dissident('d2', 3)] })), toAway('h'), reveal);
    expect(logEntryText(state.log[1])).toBe('Revealed Plain p1 (The New Resistance): not a Dissident');
    expect(pendingDiscountsOf(state.log, 1)).toEqual([]);
    const moved = play(state, toAway('p1'));
    expect(turnCharges(moved.log, 1)).toHaveLength(1);
  });

  it('refuses with an empty draw deck', () => {
    const state = played();
    const empty = { ...state, table: { ...state.table, drawDeck: [] } };
    expect(play(empty, reveal)).toBe(empty);
  });
});

describe('the play from the draw deck (#1763)', () => {
  const revealed = () => play(initialGameState(table()), toAway('h'), reveal);

  it('charges the revealed Dissident its cost −3, as a play, with The New Resistance as its source, once', () => {
    const before = revealed();
    expect(pendingDiscountsOf(before.log, 1)).toEqual([
      expect.objectContaining({ title: 'The New Resistance', label: 'revealed Rebel top', amount: 3, origin: { entry: 1 }, fromDrawDeck: true }),
    ]);
    const after = play(before, toAway('top'));
    expect(after.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['h', 'top']);
    expect(turnCharges(after.log, 1)[1]).toMatchObject({
      card: 'Rebel top',
      cost: 1,
      source: { title: 'The New Resistance', reason: '−3 on the revealed Rebel top', discount: { entry: 1 } },
    });
    expect(logEntryText(after.log[2])).toContain('(cost 1, The New Resistance: −3 on the revealed Rebel top)');
    expect(turnCounters(after.log, 1).spent).toBe(3);
    expect(pendingDiscountsOf(after.log, 1)).toEqual([]);
    // It is a Dissident play too: its chip offers the reveal again.
    expect(turnCharges(after.log, 1)[1].uses).toEqual([expect.objectContaining({ effect: 'revealTop' })]);
    // One undo takes back the play, and the permission waits again.
    expect(pendingDiscountsOf(play(after, { type: 'undo' }).log, 1)).toHaveLength(1);
  });

  it('never below 0', () => {
    const cheap = play(initialGameState(table({ deck: [dissident('top', 2, 'down')] })), toAway('h'), reveal, toAway('top'));
    expect(turnCharges(cheap.log, 1)[1]).toMatchObject({ cost: 0 });
  });

  it('leaves every other move out of the draw deck uncharged', () => {
    const before = revealed();
    // Another card of the deck to the table.
    expect(turnCharges(play(before, toAway('p2')).log, 1)).toHaveLength(1);
    // The revealed card to the hand is no play, and its later play from the hand gets no −3.
    const toHand = play(before, { type: 'move', id: 'top', to: 'hand' });
    expect(turnCharges(toHand.log, 1)).toHaveLength(1);
    expect(turnCharges(play(toHand, toAway('top')).log, 1)[1]).toMatchObject({ cost: 4 });
    // With no reveal, a move of a Dissident from the deck is no play.
    expect(moveCharge('playAndDraw', 'drawDeck', 'awayTeam', dissident('x', 4).card, costFactsOf(table()), 'x')).toBeNull();
    expect(drawCharge('playAndDraw', 'drawDeck', 'hand')).toEqual({ kind: 'draw', cost: 1 });
  });

  it('ends with the turn, and a dismiss closes it', () => {
    const next = play(revealed(), { type: 'nextTurn' });
    expect(pendingDiscountsOf(next.log, next.table.turn)).toEqual([]);
    const dismissed = play(revealed(), { type: 'dismissDiscount', target: { entry: 1 } });
    expect(pendingDiscountsOf(dismissed.log, 1)).toEqual([]);
    expect(turnCharges(play(dismissed, toAway('top')).log, 1)).toHaveLength(1);
  });
});

describe('the fixture deal (#1763)', () => {
  it('puts `extraDrawTop` on top of the draw deck, face down', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(`c${i}`, { type: 'equipment', name: `c${i}`, originalName: `C${i}` }));
    const dealt = tableReducer(initialTableState, {
      type: 'resetWithPiles',
      cards,
      missions: [],
      dilemmas: [],
      extraDrawTop: [dissident('top', 4)],
    });
    expect(dealt.drawDeck.map((c) => c.id)).toEqual(['top', 'c7', 'c8', 'c9']);
    expect(dealt.drawDeck[0].face).toBe('down');
  });
});

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  availableOrdersOf,
  GameState,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  pendingOrderOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { ORDER_MODELS, orderModelsOf } from '../../../lib/orderModels';
import { clausesOf } from '../../../lib/modelCoverage';
import { cardTitleOf } from '../../../lib/cardTitle';

// Issue #1866: the orders of the cards on the table. With invented cards under the titles of the registry, its keys.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const deckCard = (id: string, row: Record<string, unknown> = {}) =>
  card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1', ...row }, { face: 'down' });
const person = (id: string, name: string, affiliation: string, extra: Record<string, unknown> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: '2', affiliation, ...extra });
const ship = (id: string, name: string, affiliation: string) =>
  card(id, { type: 'ship', name: name.toLowerCase(), originalName: name, cost: '3', affiliation });
const coreEvent = (id: string, name: string) => card(id, { type: 'event', name: name.toLowerCase(), originalName: name, cost: '1' });

const DAMAR = person('damar', 'Damar Ambitious Glinn', 'cardassian');
const HIDEKI = ship('hideki', 'Hideki Class', 'cardassian');
const RELIANT = ship('reliant', 'U.S.S. Reliant', 'starfleet');

function table(extra: Partial<TableState> = {}, awayTeam: CardInstance[] = [DAMAR]): TableState {
  return {
    ...initialTableState,
    segment: 'orders',
    hand: [HIDEKI, RELIANT],
    drawDeck: Array.from({ length: 10 }, (_, i) => deckCard(`d${i + 1}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: [],
      awayTeam: i === 0 ? awayTeam : [],
      underMission: [],
    })),
    ...extra,
  };
}

const dispatch = (game: GameState, action: Parameters<typeof withShuffleOrders>[1]): GameState =>
  gameReducer(game, withShuffleOrders(game.table, action, game.log));
const lastText = (game: GameState) => logEntryText(game.log[game.log.length - 1]);
const offered = (game: GameState) => availableOrdersOf(game).map((o) => `${o.name}#${o.model.index}`);

describe('the order registry (#1866)', () => {
  const rows = readFileSync(resolve(process.cwd(), 'public/cards_with_processed_columns.txt'), 'utf8').split('\n').slice(1);
  const texts = new Map(rows.map((r) => r.split('\t')).map((c) => [cardTitleOf(c[0] ?? ''), (c[26] ?? '').replace(/^"|"$/g, '')]));

  it('names a card of the card data, and an "Order - " clause of its text, for every row', () => {
    for (const model of ORDER_MODELS) {
      const text = texts.get(model.title);
      expect([model.title, text !== undefined]).toEqual([model.title, true]);
      const orders = clausesOf({ name: model.title, type: 'Personnel', gametext: text! }).filter((c) => c.concern === 'order');
      expect([model.title, orders[model.index]?.text]).toEqual([model.title, `Order - ${model.text}`]);
    }
  });

  it('finds a card by its name, version suffix and all', () => {
    expect(orderModelsOf('Rule of Acquisition #6 *VP').map((m) => m.title)).toEqual(['Rule of Acquisition #6']);
    expect(orderModelsOf('Rule of Acquisition #62')).toEqual([]);
  });
});

describe('an order with a cost (#1866): Damar Ambitious Glinn', () => {
  it('is offered in the orders segment only, from the away team', () => {
    expect(offered(initialGameState(table()))).toEqual(['Damar Ambitious Glinn#0']);
    expect(offered(initialGameState(table({ segment: 'playAndDraw' })))).toEqual([]);
    expect(offered(initialGameState(table({}, [])))).toEqual([]);
    // In the hand it is no order.
    expect(offered(initialGameState(table({ hand: [DAMAR, HIDEKI] }, [])))).toEqual([]);
  });

  it('discards the [Car] ship, then draws 3 into the same entry, and one undo takes back both', () => {
    const start = initialGameState(table());
    const used = dispatch(start, { type: 'useOrder', id: 'damar', order: 0, ids: ['hideki'] });
    expect(used.table.discard.map((c) => c.id)).toEqual(['hideki']);
    expect(used.log).toHaveLength(1);
    expect(pendingOrderOf(used)?.stage.lead.kind).toBe('draw');
    // The turn waits for it.
    expect(dispatch(used, { type: 'advanceSegment' })).toBe(used);
    expect(offered(used)).toEqual([]);
    const drew = dispatch(used, { type: 'effectStep' });
    expect(drew.table.hand.map((c) => c.id)).toEqual(['reliant', 'd1', 'd2', 'd3']);
    expect(drew.log).toHaveLength(1);
    expect(lastText(drew)).toBe("Used Damar Ambitious Glinn's order: discarded Hideki Class, drew 3 cards");
    expect(pendingOrderOf(drew)).toBeNull();
    const undone = dispatch(drew, { type: 'undo' });
    expect(undone.table).toBe(start.table);
    expect(undone.log).toEqual([]);
  });

  it('refuses a wrong pick, a use outside the orders segment, during an attempt, and while an order is pending', () => {
    const start = initialGameState(table());
    expect(dispatch(start, { type: 'useOrder', id: 'damar', order: 0, ids: ['reliant'] })).toBe(start);
    expect(dispatch(start, { type: 'useOrder', id: 'damar', order: 0 })).toBe(start);
    expect(dispatch(start, { type: 'useOrder', id: 'damar', order: 1, ids: ['hideki'] })).toBe(start);
    const play = initialGameState(table({ segment: 'playAndDraw' }));
    expect(dispatch(play, { type: 'useOrder', id: 'damar', order: 0, ids: ['hideki'] })).toBe(play);
    const attempt = initialGameState(
      table({ attempt: { missionIndex: 0, personnel: 1, subtract: 0, phase: 'face', drawn: 0, draw: 1, spend: 1 } as TableState['attempt'] })
    );
    expect(dispatch(attempt, { type: 'useOrder', id: 'damar', order: 0, ids: ['hideki'] })).toBe(attempt);
    const second = person('damar2', 'Damar Ambitious Glinn', 'cardassian');
    const two = initialGameState(table({ hand: [HIDEKI, ship('h2', 'Galor', 'cardassian')] }, [DAMAR, second]));
    const used = dispatch(two, { type: 'useOrder', id: 'damar', order: 0, ids: ['hideki'] });
    expect(dispatch(used, { type: 'useOrder', id: 'damar2', order: 0, ids: ['h2'] })).toBe(used);
  });

  it('skips the steps left with effectSkip, and the turn goes on', () => {
    const used = dispatch(initialGameState(table()), { type: 'useOrder', id: 'damar', order: 0, ids: ['hideki'] });
    const skipped = dispatch(used, { type: 'effectSkip' });
    expect(pendingOrderOf(skipped)).toBeNull();
    expect(lastText(skipped)).toBe("Used Damar Ambitious Glinn's order: discarded Hideki Class, skipped the draw");
    expect(dispatch(skipped, { type: 'advanceSegment' }).table.segment).not.toBe('orders');
  });
});

describe('once each turn (#1866): Indebtedness', () => {
  const INDEBTEDNESS = coreEvent('debt', 'Indebtedness');
  const start = initialGameState(table({ core: [INDEBTEDNESS] }, []));

  it('offers no second use that turn, one after the next turn, and one again after an undo', () => {
    expect(offered(start)).toEqual(['Indebtedness#0']);
    const used = dispatch(start, { type: 'useOrder', id: 'debt', order: 0 });
    const drew = dispatch(used, { type: 'effectStep' });
    expect(pendingOrderOf(drew)?.stage.lead.kind).toBe('discardFromHand');
    const done = dispatch(drew, { type: 'effectStep', ids: ['hideki'] });
    expect(done.log).toHaveLength(1);
    expect(lastText(done)).toBe("Used Indebtedness's order: drew 1 card, then discarded Hideki Class");
    expect(offered(done)).toEqual([]);
    expect(offered(dispatch(done, { type: 'undo' }))).toEqual(['Indebtedness#0']);
    const next = gameReducer(done, { type: 'nextTurn' });
    expect(offered({ ...next, table: { ...next.table, segment: 'orders' } })).toEqual(['Indebtedness#0']);
  });

  it('writes the stages after another entry into an orderEffect entry of their own', () => {
    const used = dispatch(start, { type: 'useOrder', id: 'debt', order: 0 });
    const moved = dispatch(used, { type: 'move', id: 'reliant', to: 'core' });
    const drew = dispatch(moved, { type: 'effectStep' });
    expect(drew.log.map((e) => e.kind)).toEqual(['orderUsed', 'move', 'orderEffect']);
    expect(lastText(drew)).toBe("Indebtedness's order: drew 1 card");
    expect(pendingOrderOf(drew)?.stage.lead.kind).toBe('discardFromHand');
    expect(pendingOrderOf(dispatch(drew, { type: 'undo' }))?.stage.lead.kind).toBe('draw');
  });

  it('reads a malformed orderUsed as no order', () => {
    const bad = { ...start, log: [{ kind: 'orderUsed', id: 'debt', card: 'Indebtedness', order: 'x', turn: 1, segment: 'orders' } as never] };
    expect(isLogEntry(bad.log[0])).toBe(true);
    expect(pendingOrderOf(bad)).toBeNull();
  });
});

describe('a cost that sends the card away (#1866): Four of Nine Heuristics Drone', () => {
  const FOUR = person('four', 'Four of Nine Heuristics Drone', 'borg');
  const uniqueBorg = (id: string, unique: string) => deckCard(id, { type: 'personnel', name: id, originalName: id, affiliation: 'borg', unique });

  it('places her on the bottom, stays pending, and downloads only unique [Bor] personnel, in the shuffle order', () => {
    const deck = [uniqueBorg('u1', 'y'), uniqueBorg('n1', 'n'), uniqueBorg('u2', 'y'), deckCard('d1')];
    const start = initialGameState(table({ drawDeck: deck }, [FOUR]));
    const used = dispatch(start, { type: 'useOrder', id: 'four', order: 0 });
    expect(used.table.drawDeck.map((c) => c.id)).toEqual(['u1', 'n1', 'u2', 'd1', 'four']);
    expect(pendingOrderOf(used)?.stage.lead.kind).toBe('download');
    expect(dispatch(used, { type: 'effectStep', ids: ['n1'] })).toBe(used);
    const action = withShuffleOrders(used.table, { type: 'effectStep', ids: ['u1', 'u2'] }, used.log);
    const order = action.type === 'effectStep' ? action.order : undefined;
    expect(order?.slice().sort()).toEqual(['d1', 'four', 'n1']);
    const done = gameReducer(used, action);
    expect(done.table.hand.map((c) => c.id)).toEqual(['hideki', 'reliant', 'u1', 'u2']);
    expect(done.table.drawDeck.map((c) => c.id)).toEqual(order);
    expect(lastText(done)).toBe(
      "Used Four of Nine Heuristics Drone's order: placed Four of Nine Heuristics Drone on the bottom of the draw deck, downloaded u1 and u2, shuffled the draw deck"
    );
  });
});

describe('a stop of one of your personnel (#1866): Rule of Acquisition #6', () => {
  it('stops the chosen [Fer] personnel and draws a card', () => {
    const quark = person('quark', 'Quark', 'ferengi');
    const start = initialGameState(table({ core: [coreEvent('roa', 'Rule of Acquisition #6')] }, [quark, DAMAR]));
    expect(dispatch(start, { type: 'useOrder', id: 'roa', order: 0, ids: ['damar'] })).toBe(start);
    const used = dispatch(start, { type: 'useOrder', id: 'roa', order: 0, ids: ['quark'] });
    expect(used.table.missions[0].awayTeam[0].stopped).toBe(true);
    const drew = dispatch(used, { type: 'effectStep' });
    expect(lastText(drew)).toBe("Used Rule of Acquisition #6's order: stopped Quark, drew 1 card");
  });
});

describe('a card present to place (#1866): Charles Tucker III Horse Trader', () => {
  it('places the equipment of his away team on the bottom, refuses any other card, and draws two', () => {
    const tucker = person('tucker', 'Charles Tucker III Horse Trader', 'starfleet');
    const ally = person('ally', 'Ally', 'starfleet');
    const kit = card('kit', { type: 'equipment', name: 'kit', originalName: 'Kit', cost: '1' });
    const start = initialGameState(table({}, [tucker, ally, kit]));
    expect(offered(start)).toContain('Charles Tucker III Horse Trader#0');
    expect(dispatch(start, { type: 'useOrder', id: 'tucker', order: 0, ids: ['ally'] })).toBe(start);
    expect(dispatch(start, { type: 'useOrder', id: 'tucker', order: 0 })).toBe(start);
    const used = dispatch(start, { type: 'useOrder', id: 'tucker', order: 0, ids: ['kit'] });
    expect(used.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['tucker', 'ally']);
    expect(used.table.drawDeck[used.table.drawDeck.length - 1].id).toBe('kit');
    const drew = dispatch(used, { type: 'effectStep' });
    expect(drew.table.hand.map((c) => c.id)).toEqual(['hideki', 'reliant', 'd1', 'd2']);
    expect(lastText(drew)).toBe("Used Charles Tucker III Horse Trader's order: placed Kit on the bottom of the draw deck, drew 2 cards");
    expect(offered(drew)).not.toContain('Charles Tucker III Horse Trader#0');
  });
});

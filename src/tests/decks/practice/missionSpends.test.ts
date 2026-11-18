import { initialTableState, CardInstance, TableState, MISSION_SLOTS, MoveTarget } from '../../../app/decks/practice/tableReducer';
import {
  GameState,
  earthSpendOf,
  gameReducer,
  initialGameState,
  isLogEntry,
  logEntryText,
  segmentCounters,
  turnCounters,
  withShuffleOrders,
  GameAction,
  entryCharges,
} from '../../../app/decks/practice/gameLog';
import { nimbusSpendOf } from '../../../app/decks/practice/missionSpends';

// Issue #1754: Earth, Lush and Beautiful Home and Nimbus III, Staff Backwater Embassy, missions whose
// text lets the player spend counters. With invented cards beside the titles the table reads.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const mission = (id: string, name: string, missiontype = 'p') =>
  card(id, { type: 'mission', name: name.toLowerCase(), originalName: name, missiontype });
const person = (id: string, name: string, icons = '', cost = 1) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: String(cost), icons, affiliation: 'federation' });
const deckCard = (id: string) => card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1' }, { face: 'down' });
const ship = (id: string) => card(id, { type: 'ship', name: 'an invented ship', originalName: 'An Invented Ship', cost: '3' });

const EARTH = 'Earth Lush and Beautiful Home';
const NIMBUS = 'Nimbus III Staff Backwater Embassy';

function table(missions: (CardInstance | null)[], extra: Partial<TableState> = {}): TableState {
  return {
    ...initialTableState,
    hand: [
      person('tos', 'Invented Ensign', '[stf][tos][pa]'),
      person('tos2', 'Another Invented Ensign', '[tos]'),
      person('plain', 'Invented Officer', '[tng]'),
      card('tosEvent', { type: 'event', name: 'an invented event', originalName: 'An Invented Event', cost: '1', icons: '[tos]' }),
      card('tosShip', { type: 'ship', name: 'an invented tos ship', originalName: 'An Invented TOS Ship', cost: '2', icons: '[tos]' }),
    ],
    drawDeck: Array.from({ length: 6 }, (_, i) => deckCard(`d${i + 1}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: missions[i] ?? null,
      ships: i === 0 ? [{ ...ship('ship0'), crew: [] }] : [],
      awayTeam: [],
      underMission: [],
    })),
    ...extra,
  } as TableState;
}

const earthTable = (extra: Partial<TableState> = {}) =>
  table([mission('earth', EARTH, 'h'), mission('other', 'Invented Planet')], extra);

const act = (state: GameState, action: GameAction): GameState =>
  gameReducer(state, withShuffleOrders(state.table, action, state.log));
const play = (state: GameState, id: string, to: MoveTarget): GameState => act(state, { type: 'move', id, to });
const awayTeam = (missionIndex: number): MoveTarget => ({ zone: 'missionPile', missionIndex, pile: 'awayTeam' });
const spent = (state: GameState) => turnCounters(state.log, state.table.turn).spent;

describe("Earth's spend (#1754)", () => {
  it('offers nothing before a [TOS] card is played there', () => {
    expect(earthSpendOf(initialGameState(earthTable()))).toBeNull();
  });

  it('offers it after a [TOS] personnel played into its away team, or a [TOS] card placed on its mission card', () => {
    const intoAwayTeam = play(initialGameState(earthTable()), 'tos', awayTeam(0));
    expect(earthSpendOf(intoAwayTeam)).toEqual({ slot: 0, entries: [0] });
    const onEarth = play(initialGameState(earthTable()), 'tosEvent', { zone: 'on', targetId: 'earth' });
    expect(earthSpendOf(onEarth)).toMatchObject({ slot: 0 });
  });

  it('offers nothing for a [TOS] card into a crew at Earth, a [TOS] ship to its ship row, another card, or another mission', () => {
    const fresh = () => initialGameState(earthTable());
    expect(earthSpendOf(play(fresh(), 'tos', { zone: 'crew', shipId: 'ship0' }))).toBeNull();
    expect(earthSpendOf(play(fresh(), 'tosShip', { zone: 'shipRow', missionIndex: 0 }))).toBeNull();
    expect(earthSpendOf(play(fresh(), 'plain', awayTeam(0)))).toBeNull();
    expect(earthSpendOf(play(fresh(), 'tos', awayTeam(1)))).toBeNull();
    // No Earth on the table: nothing.
    expect(earthSpendOf(play(initialGameState(table([mission('x', 'Invented HQ', 'h')])), 'tos', awayTeam(0)))).toBeNull();
    // Another Earth: nothing.
    expect(earthSpendOf(play(initialGameState(table([mission('x', 'Earth Cradle of the Federation', 'h')])), 'tos', awayTeam(0)))).toBeNull();
  });

  it('works on every version of the mission', () => {
    const promo = initialGameState(table([mission('earth', 'Earth Lush and Beautiful Home (MAH)', 'h')]));
    expect(earthSpendOf(play(promo, 'tos', awayTeam(0)))).toMatchObject({ slot: 0 });
  });

  it('draws 2 and charges 1, in one entry that one undo takes back, once a turn', () => {
    const played = play(initialGameState(earthTable()), 'tos', awayTeam(0));
    const before = spent(played);
    const spentState = act(played, { type: 'missionSpend', spend: 'earth', slot: 0 });
    expect(spentState.table.hand.length).toBe(played.table.hand.length + 2);
    expect(spentState.table.drawDeck.length).toBe(played.table.drawDeck.length - 2);
    expect(spent(spentState)).toBe(before + 1);
    expect(spentState.log).toHaveLength(played.log.length + 1);
    const entry = spentState.log[spentState.log.length - 1];
    expect(logEntryText(entry)).toBe(`Spent 1 counter at ${EARTH}, and drew 2 cards`);
    expect(isLogEntry(JSON.parse(JSON.stringify(entry)))).toBe(true);
    // Once a turn: no offer, a second spend changes nothing, a second [TOS] play offers nothing.
    expect(earthSpendOf(spentState)).toBeNull();
    expect(act(spentState, { type: 'missionSpend', spend: 'earth', slot: 0 })).toBe(spentState);
    expect(earthSpendOf(play(spentState, 'tos2', awayTeam(0)))).toBeNull();
    // One undo takes it all back, and the offer stands again.
    const undone = gameReducer(spentState, { type: 'undo' });
    expect(undone.table).toBe(played.table);
    expect(earthSpendOf(undone)).toMatchObject({ slot: 0 });
  });

  it('comes back the next turn, after a new [TOS] play', () => {
    const played = act(play(initialGameState(earthTable()), 'tos', awayTeam(0)), { type: 'missionSpend', spend: 'earth', slot: 0 });
    const next = act(played, { type: 'nextTurn' });
    expect(earthSpendOf(next)).toBeNull();
    expect(earthSpendOf(play(next, 'tos2', awayTeam(0)))).toMatchObject({ slot: 0 });
  });

  it('is a charge the chip corrects, counted on draws in the segment total', () => {
    const spentState = act(play(initialGameState(earthTable()), 'tos', awayTeam(0)), { type: 'missionSpend', spend: 'earth', slot: 0 });
    const index = spentState.log.length - 1;
    const [charge] = entryCharges(spentState.log, index);
    expect(charge).toMatchObject({ target: { entry: index }, cost: 1, draw: false, card: `${EARTH}: draw 2` });
    expect(segmentCounters(spentState.log)).toEqual({ cards: 1, draws: 1 });
    const free = act(spentState, { type: 'correctCharge', target: charge.target, cost: 0 });
    expect(entryCharges(free.log, index)[0].cost).toBe(0);
  });

  it('needs play and draw and a card in the draw deck', () => {
    const played = play(initialGameState(earthTable()), 'tos', awayTeam(0));
    expect(earthSpendOf({ ...played, table: { ...played.table, segment: 'orders' } })).toBeNull();
    expect(earthSpendOf({ ...played, table: { ...played.table, drawDeck: [] } })).toBeNull();
  });
});

describe("Nimbus III's spend (#1754)", () => {
  const korrd = person('korrd', 'Korrd Obsolete Consul');
  const talbot = person('talbot', 'St. John Talbot Embittered Consul');
  const talbot2 = person('talbot2', 'St. John Talbot Embittered Consul');
  const nimbusTable = (extra: Partial<TableState> = {}, missions = [mission('hq', 'Invented HQ', 'h'), mission('nimbus', NIMBUS)]) =>
    table(missions, { drawDeck: [deckCard('d1'), korrd, deckCard('d2'), talbot, talbot2, deckCard('d3')], ...extra });

  it('offers one entry per title of the three in the draw deck', () => {
    expect(nimbusSpendOf(nimbusTable())).toEqual({
      slot: 1,
      candidates: [
        { id: 'korrd', name: 'Korrd Obsolete Consul' },
        { id: 'talbot', name: 'St. John Talbot Embittered Consul' },
      ],
    });
  });

  it('offers nothing with none of the three in the draw deck, with a Unicomplex in a slot, or outside play and draw', () => {
    expect(nimbusSpendOf(nimbusTable({ drawDeck: [deckCard('d1')] }))).toBeNull();
    expect(nimbusSpendOf(nimbusTable({}, [mission('uni', 'Unicomplex Root of the Hive Mind', 'h'), mission('nimbus', NIMBUS)]))).toBeNull();
    expect(nimbusSpendOf(nimbusTable({ segment: 'orders' }))).toBeNull();
    expect(nimbusSpendOf(table([mission('hq', 'Invented HQ', 'h')], { drawDeck: [korrd] }))).toBeNull();
  });

  it('downloads the chosen card into its away team, shuffles the draw deck and charges 3, in one entry that one undo takes back', () => {
    const start = initialGameState(nimbusTable());
    const action = withShuffleOrders(start.table, { type: 'missionSpend', spend: 'nimbus', slot: 1, id: 'talbot' }, start.log);
    expect(action).toMatchObject({ order: expect.any(Array) });
    const order = (action as { order: string[] }).order;
    const after = gameReducer(start, action);
    expect(after.table.missions[1].awayTeam.map((c) => c.id)).toEqual(['talbot']);
    expect(after.table.drawDeck.map((c) => c.id)).toEqual(order);
    expect(order).not.toContain('talbot');
    expect(spent(after)).toBe(3);
    expect(after.log).toHaveLength(1);
    expect(logEntryText(after.log[0])).toBe(`Spent 3 counters at ${NIMBUS}, and downloaded St. John Talbot Embittered Consul into its away team`);
    expect(segmentCounters(after.log)).toEqual({ cards: 3, draws: 0 });
    expect(gameReducer(after, { type: 'undo' }).table).toBe(start.table);
  });

  it('refuses a card that is not one of the three, not in the draw deck, another slot, or a Unicomplex table', () => {
    const start = initialGameState(nimbusTable());
    expect(act(start, { type: 'missionSpend', spend: 'nimbus', slot: 1, id: 'd1' })).toBe(start);
    expect(act(start, { type: 'missionSpend', spend: 'nimbus', slot: 1, id: 'nobody' })).toBe(start);
    expect(act(start, { type: 'missionSpend', spend: 'nimbus', slot: 0, id: 'korrd' })).toBe(start);
    const uni = initialGameState(nimbusTable({}, [mission('uni', 'Unicomplex Root of the Hive Mind (MAH)', 'h'), mission('nimbus', NIMBUS)]));
    expect(act(uni, { type: 'missionSpend', spend: 'nimbus', slot: 1, id: 'korrd' })).toBe(uni);
  });
});

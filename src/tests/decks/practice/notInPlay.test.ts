import { initialTableState, CardInstance, TableState, MISSION_SLOTS, tableReducer, MoveTarget } from '../../../app/decks/practice/tableReducer';
import { gameReducer, GameAction, initialGameState } from '../../../app/decks/practice/gameLog';
import { inPlayCards, ruleWarningsOf } from '../../../app/decks/practice/playRules';
import { fromSavedGame, toSavedGame } from '../../../app/decks/practice/savedGame';
import { DeckList } from '../../../types';

// Issue #1943: a card placed on a core card from outside play is not in play. Rulebook v4, "In Play/Not In Play",
// p. 8: "Cards placed directly from one of these locations on an event, dilemma or in a brig are not in play unless
// specifically specified." Renewal Scroll's title is real; the personnel are invented.

const card = (id: string, row: Record<string, unknown>): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
});
const unique = (id: string) => card(id, { type: 'personnel', name: 'zorn', originalName: 'Zorn', unique: 'y', skills: 'Honor' });
const event = (id: string, name = 'Plain Event') => card(id, { type: 'event', name: name.toLowerCase(), originalName: name });
const ship = (id: string) => card(id, { type: 'ship', name: 'skiff', originalName: 'Skiff' });

function table(over: Partial<TableState> & { awayTeam?: CardInstance[]; ships?: CardInstance[]; underMission?: CardInstance[] } = {}): TableState {
  const { awayTeam = [], ships = [], underMission = [], ...rest } = over;
  return {
    ...initialTableState,
    core: [event('ev')],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p' }) : null,
      ships: i === 0 ? ships : [],
      awayTeam: i === 0 ? awayTeam : [],
      underMission: i === 0 ? underMission : [],
    })),
    ...rest,
  };
}

const onEv: MoveTarget = { zone: 'on', targetId: 'ev' };
const placed = (t: TableState, on = 'ev') =>
  [...t.core, ...t.missions.flatMap((m) => [m.mission, ...m.ships])].find((c) => c?.id === on)?.placedOn ?? [];
const move = (t: TableState, id: string, to: MoveTarget) => tableReducer(t, { type: 'move', id, to });

describe('a card placed on a core card from outside play (#1943)', () => {
  it.each([
    ['the hand', { hand: [unique('p')] }],
    ['the draw deck', { drawDeck: [unique('p')] }],
    ['the discard pile', { discard: [unique('p')] }],
    ['the dilemma pile', { dilemmaPile: [unique('p')] }],
    ['the brig', { brig: [unique('p')] }],
    ['under a mission', { underMission: [unique('p')] }],
  ])('is not in play when it comes from %s', (_, over) => {
    const after = move(table(over), 'p', onEv);
    expect(placed(after)).toMatchObject([{ id: 'p', notInPlay: true }]);
    expect(inPlayCards(after).map((c) => c.id)).toEqual(['ev']);
  });

  it.each([
    ['an away team', { awayTeam: [unique('p')] }],
    ['a ship row', { ships: [ship('p')] }],
    ['the core', { core: [event('ev'), event('p', 'Other Event')] }],
  ])('stays in play when it comes from %s', (_, over) => {
    const after = move(table(over), 'p', onEv);
    expect(placed(after).map((c) => c.id)).toEqual(['p']);
    expect(placed(after)[0].notInPlay).toBeUndefined();
    expect(inPlayCards(after).map((c) => c.id)).toContain('p');
  });

  it('stays in play when it comes from a crew', () => {
    const t = table({ ships: [{ ...ship('s'), crew: [unique('p')] }] });
    const after = move(t, 'p', onEv);
    expect(placed(after)[0].notInPlay).toBeUndefined();
    expect(inPlayCards(after).map((c) => c.id)).toContain('p');
  });

  it('keeps the flag from on one card to on another core card, and loses it on any other move', () => {
    const t = move(table({ core: [event('ev'), event('ev2', 'Other Event')], discard: [unique('p')] }), 'p', onEv);
    const moved = move(t, 'p', { zone: 'on', targetId: 'ev2' });
    expect(placed(moved, 'ev2')).toMatchObject([{ id: 'p', notInPlay: true }]);
    const toHand = move(moved, 'p', 'hand');
    expect(toHand.hand[0].notInPlay).toBeUndefined();
    const toTeam = move(moved, 'p', { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' });
    expect(toTeam.missions[0].awayTeam[0].notInPlay).toBeUndefined();
  });

  it('is never set for a card placed on a mission card or a ship from the hand', () => {
    const t = table({ hand: [event('e1'), event('e2', 'Other Event')], ships: [ship('s')] });
    expect(placed(move(t, 'e1', { zone: 'on', targetId: 'm0' }), 'm0')[0].notInPlay).toBeUndefined();
    expect(placed(move(t, 'e2', { zone: 'on', targetId: 's' }), 's')[0].notInPlay).toBeUndefined();
  });

  it('loses the flag when the core card moves and its stack goes to the discard pile', () => {
    const t = move(table({ discard: [unique('p')] }), 'p', onEv);
    const after = move(t, 'ev', 'hand');
    expect(after.discard.map((c) => c.id)).toEqual(['p']);
    expect(after.discard[0].notInPlay).toBeUndefined();
  });
});

describe('the uniqueness warning with a copy on Renewal Scroll (#1943)', () => {
  const scroll = event('scroll', 'Renewal Scroll');
  const hand = unique('h1');
  const atTeam = { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } as const;

  it('does not warn when the copy was placed there from the discard pile by the order', () => {
    const start = initialGameState({ ...table({ core: [scroll], discard: [unique('d1')], hand: [hand] }), segment: 'orders' });
    const used = [{ type: 'useOrder', id: 'scroll', order: 0, ids: ['d1'] } as GameAction].reduce(gameReducer, start);
    const on = used.table.core[0].placedOn ?? [];
    expect(on).toMatchObject([{ id: 'd1', notInPlay: true }]);
    expect(ruleWarningsOf(used.table, hand, atTeam, true)).toEqual([]);
  });

  it('still warns when the copy came from an away team', () => {
    const t = move(table({ core: [scroll], awayTeam: [unique('a1')], hand: [hand] }), 'a1', { zone: 'on', targetId: 'scroll' });
    expect(ruleWarningsOf(t, hand, atTeam, true)).toEqual([{ rule: 'unique', title: 'Zorn' }]);
  });
});

describe('savedGame: the flag of a placed card (#1943)', () => {
  const p = unique('p');
  const ev = event('ev');
  const withPlaced = (flag: boolean) =>
    table({ core: [{ ...ev, placedOn: [{ ...p, ...(flag ? { notInPlay: true } : {}) }] }] });
  const deck: DeckList = {
    zorn: { count: 1, row: p.card },
    plain: { count: 1, row: ev.card },
    moab: { count: 1, row: withPlaced(false).missions[0].mission!.card },
  };

  it('keeps the flag through a save and a restore', () => {
    const restored = fromSavedGame(JSON.stringify(toSavedGame(withPlaced(true), deck, 'builder')), deck)!;
    expect(restored.table.core[0].placedOn).toMatchObject([{ id: 'p', notInPlay: true }]);
    expect(inPlayCards(restored.table).map((c) => c.id)).toEqual(['ev']);
  });

  it('restores a save from before #1943 with its placed cards in play', () => {
    const restored = fromSavedGame(JSON.stringify(toSavedGame(withPlaced(false), deck, 'builder')), deck)!;
    expect(restored.table.core[0].placedOn?.[0].notInPlay).toBeUndefined();
    expect(inPlayCards(restored.table).map((c) => c.id)).toEqual(['ev', 'p']);
  });
});

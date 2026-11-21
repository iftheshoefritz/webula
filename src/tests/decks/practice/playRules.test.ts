import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import {
  actionWarned,
  entryRuleWarnings,
  gameReducer,
  GameAction,
  GameState,
  initialGameState,
  logEntryText,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { inPlayCards, ruleWarningsOf, ruleWarningText } from '../../../app/decks/practice/playRules';

// Issue #1821: the table warns of a play of a unique card while another of its title is in play, and of a
// second "(limit one per mission)" or "(limit one per ship)" card on the same mission card or ship. With
// invented cards.

const card = (id: string, row: Record<string, unknown>, face: 'up' | 'down' = 'up'): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face,
});
const unique = (id: string, name: string) => card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, unique: 'y' });
const common = (id: string, name: string) => card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name });
const limited = (id: string, name: string, per: 'mission' | 'ship', type = 'event') =>
  card(id, { type, name: name.toLowerCase(), originalName: name, gametext: `plays on your ${per} (limit one per ${per}). more text.` });
const mission = (id: string, name: string, placedOn?: CardInstance[]) => ({
  ...card(id, { type: 'mission', name: name.toLowerCase(), originalName: name, missiontype: 'p' }),
  ...(placedOn ? { placedOn } : {}),
});
const ship = (id: string, name: string, extra: Partial<CardInstance> = {}): CardInstance => ({
  ...card(id, { type: 'ship', name: name.toLowerCase(), originalName: name }),
  ...extra,
});

function table(over: Partial<TableState> & { awayTeam?: CardInstance[]; ships?: CardInstance[][]; missionCards?: CardInstance[] }): TableState {
  const { awayTeam = [], ships = [], missionCards, ...rest } = over;
  return {
    ...initialTableState,
    segment: 'playAndDraw',
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: missionCards?.[i] ?? (i < 2 ? mission(`m${i}`, `Mission ${i}`) : null),
      ships: ships[i] ?? [],
      awayTeam: i === 0 ? awayTeam : [],
      underMission: [],
    })),
    ...rest,
  };
}

const play = (start: TableState, action: GameAction, checkRules = true): { state: GameState; chosen: GameAction } => {
  const chosen = withShuffleOrders(start, action, [], false, checkRules);
  return { state: gameReducer(initialGameState(start), chosen), chosen };
};
const toAwayTeam = (id: string): GameAction => ({ type: 'move', id, to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' } });
const onCard = (id: string, targetId: string): GameAction => ({ type: 'move', id, to: { zone: 'on', targetId } });

describe('inPlayCards (#1821)', () => {
  it('reads the away teams, the ships, their crews and placed cards, the core and the cards on a mission card', () => {
    const placed = card('p', { type: 'event' });
    const t = table({
      awayTeam: [common('a', 'A')],
      ships: [[], [ship('s', 'Ship', { crew: [common('c', 'C')], placedOn: [card('ps', { type: 'event' })] })]],
      missionCards: [mission('m0', 'Mission 0', [placed])],
      core: [card('core', { type: 'event' })],
      hand: [common('h', 'H')],
      discard: [common('d', 'D')],
      brig: [common('b', 'B')],
    });
    expect(inPlayCards(t).map((c) => c.id).sort()).toEqual(['a', 'c', 'core', 'p', 'ps', 's'].sort());
  });
});

describe('ruleWarningsOf (#1821)', () => {
  const data = unique('h1', 'Data');

  it('warns of a unique card whose title is in an away team', () => {
    const t = table({ awayTeam: [unique('a1', 'Data')], hand: [data] });
    expect(ruleWarningsOf(t, data, { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' }, true)).toEqual([{ rule: 'unique', title: 'Data' }]);
  });

  it('warns of another version of the title in play', () => {
    const t = table({ ships: [[ship('s', 'Ship', { crew: [unique('c1', 'Data *VP')] })]], hand: [data] });
    expect(ruleWarningsOf(t, data, { zone: 'crew', shipId: 's' }, true)).toEqual([{ rule: 'unique', title: 'Data' }]);
  });

  it('allows the title in the discard pile, the hand, the brig or under a mission', () => {
    const t = table({ discard: [unique('d1', 'Data')], hand: [data, unique('h2', 'Data')], brig: [unique('b1', 'Data')] });
    t.missions[0].underMission = [unique('u1', 'Data')];
    expect(ruleWarningsOf(t, data, { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' }, true)).toEqual([]);
  });

  it('never compares the card with itself, and checks uniqueness only on a play', () => {
    const inPlay = unique('a1', 'Data');
    const t = table({ awayTeam: [inPlay, unique('a2', 'Data')] });
    expect(ruleWarningsOf(t, inPlay, { zone: 'missionPile', missionIndex: 1, pile: 'awayTeam' }, false)).toEqual([]);
    const alone = table({ awayTeam: [inPlay] });
    expect(ruleWarningsOf(alone, inPlay, { zone: 'missionPile', missionIndex: 1, pile: 'awayTeam' }, true)).toEqual([]);
  });

  it('never warns of a non-unique card', () => {
    const worker = common('h1', 'Worker');
    const t = table({ awayTeam: [common('a1', 'Worker')], hand: [worker] });
    expect(ruleWarningsOf(t, worker, { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' }, true)).toEqual([]);
  });

  it('warns of a "(limit one per mission)" card on a mission card that holds one, and not on another', () => {
    const second = limited('r2', 'Roadblock', 'mission');
    const t = table({ missionCards: [mission('m0', 'Mission 0', [limited('r1', 'Roadblock', 'mission')]), mission('m1', 'Mission 1')], hand: [second] });
    expect(ruleWarningsOf(t, second, { zone: 'on', targetId: 'm0' }, true)).toEqual([
      { rule: 'limitPerMission', title: 'Roadblock', place: 'Mission 0' },
    ]);
    expect(ruleWarningsOf(t, second, { zone: 'on', targetId: 'm1' }, true)).toEqual([]);
  });

  it('warns of a dilemma placed by hand, played or not', () => {
    const dilemma = limited('x2', 'Tragic Turn', 'mission', 'dilemma');
    const t = table({ missionCards: [mission('m0', 'Mission 0', [limited('x1', 'Tragic Turn', 'mission', 'dilemma')])] });
    expect(ruleWarningsOf(t, dilemma, { zone: 'on', targetId: 'm0' }, false)).toHaveLength(1);
  });

  it('warns of a "(limit one per ship)" card on a ship that holds one, and not on another', () => {
    const second = limited('l2', 'Leader', 'ship');
    const t = table({
      ships: [[ship('s1', 'First', { placedOn: [limited('l1', 'Leader', 'ship')] }), ship('s2', 'Second')]],
      hand: [second],
    });
    expect(ruleWarningsOf(t, second, { zone: 'on', targetId: 's1' }, true)).toEqual([{ rule: 'limitPerShip', title: 'Leader', place: 'First' }]);
    expect(ruleWarningsOf(t, second, { zone: 'on', targetId: 's2' }, true)).toEqual([]);
    // The per-ship text says nothing of a mission card.
    expect(ruleWarningsOf(t, second, { zone: 'on', targetId: 'm0' }, true)).toEqual([]);
  });

  it('words each warning', () => {
    expect(ruleWarningText({ rule: 'unique', title: 'Data' })).toBe('Unique: Data is already in play');
    expect(ruleWarningText({ rule: 'limitPerMission', title: 'Roadblock', place: 'Moab IV' })).toBe(
      'Limit one per mission: Roadblock is already on Moab IV'
    );
  });
});

describe('the warnings in the log (#1821)', () => {
  it('records the warning of a play in its entry, and one undo removes both', () => {
    const start = table({ awayTeam: [unique('a1', 'Data')], hand: [unique('h1', 'Data')] });
    const { state, chosen } = play(start, toAwayTeam('h1'));
    expect(actionWarned(chosen)).toBe(true);
    const entry = state.log[state.log.length - 1];
    expect(entryRuleWarnings(entry)).toEqual([{ rule: 'unique', title: 'Data' }]);
    expect(logEntryText(entry)).toMatch(/^Played Data .*; unique: Data is already in play$/);
    expect(state.table.missions[0].awayTeam.map((c) => c.id)).toEqual(['a1', 'h1']);
    const undone = gameReducer(state, { type: 'undo' });
    expect(undone.log).toHaveLength(0);
    expect(undone.table.hand.map((c) => c.id)).toEqual(['h1']);
  });

  it('records nothing with the setting off', () => {
    const start = table({ awayTeam: [unique('a1', 'Data')], hand: [unique('h1', 'Data')] });
    const { state, chosen } = play(start, toAwayTeam('h1'), false);
    expect(actionWarned(chosen)).toBe(false);
    expect(entryRuleWarnings(state.log[0])).toEqual([]);
  });

  it('records no uniqueness for a move that is no play, outside play and draw', () => {
    const start = { ...table({ awayTeam: [unique('a1', 'Data')], hand: [unique('h1', 'Data')] }), segment: 'orders' as const };
    const { state } = play(start, toAwayTeam('h1'));
    expect(entryRuleWarnings(state.log[0])).toEqual([]);
  });

  it('records the limit of a placement on a mission card, and none on another', () => {
    const start = table({
      missionCards: [mission('m0', 'Mission 0', [limited('r1', 'Roadblock', 'mission')]), mission('m1', 'Mission 1')],
      hand: [limited('r2', 'Roadblock', 'mission'), limited('r3', 'Roadblock', 'mission')],
    });
    const first = play(start, onCard('r2', 'm0'));
    expect(logEntryText(first.state.log[0])).toMatch(/limit one per mission: Roadblock is already on Mission 0$/);
    const other = play(start, onCard('r3', 'm1'));
    expect(entryRuleWarnings(other.state.log[0])).toEqual([]);
  });

  it('checks the second of two copies of a batch against the first', () => {
    const start = table({ hand: [limited('r2', 'Roadblock', 'mission'), limited('r3', 'Roadblock', 'mission')] });
    const { state } = play(start, { type: 'batch', actions: [onCard('r2', 'm0'), onCard('r3', 'm0')] } as GameAction);
    expect(entryRuleWarnings(state.log[0])).toEqual([{ rule: 'limitPerMission', title: 'Roadblock', place: 'Mission 0' }]);
  });
});

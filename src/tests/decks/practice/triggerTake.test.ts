import {
  effectSubjectOf,
  GameAction,
  GameState,
  gameReducer,
  initialGameState,
  LogEntry,
  logEntryText,
  pendingTriggerOf,
  withShuffleOrders,
} from '../../../app/decks/practice/gameLog';
import { initialTableState, CardInstance, TableState, MISSION_SLOTS } from '../../../app/decks/practice/tableReducer';
import { pendingTriggersOf } from '../../../app/decks/practice/triggers';

// Issue #1904: the take and the skip of a trigger offer, the pending trigger, and the first shipped-deck rows, each
// on an invented table.

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, name: string, extra: Record<string, unknown> = {}, instance: Partial<CardInstance> = {}) =>
  card(id, { type: 'personnel', name: name.toLowerCase(), originalName: name, cost: '2', affiliation: 'federation', ...extra }, instance);
const event = (id: string, name: string) => card(id, { type: 'event', name: name.toLowerCase(), originalName: name, cost: '1' });
const ship = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  card(id, { type: 'ship', name: name.toLowerCase(), originalName: name, cost: '6', ...extra });
const mission = (id: string, name: string, quadrant: string, missiontype = 'p', extra: Record<string, unknown> = {}) =>
  card(id, { type: 'mission', name: name.toLowerCase(), originalName: name, missiontype, quadrant, ...extra });
const deckCard = (id: string, extra: Record<string, unknown> = {}) =>
  card(id, { type: 'event', name: `card ${id}`, originalName: `Card ${id}`, cost: '1', ...extra }, { face: 'down' });

const HQ = mission('hq', 'Home Base', 'a', 'h');
const FAR = mission('far', 'Far Rock', 'g', 'p', { affiliation: '[Fed][Kli]', skills: 'Diplomacy' });
const NEAR = mission('near', 'Near Rock', 'a', 'p', { affiliation: '[Kli]' });
const SPACE = mission('space', 'Open Space', 'a', 's', { skills: 'Diplomacy and Navigation', keywords: 'Nebula.' });
const SPACE_2 = mission('space2', 'Empty Space', 'a', 's', { skills: 'Navigation' });

function table(extra: Partial<TableState> = {}, slots: Partial<TableState['missions'][number]>[] = []): TableState {
  const missions = [HQ, FAR, NEAR, SPACE, SPACE_2];
  return {
    ...initialTableState,
    drawDeck: Array.from({ length: 10 }, (_, i) => deckCard(`d${i + 1}`)),
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: missions[i] ?? null,
      ships: [],
      awayTeam: [],
      underMission: [],
      ...slots[i],
    })),
    ...extra,
  };
}

const entry = (body: object, extra: Partial<LogEntry> = {}): LogEntry => ({ turn: 1, ...body, ...extra }) as LogEntry;
// The page's dispatch: the action with its shuffle orders, then the reducer.
const send = (game: GameState, action: GameAction): GameState => gameReducer(game, withShuffleOrders(game.table, action, game.log));
const complete = (game: GameState, missionIndex: number): GameState => send(game, { type: 'setMissionCompleted', missionIndex, completed: true });
const offered = (game: GameState) => pendingTriggersOf(game).map((o) => `${o.name}@${o.target.source}`);
const take = (game: GameState, k = 0, ids?: string[]) => send(game, { type: 'useTrigger', target: pendingTriggersOf(game)[k].target, ...(ids ? { ids } : {}) });
const skip = (game: GameState, k = 0) => send(game, { type: 'skipTrigger', target: pendingTriggersOf(game)[k].target });
const undo = (game: GameState) => gameReducer(game, { type: 'undo' });
const lastText = (game: GameState) => logEntryText(game.log[game.log.length - 1]);

const DISTANT = event('dx', 'Distant Exploration');

describe('the take of a trigger offer (#1904)', () => {
  const done = complete(initialGameState(table({}, [{ mission: { ...HQ, placedOn: [DISTANT] } }])), 1);

  it('runs a score at once, in one entry, and one undo restores the table and the offer', () => {
    const taken = take(done);
    expect(taken.table.score).toBe(5);
    expect(taken.log).toHaveLength(2);
    expect(lastText(taken)).toBe('Distant Exploration: scored 5 points');
    expect(offered(taken)).toEqual([]);
    expect(pendingTriggerOf(taken)).toBeNull();
    const back = undo(taken);
    expect(back.table).toBe(done.table);
    expect(back.log).toEqual(done.log);
    expect(offered(back)).toEqual(['Distant Exploration@dx']);
  });

  it('refuses an address the table does not offer', () => {
    const wrong = { entry: 0, source: 'nobody', row: 0, event: 0 };
    expect(gameReducer(done, { type: 'useTrigger', target: wrong })).toBe(done);
    expect(gameReducer(done, { type: 'skipTrigger', target: wrong })).toBe(done);
  });

  it('skips in one entry, kept in the log, and an undo brings the offer back', () => {
    const skipped = skip(done);
    expect(skipped.table).toBe(done.table);
    expect(lastText(skipped)).toBe('Skipped Distant Exploration');
    expect(offered(skipped)).toEqual([]);
    expect(offered(undo(skipped))).toEqual(['Distant Exploration@dx']);
  });

  it('lets the player take several offers in any order', () => {
    const accomplished = event('ma', 'Mission Accomplished');
    const brave = ship('brave', 'U.S.S. Brave');
    const captain = person('cap', 'Captain', { keywords: 'Commander: U.S.S. Brave.' });
    const both = complete(
      initialGameState(table({ core: [accomplished] }, [{ mission: { ...HQ, placedOn: [DISTANT] } }, {}, {}, { ships: [{ ...brave, crew: [captain] }] }])),
      3
    );
    // Open Space is in the Alpha Quadrant, as Home Base: only Mission Accomplished.
    expect(offered(both)).toEqual(['Mission Accomplished@ma']);
    const far = complete(
      initialGameState(table({ core: [accomplished] }, [{ mission: { ...HQ, placedOn: [DISTANT] } }, { ships: [{ ...brave, crew: [captain] }] }])),
      1
    );
    expect(offered(far)).toEqual(['Distant Exploration@dx', 'Mission Accomplished@ma']);
    const second = take(far, 1);
    expect(offered(second)).toEqual(['Distant Exploration@dx']);
    const first = skip(second);
    expect(offered(first)).toEqual([]);
    expect(first.table.score).toBe(5);
  });

  it('pays a destroy-self cost with the score in one entry (Hurried Departure)', () => {
    const hurried = event('hd', 'Hurried Departure');
    const game = complete(initialGameState(table({ core: [hurried] })), 3);
    expect(offered(game)).toEqual(['Hurried Departure@hd']);
    const taken = take(game);
    expect(taken.table.core).toEqual([]);
    expect(taken.table.discard.map((c) => c.id)).toEqual(['hd']);
    expect(taken.table.score).toBe(10);
    expect(lastText(taken)).toBe('Hurried Departure: destroyed it, then scored 10 points');
    expect(undo(taken).table).toBe(game.table);
    // Not a Nebula mission.
    expect(offered(complete(initialGameState(table({ core: [hurried] })), 4))).toEqual([]);
  });

  it('drives a stage that needs input as the pending trigger, and the turn waits for it (Li Nalas)', () => {
    const li = person('li', 'Li Nalas Legend of Bajor');
    const hand = [deckCard('h1'), deckCard('h2')].map((c) => ({ ...c, face: 'up' as const }));
    const killed = {
      ...initialGameState(table({ discard: [li], hand })),
      log: [entry({ kind: 'dilemmaResolved', dilemma: 'Pit', ops: [{ op: 'kill', cards: ['Li Nalas Legend of Bajor'] }] })],
    };
    const taken = take(killed);
    expect(effectSubjectOf(taken)?.kind).toBe('trigger');
    expect(pendingTriggerOf(taken)?.instance?.id).toBe('li');
    // A must: no Skip while the hand holds a card, and the turn waits.
    expect(gameReducer(taken, { type: 'effectSkip' })).toBe(taken);
    expect(gameReducer(taken, { type: 'advanceSegment' })).toBe(taken);
    const discarded = send(taken, { type: 'effectStep', ids: ['h1'] });
    expect(discarded.table.hand.map((c) => c.id)).toEqual(['h2']);
    expect(discarded.log).toHaveLength(2);
    expect(lastText(discarded)).toBe('Li Nalas Legend of Bajor: discarded Card h1');
    expect(pendingTriggerOf(discarded)).toBeNull();
    expect(undo(discarded).table).toBe(killed.table);
  });
});

describe('the first shipped-deck trigger rows (#1904)', () => {
  it('U.S.S. Enterprise-E Federation Envoy scores 5 at a [Fed] planet mission it is at', () => {
    const envoy = ship('ee', 'U.S.S. Enterprise-E Federation Envoy');
    expect(offered(complete(initialGameState(table({}, [{}, { ships: [envoy] }])), 1))).toEqual(['U.S.S. Enterprise-E Federation Envoy@ee']);
    expect(take(complete(initialGameState(table({}, [{}, { ships: [envoy] }])), 1)).table.score).toBe(5);
    // Not at that mission, or not a [Fed] mission.
    expect(offered(complete(initialGameState(table({}, [{}, {}, { ships: [envoy] }])), 1))).toEqual([]);
    expect(offered(complete(initialGameState(table({}, [{}, {}, { ships: [envoy] }])), 2))).toEqual([]);
  });

  it('U.S.S. Enterprise-D Explorer scores 10 at a space mission requiring Diplomacy it is at', () => {
    const explorer = ship('ed', 'U.S.S. Enterprise-D Explorer');
    const game = complete(initialGameState(table({}, [{}, {}, {}, { ships: [explorer] }])), 3);
    expect(offered(game)).toEqual(['U.S.S. Enterprise-D Explorer@ed']);
    expect(take(game).table.score).toBe(10);
    expect(offered(complete(initialGameState(table({}, [{}, {}, {}, {}, { ships: [explorer] }])), 4))).toEqual([]);
    expect(offered(complete(initialGameState(table({}, [{}, { ships: [explorer] }])), 1))).toEqual([]);
  });

  it('Debate Over Dinner scores 5 when its own mission completes', () => {
    const debate = event('dod', 'Debate Over Dinner');
    const game = initialGameState(table({}, [{}, { mission: { ...FAR, placedOn: [debate] } }]));
    expect(offered(complete(game, 1))).toEqual(['Debate Over Dinner@dod']);
    expect(lastText(take(complete(game, 1)))).toBe('Debate Over Dinner: scored 5 points');
    expect(offered(complete(game, 2))).toEqual([]);
  });

  const playAt = (game: GameState, id: string, missionIndex = 1) =>
    send(game, { type: 'move', id, to: { zone: 'missionPile', missionIndex, pile: 'awayTeam' } });

  it('Enrique Muniz draws a card for a [DS9] personnel of a species the player does not command, once a turn', () => {
    const enrique = person('em', 'Enrique Muniz Dependable Troubleshooter', { species: 'Human', icons: '[Stf][DS9]' });
    const bajoran = person('kira', 'Kira', { species: 'Bajoran', icons: '[DS9]' });
    const bajoran2 = person('kira2', 'Kira Two', { species: 'Bajoran', icons: '[DS9]' });
    const human = person('obrien', "O'Brien", { species: 'Human', icons: '[DS9]' });
    const game = initialGameState(table({ hand: [bajoran, bajoran2, human] }, [{ awayTeam: [enrique] }]));
    const played = playAt(game, 'kira');
    expect(offered(played)).toEqual(['Enrique Muniz Dependable Troubleshooter@em']);
    const drew = take(played);
    expect(drew.table.hand.map((c) => c.id)).toContain('d1');
    expect(lastText(drew)).toBe('Enrique Muniz Dependable Troubleshooter: drew 1 card');
    // A second Bajoran: the player commands one now. A Human: Enrique himself is one.
    expect(offered(playAt(game, 'obrien'))).toEqual([]);
    // Once each turn: after the take, another play of a new species offers nothing.
    const other = person('quark', 'Quark', { species: 'Ferengi', icons: '[DS9]' });
    const twice = playAt({ ...drew, table: { ...drew.table, hand: [...drew.table.hand, other] } }, 'quark');
    expect(offered(twice)).toEqual([]);
    expect(offered(playAt(game, 'kira2'))).toEqual(['Enrique Muniz Dependable Troubleshooter@em']);
  });

  it('VIP Welcome draws a card for a personnel who costs 3 or more', () => {
    const vip = event('vip', 'VIP Welcome');
    const big = person('big', 'Big', { cost: '3' });
    const small = person('small', 'Small', { cost: '2' });
    const game = initialGameState(table({ core: [vip], hand: [big, small] }));
    expect(offered(playAt(game, 'big'))).toEqual(['VIP Welcome@vip']);
    expect(take(playAt(game, 'big')).table.hand.map((c) => c.id)).toEqual(['small', 'd1']);
    expect(offered(playAt(game, 'small'))).toEqual([]);
  });

  it('Quintessence downloads a [Bor] card at the start of the turn and discards the top of the deck by its cost', () => {
    const quintessence = event('q', 'Quintessence');
    const drone = card('drone', { type: 'personnel', name: 'drone', originalName: 'Drone', cost: '3', icons: '[Bor]' }, { face: 'down' });
    const deck = [deckCard('d1'), drone, ...Array.from({ length: 6 }, (_, i) => deckCard(`e${i}`))];
    const game = initialGameState(table({ core: [quintessence], drawDeck: deck }));
    const turn = send(game, { type: 'nextTurn' });
    expect(offered(turn)).toEqual(['Quintessence@q']);
    const taken = take(turn);
    expect(effectSubjectOf(taken)?.kind).toBe('trigger');
    const downloaded = send(taken, { type: 'effectStep', ids: ['drone'] });
    expect(downloaded.table.hand.map((c) => c.id)).toEqual(['drone']);
    expect(downloaded.table.discard).toHaveLength(3);
    expect(downloaded.table.drawDeck).toHaveLength(4);
    expect(lastText(downloaded)).toBe('Quintessence: downloaded Drone, shuffled the draw deck, discarded 3 cards from the top of the draw deck');
    expect(pendingTriggerOf(downloaded)).toBeNull();
    expect(undo(downloaded).table).toBe(turn.table);
  });

  it('Six of Ten discards a card of cost 4 or more from hand to download one', () => {
    const six = person('six', 'Six of Ten Invalidation Drone', { cost: '4' });
    const pricey = { ...deckCard('p', { cost: '4' }), face: 'up' as const };
    const cheap = { ...deckCard('c', { cost: '1' }), face: 'up' as const };
    const target = deckCard('t', { cost: '5' });
    const game = initialGameState(table({ hand: [pricey, cheap], drawDeck: [deckCard('d1'), target] }, [{ awayTeam: [six] }]));
    const turn = send(game, { type: 'nextTurn' });
    expect(offered(turn)).toEqual(['Six of Ten Invalidation Drone@six']);
    const taken = take(turn);
    // The cheap card does not pass the test.
    expect(gameReducer(taken, { type: 'effectStep', ids: ['c'] })).toBe(taken);
    const discarded = send(taken, { type: 'effectStep', ids: ['p'] });
    expect(discarded.table.discard.map((c) => c.id)).toEqual(['p']);
    const downloaded = send(discarded, { type: 'effectStep', ids: ['t'] });
    expect(downloaded.table.hand.map((c) => c.id)).toEqual(['c', 't']);
    expect(pendingTriggerOf(downloaded)).toBeNull();
    // With no card of cost 4 or more, the discard is refused and the player skips.
    const poor = take(send(initialGameState(table({ hand: [cheap] }, [{ awayTeam: [six] }])), { type: 'nextTurn' }));
    expect(gameReducer(poor, { type: 'effectStep', ids: [] })).toBe(poor);
    const skipped = gameReducer(poor, { type: 'effectSkip' });
    expect(pendingTriggerOf(skipped)).toBeNull();
    expect(skipped.table).toBe(poor.table);
  });

  it('Sonak downloads a [TOS] personnel when a dilemma kills him', () => {
    const sonak = person('sonak', 'Sonak Recommended Science Officer');
    const tos = card('tos', { type: 'personnel', name: 'spock', originalName: 'Spock', cost: '4', icons: '[TOS]' }, { face: 'down' });
    const killed = {
      ...initialGameState(table({ discard: [sonak], drawDeck: [deckCard('d1'), tos] })),
      log: [entry({ kind: 'dilemmaResolved', dilemma: 'Pit', ops: [{ op: 'kill', cards: ['Sonak Recommended Science Officer'] }] })],
    };
    expect(offered(killed)).toEqual(['Sonak Recommended Science Officer@sonak']);
    const downloaded = send(take(killed), { type: 'effectStep', ids: ['tos'] });
    expect(downloaded.table.hand.map((c) => c.id)).toEqual(['tos']);
    expect(lastText(downloaded)).toBe('Sonak Recommended Science Officer: downloaded Spock, shuffled the draw deck');
  });
});

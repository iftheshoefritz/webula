// Issue #1163: a mission attempt, its Attempt button, its two numbers, its log entries and its save.
import {
  tableReducer,
  initialTableState,
  CardInstance,
  MissionSlot,
  MISSION_SLOTS,
  TableState,
  FIXTURE_CREW,
  FIXTURE_DILEMMA_STACK,
  FIXTURE_UNDER_MISSION,
} from '../../../app/decks/practice/tableReducer';
import { drawSpend } from '../../../app/decks/practice/drawSpend';
import {
  canAttempt,
  attemptDefaults,
  fixtureAttempt,
  fixtureAttemptPlacedOn,
  fixtureAttemptStack,
  FIXTURE_ATTEMPT_PLACED,
} from '../../../app/decks/practice/attempt';
import { gameReducer, initialGameState, logEntryText, GameAction, GameState } from '../../../app/decks/practice/gameLog';
import { toSavedGame, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { DeckList } from '../../../types';

const inst = (id: string, name: string, type: string, extra: Partial<CardInstance> & Record<string, any> = {}): CardInstance => {
  const { stopped, crew, missiontype, ...rest } = extra;
  return {
    id,
    card: { name, originalName: name, type, ...(missiontype ? { missiontype } : {}), ...rest },
    face: 'up',
    ...(stopped ? { stopped } : {}),
    ...(crew ? { crew } : {}),
  };
};

const mission = (id: string, name: string, missiontype: string) => inst(id, name, 'mission', { missiontype });
const personnel = (id: string, stopped = false) => inst(id, `Person ${id}`, 'personnel', { stopped });
const equipment = (id: string) => inst(id, `Kit ${id}`, 'equipment');
const dilemma = (id: string) => inst(id, `Dilemma ${id}`, 'dilemma');

const slot = (overrides: Partial<MissionSlot> = {}): MissionSlot => ({
  mission: null,
  ships: [],
  awayTeam: [],
  underMission: [],
  ...overrides,
});

// Slot 0: a planet mission with an away team; slot 1: a space mission with a crewed ship and 2
// dilemmas under it; slot 2: a headquarters with a crewed ship and an away team; slot 3: a planet
// mission with a crewed ship; slot 4: empty.
const crewedShip = (id: string, name: string) =>
  inst(id, name, 'ship', { crew: [personnel(`${id}-p1`), personnel(`${id}-p2`, true), equipment(`${id}-e`), personnel(`${id}-p3`)] });

const table = (overrides: Partial<TableState> = {}): TableState => ({
  ...initialTableState,
  missions: [
    slot({
      mission: mission('m0', 'Moab IV', 'p'),
      awayTeam: [personnel('a1'), personnel('a2', true), equipment('a3'), personnel('a4')],
    }),
    slot({ mission: mission('m1', 'Bilana System', 's'), ships: [crewedShip('s1', 'U.S.S. Relativity')], underMission: [dilemma('d1'), dilemma('d2')] }),
    slot({ mission: mission('m2', 'Earth', 'h'), ships: [crewedShip('s2', 'Hood')], awayTeam: [personnel('h1')] }),
    slot({ mission: mission('m3', 'Angel I', 'p'), ships: [crewedShip('s3', 'Defiant')] }),
    slot(),
  ],
  core: [crewedShip('s4', 'Stargazer')],
  ...overrides,
});

const start = { type: 'startAttempt', missionIndex: 1, shipId: 's1', personnel: 7, subtract: 2 } as const;

describe('tableReducer: startAttempt and endAttempt (#1163)', () => {
  it('starts an attempt with the numbers given, and ends it', () => {
    const started = tableReducer(table(), start);
    expect(started.attempt).toEqual({ missionIndex: 1, shipId: 's1', personnel: 7, subtract: 2, phase: 'choose', drawn: 0 });
    const ended = tableReducer(started, { type: 'endAttempt' });
    expect(ended.attempt).toBeUndefined();
    expect('attempt' in ended).toBe(false);
  });

  it('leaves the state alone for a second start, a start at an empty slot, and an end with none', () => {
    const started = tableReducer(table(), start);
    expect(tableReducer(started, { ...start, missionIndex: 0, shipId: undefined })).toBe(started);
    const empty = table();
    expect(tableReducer(empty, { ...start, missionIndex: 4 })).toBe(empty);
    expect(tableReducer(empty, { type: 'endAttempt' })).toBe(empty);
  });

  // Issue #1170: the stack lives only in the attempt layout, so Attempt done empties it.
  it('moves the dilemmas of the stack under the attempted mission, face up and in order, as it ends', () => {
    const stack = [{ ...dilemma('k1'), face: 'up' as const }, { ...dilemma('k2'), face: 'down' as const }, { ...dilemma('k3'), face: 'down' as const }];
    const started = tableReducer(table({ dilemmaStack: stack }), start);
    const ended = tableReducer(started, { type: 'endAttempt' });
    expect(ended.attempt).toBeUndefined();
    expect(ended.dilemmaStack).toEqual([]);
    expect(ended.missions[1].underMission.map((c) => [c.id, c.face])).toEqual([
      ['d1', 'up'],
      ['d2', 'up'],
      ['k1', 'up'],
      ['k2', 'up'],
      ['k3', 'up'],
    ]);
    // Nothing else changes.
    expect({ ...ended, missions: started.missions, dilemmaStack: started.dilemmaStack }).toEqual(
      (({ attempt: _attempt, ...rest }) => rest)(started)
    );
  });

  it('moves nothing when the stack is empty, and nothing with no attempt', () => {
    const started = tableReducer(table(), start);
    const ended = tableReducer(started, { type: 'endAttempt' });
    expect(ended.missions).toBe(started.missions);
    expect(ended.dilemmaStack).toBe(started.dilemmaStack);
    const idle = table({ dilemmaStack: [dilemma('k1')] });
    expect(tableReducer(idle, { type: 'endAttempt' })).toBe(idle);
  });

  it('keeps the numbers frozen when a personnel joins or is stopped', () => {
    const started = tableReducer(table(), { type: 'startAttempt', missionIndex: 0, personnel: 2, subtract: 0 });
    const later = tableReducer(tableReducer(started, { type: 'setStopped', ids: ['a1'], stopped: true }), {
      type: 'move',
      id: 'h1',
      to: { zone: 'missionPile', missionIndex: 0, pile: 'awayTeam' },
    });
    expect(later.attempt).toEqual(started.attempt);
  });

  it('clears the attempt on reset and resetWithPiles', () => {
    const started = tableReducer(table(), start);
    const deal = { cards: [], missions: [mission('m9', 'X', 'p')], dilemmas: [] };
    expect(tableReducer(started, { type: 'reset', ...deal }).attempt).toBeUndefined();
    expect(tableReducer(started, { type: 'resetWithPiles', ...deal }).attempt).toBeUndefined();
  });
});

describe('the numbers of an attempt (#1163)', () => {
  it('floors draw/spend at 0', () => {
    expect(drawSpend(20, 0)).toBe(20);
    expect(drawSpend(7, 2)).toBe(5);
    expect(drawSpend(20, 25)).toBe(0);
  });

  it('counts the unstopped personnel of the away team, and the dilemmas under the mission', () => {
    expect(attemptDefaults(table(), { kind: 'awayTeam', missionIndex: 0 })).toEqual({ missionIndex: 0, personnel: 2, subtract: 0 });
  });

  it('counts the unstopped personnel of the crew, and names the ship', () => {
    expect(attemptDefaults(table(), { kind: 'crew', shipId: 's1' })).toEqual({ missionIndex: 1, shipId: 's1', personnel: 2, subtract: 2 });
  });
});

describe('canAttempt (#1163)', () => {
  it('shows the button in the away team of a planet mission and the crew of a ship at a space mission', () => {
    expect(canAttempt(table(), { kind: 'awayTeam', missionIndex: 0 })).toBe(true);
    expect(canAttempt(table(), { kind: 'crew', shipId: 's1' })).toBe(true);
  });

  it('shows no button at the wrong mission type, or for a ship off the ship rows', () => {
    expect(canAttempt(table(), { kind: 'awayTeam', missionIndex: 2 })).toBe(false); // headquarters
    expect(canAttempt(table(), { kind: 'crew', shipId: 's2' })).toBe(false); // ship at a headquarters
    expect(canAttempt(table(), { kind: 'crew', shipId: 's3' })).toBe(false); // ship at a planet
    expect(canAttempt(table(), { kind: 'crew', shipId: 's4' })).toBe(false); // ship in the core
    const awayAtSpace = table();
    awayAtSpace.missions[1] = { ...awayAtSpace.missions[1], awayTeam: [personnel('x')] };
    expect(canAttempt(awayAtSpace, { kind: 'awayTeam', missionIndex: 1 })).toBe(false);
    expect(canAttempt(table(), { kind: 'awayTeam', missionIndex: 4 })).toBe(false); // no mission card
  });

  it('shows no button when every personnel is stopped, or only equipment is there', () => {
    const t = table();
    t.missions[0] = { ...t.missions[0], awayTeam: [personnel('a1', true), equipment('a3')] };
    expect(canAttempt(t, { kind: 'awayTeam', missionIndex: 0 })).toBe(false);
    t.missions[0] = { ...t.missions[0], awayTeam: [equipment('a3')] };
    expect(canAttempt(t, { kind: 'awayTeam', missionIndex: 0 })).toBe(false);
  });

  it('shows no button at a completed mission', () => {
    let t = tableReducer(table(), { type: 'setMissionCompleted', missionIndex: 0, completed: true });
    expect(canAttempt(t, { kind: 'awayTeam', missionIndex: 0 })).toBe(false);
    t = tableReducer(table(), { type: 'setMissionCompleted', missionIndex: 1, completed: true });
    expect(canAttempt(t, { kind: 'crew', shipId: 's1' })).toBe(false);
  });

  it('shows no button anywhere while an attempt is in progress', () => {
    const t = tableReducer(table(), start);
    expect(canAttempt(t, { kind: 'awayTeam', missionIndex: 0 })).toBe(false);
    expect(canAttempt(t, { kind: 'crew', shipId: 's1' })).toBe(false);
  });
});

describe('the game log of an attempt (#1163)', () => {
  const run = (...actions: GameAction[]): GameState => actions.reduce(gameReducer, initialGameState(table()));
  const texts = (state: GameState) => state.log.map(logEntryText);

  it('logs the start with the ship at a space mission, and the end', () => {
    expect(texts(run(start, { type: 'endAttempt' }))).toEqual([
      'Attempted Bilana System with U.S.S. Relativity: 7 personnel − 2 = draw/spend 5',
      'Ended the attempt at Bilana System',
    ]);
  });

  it('logs the dilemmas of the stack that the end moved under the mission, in one entry (#1170)', () => {
    const state = [start, { type: 'endAttempt' }].reduce(
      (s, a) => gameReducer(s, a as GameAction),
      initialGameState(table({ dilemmaStack: [dilemma('k1'), { ...dilemma('k2'), face: 'down' }] }))
    );
    expect(texts(state)).toEqual([
      'Attempted Bilana System with U.S.S. Relativity: 7 personnel − 2 = draw/spend 5',
      'Ended the attempt at Bilana System, and moved Dilemma k1 and Dilemma k2 under Bilana System',
    ]);
  });

  it('logs the start with no ship at a planet mission, and N floored at 0', () => {
    expect(texts(run({ type: 'startAttempt', missionIndex: 0, personnel: 20, subtract: 25 }))).toEqual([
      'Attempted Moab IV: 20 personnel − 25 = draw/spend 0',
    ]);
  });

  it('logs nothing for a start that changed nothing, or an end with no attempt', () => {
    expect(run(start, { ...start, missionIndex: 0 }).log).toHaveLength(1);
    expect(run({ type: 'endAttempt' }).log).toHaveLength(0);
  });

  it('keeps a flip from the dilemma stack and a move under the mission readable during an attempt', () => {
    const state = [start, { type: 'flip', id: 'k1' }, { type: 'move', id: 'k1', to: { zone: 'missionPile', missionIndex: 1, pile: 'underMission' } }].reduce(
      (s, a) => gameReducer(s, a as GameAction),
      initialGameState(table({ dilemmaStack: [{ ...dilemma('k1'), face: 'down' }] }))
    );
    expect(texts(state)).toEqual([
      'Attempted Bilana System with U.S.S. Relativity: 7 personnel − 2 = draw/spend 5',
      'Turned Dilemma k1 face up',
      'Moved Dilemma k1 from the dilemma stack to the pile under Bilana System',
    ]);
  });
});

describe('the save of an attempt (#1163)', () => {
  const deck: DeckList = {
    mission: { count: 1, row: { collectorsinfo: '1M1', name: 'Mission', type: 'mission', missiontype: 'p' } },
  } as any;
  const saved = (t: TableState) => JSON.stringify(toSavedGame(t, deck, 'builder'));
  const dealt = (): TableState => ({
    ...initialTableState,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) =>
      slot({ mission: i === 0 ? { id: 'card-1', card: { ...deck.mission.row }, face: 'up' } : null })
    ),
  });

  it('restores an attempt in progress with the same numbers', () => {
    const t = tableReducer(dealt(), { type: 'startAttempt', missionIndex: 0, personnel: 20, subtract: 25 });
    expect(fromSavedGame(saved(t), deck)!.table.attempt).toEqual({ missionIndex: 0, personnel: 20, subtract: 25, phase: 'choose', drawn: 0 });
  });

  it('loads a save with no attempt with none', () => {
    expect(fromSavedGame(saved(dealt()), deck)!.table.attempt).toBeUndefined();
  });

  // Issue #1170: a save from before the stack lived only in the attempt layout.
  it('sends the stack of a save with no attempt to the bottom of the dilemma pile, face down', () => {
    const row = { collectorsinfo: '1D1', name: 'Dilemma', type: 'dilemma' };
    const withDilemmas: DeckList = { ...deck, dilemma: { count: 3, row } } as any;
    const card = (id: string, face: 'up' | 'down') => ({ id, card: { ...row }, face });
    const t: TableState = { ...dealt(), dilemmaPile: [card('card-2', 'down')], dilemmaStack: [card('card-3', 'up'), card('card-4', 'down')] };
    const restored = fromSavedGame(JSON.stringify(toSavedGame(t, withDilemmas, 'builder')), withDilemmas)!.table;
    expect(restored.dilemmaStack).toEqual([]);
    expect(restored.dilemmaPile.map((c) => [c.id, c.face])).toEqual([
      ['card-2', 'down'],
      ['card-3', 'down'],
      ['card-4', 'down'],
    ]);
    // A save with an attempt keeps its stack.
    const attempting = { ...t, attempt: { missionIndex: 0, personnel: 1, subtract: 0, phase: 'face' as const, drawn: 0 } };
    const kept = fromSavedGame(JSON.stringify(toSavedGame(attempting, withDilemmas, 'builder')), withDilemmas)!.table;
    expect(kept.dilemmaStack.map((c) => c.id)).toEqual(['card-3', 'card-4']);
  });

  it.each([
    ['a slot with no mission card', { missionIndex: 1, personnel: 1, subtract: 0 }],
    ['a slot out of range', { missionIndex: 9, personnel: 1, subtract: 0 }],
    ['a negative number', { missionIndex: 0, personnel: -1, subtract: 0 }],
    ['not an object', 'yes'],
  ])('drops an attempt at %s', (_, attempt) => {
    const t = { ...dealt(), attempt } as unknown as TableState;
    const restored = fromSavedGame(saved(t), deck)!.table;
    expect(restored.attempt).toBeUndefined();
  });
});

describe('the attempt of ?fixture=attempt (#1169)', () => {
  // A piles deal shaped like the fixture deck's: Bilana System, a space mission, in slot 2.
  const range = (n: number, make: (i: number) => CardInstance) => Array.from({ length: n }, (_, i) => make(i));
  const deal = (withShip = true) => ({
    type: 'resetWithPiles' as const,
    cards: [
      ...range(40, (i) => personnel(`p${i}`)),
      ...(withShip ? [inst('ship', 'U.S.S. Relativity', 'ship')] : []),
      ...range(6, (i) => inst(`e${i}`, `Event ${i}`, 'event')),
      ...range(10, (i) => equipment(`k${i}`)),
    ],
    missions: [
      mission('m0', 'Moab IV', 'p'),
      mission('m1', 'Angel I', 'p'),
      mission('m2', 'Bilana System', 's'),
      mission('m3', 'Earth', 'h'),
      mission('m4', 'Tarod IX', 'p'),
    ],
    dilemmas: range(10, (i) => dilemma(`d${i}`)),
  });

  it('starts an attempt at Bilana System with the crewed ship, and changes nothing else', () => {
    const piles = tableReducer(initialTableState, deal());
    const start = fixtureAttempt(piles);
    expect(start).toEqual({ type: 'startAttempt', missionIndex: 2, shipId: 'ship', personnel: FIXTURE_CREW, subtract: FIXTURE_UNDER_MISSION });
    const attempted = tableReducer(piles, start!);
    const { attempt, ...rest } = attempted;
    expect(rest).toEqual(piles);
    expect(attempt).toEqual({
      missionIndex: 2,
      shipId: piles.missions[2].ships[0].id,
      personnel: 12,
      subtract: 3,
      phase: 'choose',
      drawn: 0,
    });
    expect(drawSpend(attempt!.personnel, attempt!.subtract)).toBe(FIXTURE_CREW - 3);
  });

  it('fills the dilemma stack from the top of the pile, face down (#1170)', () => {
    const piles = tableReducer(initialTableState, deal());
    expect(piles.dilemmaStack).toEqual([]);
    const moves = fixtureAttemptStack(piles);
    expect(moves).toHaveLength(FIXTURE_DILEMMA_STACK);
    // The page switches the fixture's attempt to the facing phase before the stack moves (#1189).
    const facing = tableReducer(tableReducer(piles, fixtureAttempt(piles)!), { type: 'setAttemptPhase', phase: 'face' });
    const stacked = moves.reduce(tableReducer, facing);
    expect(stacked.dilemmaStack.map((c) => [c.card.name, c.face])).toEqual(
      ['d3', 'd4', 'd5', 'd6'].map((id) => [`Dilemma ${id}`, 'down'])
    );
    expect(stacked.dilemmaPile).toHaveLength(10 - FIXTURE_UNDER_MISSION - FIXTURE_DILEMMA_STACK);
  });

  it('places 2 dilemmas from below the stack and 2 events of the draw deck on Bilana System (#1180)', () => {
    const piles = tableReducer(initialTableState, deal());
    // This deal's events all go to the core, the ship and the hand, so add two to the draw deck.
    const table = { ...piles, drawDeck: [...piles.drawDeck, inst('x1', 'Extra 1', 'event'), inst('x2', 'Extra 2', 'event')] };
    const moves = fixtureAttemptPlacedOn(table);
    expect(moves).toHaveLength(2 * FIXTURE_ATTEMPT_PLACED);
    const placed = moves.reduce(tableReducer, tableReducer(table, fixtureAttempt(table)!));
    expect(placed.missions[2].mission!.placedOn!.map((c) => [c.card.name, c.face])).toEqual([
      ['Dilemma d7', 'up'],
      ['Dilemma d8', 'up'],
      ['Extra 1', 'up'],
      ['Extra 2', 'up'],
    ]);
    // The stack still takes the top 4 dilemmas of the pile.
    expect(fixtureAttemptStack(placed).map((m) => m.id)).toEqual(fixtureAttemptStack(table).map((m) => m.id));
  });

  it('takes the events from the core when the draw deck has none (#1180)', () => {
    const piles = tableReducer(initialTableState, deal());
    expect(piles.drawDeck.some((c) => c.card.type === 'event')).toBe(false);
    const placed = fixtureAttemptPlacedOn(piles).reduce(tableReducer, piles);
    expect(placed.missions[2].mission!.placedOn!.map((c) => c.card.name)).toEqual([
      'Dilemma d7',
      'Dilemma d8',
      'Event 0',
      'Event 1',
    ]);
    expect(placed.core.map((c) => c.card.name)).toEqual(['Event 2', 'Event 3']);
  });

  it('starts none when the deal has no ship', () => {
    expect(fixtureAttempt(tableReducer(initialTableState, deal(false)))).toBeNull();
  });
});

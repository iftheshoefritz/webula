// Issue #1189: the phase of a mission attempt, its count of dilemmas drawn, the face of the
// dilemma stack per phase, the change of phase, its log entry, its save and the view key.
import {
  tableReducer,
  initialTableState,
  CardInstance,
  MissionSlot,
  MISSION_SLOTS,
  TableState,
} from '../../../app/decks/practice/tableReducer';
import { drawSpend } from '../../../app/decks/practice/drawSpend';
import { attemptViewKey } from '../../../app/decks/practice/attempt';
import { gameReducer, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import { toSavedGame, fromSavedGame } from '../../../app/decks/practice/savedGame';
import { DeckList } from '../../../types';

const dilemma = (id: string, face: 'up' | 'down' = 'down'): CardInstance => ({
  id,
  card: { name: `Dilemma ${id}`, originalName: `Dilemma ${id}`, type: 'dilemma' },
  face,
});

const slot = (overrides: Partial<MissionSlot> = {}): MissionSlot => ({
  mission: null,
  ships: [],
  awayTeam: [],
  underMission: [],
  ...overrides,
});

const table = (overrides: Partial<TableState> = {}): TableState => ({
  ...initialTableState,
  missions: Array.from({ length: MISSION_SLOTS }, (_, i) =>
    slot(
      i === 0
        ? { mission: { id: 'm0', card: { name: 'Moab IV', originalName: 'Moab IV', type: 'mission', missiontype: 'p' }, face: 'up' } }
        : {}
    )
  ),
  dilemmaPile: ['p1', 'p2', 'p3', 'p4'].map((id) => dilemma(id)),
  ...overrides,
});

const start = { type: 'startAttempt', missionIndex: 0, personnel: 2, subtract: 0 } as const;
const attempting = (overrides: Partial<TableState> = {}) => tableReducer(table(overrides), start);
const counted = { type: 'drawCard', from: 'dilemmaPile', to: 'dilemmaHand', counted: true } as const;
const faces = (cards: CardInstance[]) => cards.map((c) => [c.id, c.face]);

describe('the phase of an attempt (#1189)', () => {
  it('starts a new attempt in the choice phase with no dilemma drawn', () => {
    expect(attempting().attempt).toMatchObject({ phase: 'choose', drawn: 0 });
  });

  it('counts each choice-phase draw into the dilemma hand, past draw/spend N', () => {
    const one = tableReducer(attempting(), counted);
    expect(faces(one.dilemmaHand)).toEqual([['p1', 'up']]);
    expect(one.dilemmaPile.map((c) => c.id)).toEqual(['p2', 'p3', 'p4']);
    expect(one.attempt!.drawn).toBe(1);
    const two = tableReducer(one, counted);
    expect(two.attempt!.drawn).toBe(2);
    const three = tableReducer(two, counted);
    expect(three.attempt!.drawn).toBeGreaterThan(drawSpend(start.personnel, start.subtract));
    expect(three.dilemmaHand.map((c) => c.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('leaves drawn alone for a plain draw, and for a choice-phase draw from an empty pile', () => {
    const plain = tableReducer(attempting(), { type: 'drawCard', from: 'dilemmaPile', to: 'dilemmaHand' });
    expect(plain.dilemmaHand).toHaveLength(1);
    expect(plain.attempt!.drawn).toBe(0);
    const empty = attempting({ dilemmaPile: [] });
    expect(tableReducer(empty, counted)).toBe(empty);
  });

  it('draws with no count outside an attempt', () => {
    const drawn = tableReducer(table(), counted);
    expect(drawn.dilemmaHand).toHaveLength(1);
    expect(drawn.attempt).toBeUndefined();
  });

  it('logs the choice-phase draw as the dilemma draw', () => {
    const state = gameReducer(initialGameState(attempting()), counted);
    expect(state.log).toEqual([{ kind: 'draw', from: 'dilemmaPile', to: 'dilemmaHand', turn: 1 }]);
  });

  it('lands a dilemma in the stack face up in the choice phase, face down in the facing phase and with no attempt', () => {
    const hand = { dilemmaHand: [dilemma('h1', 'up')] };
    const move = { type: 'move', id: 'h1', to: 'dilemmaStack' } as const;
    expect(faces(tableReducer(attempting(hand), move).dilemmaStack)).toEqual([['h1', 'up']]);
    const facing = tableReducer(attempting(hand), { type: 'setAttemptPhase', phase: 'face' });
    expect(faces(tableReducer({ ...facing, dilemmaHand: [dilemma('h1', 'up')] }, move).dilemmaStack)).toEqual([['h1', 'down']]);
    expect(faces(tableReducer(table(hand), move).dilemmaStack)).toEqual([['h1', 'down']]);

    const draw = { type: 'drawCard', from: 'dilemmaPile', to: 'dilemmaStack' } as const;
    expect(faces(tableReducer(attempting(), draw).dilemmaStack)).toEqual([['p1', 'up']]);
    expect(faces(tableReducer(facing, draw).dilemmaStack)).toEqual([['p1', 'down']]);
    expect(faces(tableReducer(table(), draw).dilemmaStack)).toEqual([['p1', 'down']]);
  });

  it('keeps the face of a move within the stack', () => {
    const state = attempting({ dilemmaStack: [dilemma('s1', 'down'), dilemma('s2', 'up')] });
    expect(faces(tableReducer(state, { type: 'move', id: 's1', to: 'dilemmaStack' }).dilemmaStack)).toEqual([
      ['s2', 'up'],
      ['s1', 'down'],
    ]);
  });

  it('choose -> face turns the stack face down and sends the dilemma hand to the bottom of the pile, face up, in one log entry', () => {
    const before = attempting({
      dilemmaStack: [dilemma('s1', 'up'), dilemma('s2', 'up')],
      dilemmaHand: [dilemma('h1', 'up'), dilemma('h2', 'up')],
    });
    const state = gameReducer(initialGameState(before), { type: 'setAttemptPhase', phase: 'face' });
    expect(state.table.attempt!.phase).toBe('face');
    expect(faces(state.table.dilemmaStack)).toEqual([
      ['s1', 'down'],
      ['s2', 'down'],
    ]);
    expect(state.table.dilemmaHand).toEqual([]);
    expect(faces(state.table.dilemmaPile)).toEqual([
      ['p1', 'down'],
      ['p2', 'down'],
      ['p3', 'down'],
      ['p4', 'down'],
      ['h1', 'up'],
      ['h2', 'up'],
    ]);
    expect(state.log).toHaveLength(1);
    expect(logEntryText(state.log[0])).toBe(
      'Started facing dilemmas at Moab IV, and moved Dilemma h1 and Dilemma h2 to the bottom of the dilemma pile'
    );
  });

  it('face -> choose turns the stack face up and moves no card', () => {
    const facing = tableReducer(
      attempting({ dilemmaStack: [dilemma('s1', 'up'), dilemma('s2', 'up')] }),
      { type: 'setAttemptPhase', phase: 'face' }
    );
    const withHand = { ...facing, dilemmaHand: [dilemma('h1', 'up')] };
    const state = gameReducer(initialGameState(withHand), { type: 'setAttemptPhase', phase: 'choose' });
    expect(state.table.attempt!.phase).toBe('choose');
    expect(faces(state.table.dilemmaStack)).toEqual([
      ['s1', 'up'],
      ['s2', 'up'],
    ]);
    expect(state.table.dilemmaHand).toBe(withHand.dilemmaHand);
    expect(state.table.dilemmaPile).toBe(withHand.dilemmaPile);
    expect(state.log.map(logEntryText)).toEqual(['Went back to the dilemma choice at Moab IV']);
  });

  it('does nothing for a switch to the current phase, or with no attempt', () => {
    const game = initialGameState(attempting());
    expect(gameReducer(game, { type: 'setAttemptPhase', phase: 'choose' })).toBe(game);
    const none = initialGameState(table());
    expect(gameReducer(none, { type: 'setAttemptPhase', phase: 'face' })).toBe(none);
  });
});

describe('the save of the phase of an attempt (#1189)', () => {
  const deck: DeckList = {
    mission: { count: 1, row: { collectorsinfo: '1M1', name: 'Mission', type: 'mission', missiontype: 'p' } },
  } as any;
  const dealt = (): TableState => ({
    ...initialTableState,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) =>
      slot({ mission: i === 0 ? { id: 'card-1', card: { ...deck.mission.row }, face: 'up' } : null })
    ),
  });
  const restoreWith = (attempt: Record<string, unknown>) => {
    const save = toSavedGame(dealt(), deck, 'builder');
    return fromSavedGame(JSON.stringify({ ...save, table: { ...save.table, attempt } }), deck)!.table.attempt;
  };

  it('restores an attempt saved with no phase and no count in the facing phase with 0 drawn', () => {
    expect(restoreWith({ missionIndex: 0, personnel: 3, subtract: 1 })).toEqual({
      missionIndex: 0,
      personnel: 3,
      subtract: 1,
      phase: 'face',
      drawn: 0,
    });
  });

  it('drops an attempt with an invalid phase or count', () => {
    expect(restoreWith({ missionIndex: 0, personnel: 3, subtract: 1, phase: 'x' })).toBeUndefined();
    expect(restoreWith({ missionIndex: 0, personnel: 3, subtract: 1, drawn: -1 })).toBeUndefined();
  });

  it('round-trips a choice-phase attempt and its count', () => {
    const t = tableReducer(tableReducer(dealt(), { ...start }), { type: 'setAttemptPhase', phase: 'face' });
    const chosen = { ...t, attempt: { ...t.attempt!, phase: 'choose' as const, drawn: 4 } };
    expect(fromSavedGame(JSON.stringify(toSavedGame(chosen, deck, 'builder')), deck)!.table.attempt).toEqual(chosen.attempt);
  });
});

describe('the view key of an attempt (#1189)', () => {
  it('stays the same through a change of phase and a draw, so View full table stays', () => {
    const started = attempting();
    const key = attemptViewKey(started.attempt);
    const drawn = tableReducer(started, counted);
    const facing = tableReducer(drawn, { type: 'setAttemptPhase', phase: 'face' });
    expect(attemptViewKey(drawn.attempt)).toBe(key);
    expect(attemptViewKey(facing.attempt)).toBe(key);
  });

  it('differs for another mission or ship, and is null with no attempt', () => {
    const base = { missionIndex: 0, personnel: 1, subtract: 0, phase: 'choose', drawn: 0 } as const;
    expect(attemptViewKey(base)).not.toBe(attemptViewKey({ ...base, missionIndex: 1 }));
    expect(attemptViewKey(base)).not.toBe(attemptViewKey({ ...base, shipId: 's1' }));
    expect(attemptViewKey(undefined)).toBeNull();
  });
});

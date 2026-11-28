import { initialTableState, CardInstance, TableState, MISSION_SLOTS, MoveTarget } from '../../../app/decks/practice/tableReducer';
import { gameReducer, GameAction, GameState, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import { attemptAbilitiesOf } from '../../../app/decks/practice/attemptAbilities';
import { attributesOnTableOf } from '../../../app/decks/practice/attributesOnTable';
import { fromSavedGame, toSavedGame } from '../../../app/decks/practice/savedGame';
import type { DeckList } from '../../../types';
import { attemptAbilityRowValid, type AttemptAbility } from '../../../lib/attemptAbilities';

// Issue #1956: the `facingDilemma` window of the attempt abilities, a row whose card is in the core and whose change
// goes to a chosen personnel, and a timed change that ends with its dilemma. Glossary › "attempting missions", p. 17,
// step 3h: "(When/While) . . . (face/facing) . . . dilemma" triggers "may be used at any time until the end of step
// 4.a"; Glossary › "dilemmas", p. 17: a dilemma placed elsewhere "is no longer being faced". The row, the event and
// the personnel are invented.

const INVENTED: AttemptAbility = {
  title: 'Invented Drills',
  index: 0,
  text: 'While your personnel is facing a dilemma, you may make one of them Integrity +2 until the end of that dilemma.',
  label: 'Integrity +2',
  window: 'facingDilemma',
  source: 'core',
  steps: [{ kind: 'modify', target: 'chosenPersonnel', changes: { integrity: 2 } }],
};

jest.mock('../../../lib/attemptAbilities', () => {
  const actual = jest.requireActual('../../../lib/attemptAbilities');
  return { ...actual, attemptAbilitiesOfTitle: (name: string) => (name === 'Invented Drills' ? [INVENTED] : actual.attemptAbilitiesOfTitle(name)) };
});

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, extra: Partial<CardInstance> = {}) =>
  card(id, { type: 'personnel', name: `crewman ${id}`, originalName: `Crewman ${id}`, integrity: '5', cunning: '5', strength: '5' }, extra);
const dilemma = (id: string, name: string) => card(id, { type: 'dilemma', name: name.toLowerCase(), originalName: name, cost: '1' }, { face: 'down' });
const drills = card('drills', { type: 'event', name: 'invented drills', originalName: 'Invented Drills' });
const planet = card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p', quadrant: 'a' });

function table({ bot = false, phase = 'face' as 'face' | 'choose', team = [person('p1'), person('p2'), person('p3', { stopped: true })] } = {}): TableState {
  const stack = [dilemma('d1', 'Invented Snare'), dilemma('d2', 'Invented Trap')];
  return {
    ...initialTableState,
    segment: 'playAndDraw',
    ...(bot ? { opponent: 'bot' as const } : {}),
    core: [drills],
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({ mission: i === 0 ? planet : null, ships: [], awayTeam: i === 0 ? team : [], underMission: [] })),
    dilemmaStack: stack,
    attempt: {
      missionIndex: 0,
      personnel: team.length,
      subtract: 0,
      draw: 2,
      spend: 2,
      phase,
      drawn: 0,
      ...(bot ? { botDraw: 2, botSpend: 2, botStack: stack.map((c) => c.id), botRevealed: [] } : {}),
    },
  };
}

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);
const flip = (id = 'd1'): GameAction => ({ type: 'flip', id });
const abilityOn = (targetId: string): GameAction => ({ type: 'useAttemptAbility', id: 'drills', index: 0, targetId });
const under: MoveTarget = { zone: 'missionPile', missionIndex: 0, pile: 'underMission' };
const integrityOf = (s: GameState, id: string) => attributesOnTableOf(s.table, true)[id]?.integrity ?? 5;
const targets = (s: GameState) => attemptAbilitiesOf(s).map((o) => [o.id, o.targetId]);

describe('the attempt ability rows (#1956)', () => {
  it('a core row changes a chosen personnel, a self row never does', () => {
    expect(attemptAbilityRowValid(INVENTED)).toBe(true);
    expect(attemptAbilityRowValid({ ...INVENTED, steps: [{ kind: 'modify', target: 'self', changes: { integrity: 2 } }] })).toBe(false);
    expect(attemptAbilityRowValid({ ...INVENTED, source: undefined })).toBe(false);
    const { ATTEMPT_ABILITIES } = jest.requireActual('../../../lib/attemptAbilities') as typeof import('../../../lib/attemptAbilities');
    expect(ATTEMPT_ABILITIES.every(attemptAbilityRowValid)).toBe(true);
  });
});

describe.each([false, true])('the facing-dilemma window (#1956), bot game %s', (bot) => {
  const facing = () => run(initialGameState(table({ bot })), flip());

  it('is offered only while a revealed dilemma is on top of the stack in face, once per unstopped personnel', () => {
    expect(attemptAbilitiesOf(initialGameState(table({ bot, phase: 'choose' })))).toEqual([]);
    expect(attemptAbilitiesOf(initialGameState(table({ bot })))).toEqual([]);
    expect(targets(facing())).toEqual([
      ['drills', 'p1'],
      ['drills', 'p2'],
    ]);
    expect(attemptAbilitiesOf(run(facing(), { type: 'move', id: 'd1', to: under }))).toEqual([]);
    expect(attemptAbilitiesOf(run(facing(), { type: 'move', id: 'd1', to: 'dilemmaPile' }))).toEqual([]);
    expect(attemptAbilitiesOf(run(facing(), { type: 'move', id: 'd1', to: 'core' }))).toEqual([]);
    expect(attemptAbilitiesOf(run(facing(), { type: 'endAttempt' }))).toEqual([]);
  });

  it('adds a change keyed to the dilemma, usable again, kept while the dilemma is faced', () => {
    const once = run(facing(), abilityOn('p1'));
    expect(once.table.attempt?.timed).toEqual([{ title: 'Invented Drills', sourceId: 'drills', targetId: 'p1', changes: { integrity: 2 }, untilDilemma: 'd1' }]);
    expect(integrityOf(once, 'p1')).toBe(7);
    expect(logEntryText(once.log.at(-1)!)).toBe('Invented Drills: made Crewman p1 Integrity +2 until the end of Invented Snare');
    expect(once.log.at(-1)).toMatchObject({ dilemmaId: 'd1', dilemma: 'Invented Snare' });
    const twice = run(once, abilityOn('p1'));
    expect(twice.table.attempt?.timed).toHaveLength(2);
    expect(integrityOf(twice, 'p1')).toBe(9);
    const unrelated = run(twice, { type: 'setStopped', ids: ['p2'], stopped: true });
    expect(integrityOf(unrelated, 'p1')).toBe(9);
  });

  it('is refused for a target the table does not offer', () => {
    const s = facing();
    expect(run(s, abilityOn('p3'))).toBe(s);
    expect(run(s, { type: 'useAttemptAbility', id: 'drills', index: 0 })).toBe(s);
  });

  it('ends when the dilemma moves off the stack; one undo brings it back; it does not return with the next dilemma', () => {
    const used = run(facing(), abilityOn('p1'));
    const moved = run(used, { type: 'move', id: 'd1', to: under });
    expect(moved.table.attempt?.timed).toBeUndefined();
    expect(integrityOf(moved, 'p1')).toBe(5);
    const undone = run(moved, { type: 'undo' });
    expect(undone.table.attempt?.timed).toHaveLength(1);
    expect(integrityOf(undone, 'p1')).toBe(7);
    const next = run(moved, flip('d2'));
    expect(next.table.attempt?.timed).toBeUndefined();
    // Put back on top by hand, it is a new facing: its old change stays ended.
    const back = run(moved, { type: 'move', id: 'd1', to: 'dilemmaStack', position: 'top' });
    expect(back.table.attempt?.timed).toBeUndefined();
  });

  it('ends when the attempt ends, and keeps an attempting change', () => {
    const used = run(facing(), abilityOn('p1'));
    expect(run(used, { type: 'endAttempt' }).table.attempt).toBeUndefined();
    const mixed = { ...used, table: { ...used.table, attempt: { ...used.table.attempt!, timed: [...used.table.attempt!.timed!, { title: 'X', sourceId: 'p2', targetId: 'p2', changes: { cunning: 1 } }] } } };
    expect(run(mixed, { type: 'move', id: 'd1', to: under }).table.attempt?.timed).toEqual([{ title: 'X', sourceId: 'p2', targetId: 'p2', changes: { cunning: 1 } }]);
  });

  it('keeps a keyed change in a save while the dilemma is faced, and drops it once not', () => {
    const used = run(facing(), abilityOn('p1'));
    const cards = [planet, drills, person('p1'), person('p2'), person('p3'), dilemma('d1', 'Invented Snare'), dilemma('d2', 'Invented Trap')];
    const deck: DeckList = Object.fromEntries(cards.map((c) => [c.id, { count: 1, row: c.card }]));
    const save = (s: GameState) => JSON.parse(JSON.stringify(toSavedGame(s.table, deck, 'builder', undefined, undefined, s.log)));
    expect(fromSavedGame(JSON.stringify(save(used)), deck)?.table.attempt?.timed).toEqual(used.table.attempt?.timed);
    const stale = save(used);
    stale.table.attempt.timed[0].untilDilemma = 'd2';
    expect(fromSavedGame(JSON.stringify(stale), deck)?.table.attempt?.timed).toBeUndefined();
    const malformed = save(used);
    malformed.table.attempt.timed[0].untilDilemma = 7;
    const repaired = fromSavedGame(JSON.stringify(malformed), deck);
    expect(repaired?.table.attempt).toBeDefined();
    expect(repaired?.table.attempt?.timed).toBeUndefined();
  });
});

describe('a bot resolve (#1956)', () => {
  const facing = () => run(initialGameState(table({ bot: true })), flip(), abilityOn('p2'));

  it('drops the change with a move, and with no move once the snapshot is resolved', () => {
    expect(facing().table.attempt?.revealSnapshot?.dilemmaId).toBe('d1');
    const moved = run(facing(), { type: 'resolveDilemma', dilemmaId: 'd1', dilemma: 'Invented Snare', changes: [], move: { to: under } });
    expect(moved.table.attempt?.timed).toBeUndefined();
    expect(integrityOf(run(moved, { type: 'undo' }), 'p2')).toBe(7);
    const stays = run(facing(), { type: 'resolveDilemma', dilemmaId: 'd1', dilemma: 'Invented Snare', changes: [] });
    expect(stays.table.dilemmaStack[0].id).toBe('d1');
    expect(stays.table.attempt?.timed).toBeUndefined();
    expect(attemptAbilitiesOf(stays)).toEqual([]);
  });
});

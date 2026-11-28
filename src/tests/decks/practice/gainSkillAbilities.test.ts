import { initialTableState, CardInstance, TableState, MISSION_SLOTS, MoveTarget } from '../../../app/decks/practice/tableReducer';
import { gameReducer, GameAction, GameState, initialGameState, logEntryText } from '../../../app/decks/practice/gameLog';
import { attemptAbilitiesOf, gainSkillOptionsOf } from '../../../app/decks/practice/attemptAbilities';
import { pileTableInputOf, revealedPileAttemptOf } from '../../../app/decks/practice/attempt';
import { fromSavedGame, toSavedGame } from '../../../app/decks/practice/savedGame';
import { SKILL_INDEX } from '../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../lib/dilemmaBot/simulator';
import type { PileAttempt, PlayModifiers } from '../../../lib/dilemmaBot/pile/model';
import { PlayState } from '../../../lib/dilemmaBot/pile/play';
import { pileAttemptOf } from '../../../lib/dilemmaBot/pile/tableAttempt';
import type { DeckList } from '../../../types';
import { attemptAbilityRowValid, type AttemptAbility } from '../../../lib/attemptAbilities';

// Issue #1958: a `gainSkill` step, "make that personnel gain a skill he or she already has". Rulebook v4, "1. Play and
// Draw Cards" › "Important Game Terms" › Skills, p. 9: "New skills that are gained are not "listed skills". If a
// personnel gains a skill he or she already has, it increases his or her level of that skill." The rows, the events,
// the personnel and the dilemmas are invented.

const ATTEMPTING: AttemptAbility = {
  title: 'Invented Practice',
  index: 0,
  text: 'While your personnel are attempting a mission, you may make one of them gain a skill he or she already has until the end of this mission attempt.',
  label: 'Gain a skill',
  source: 'core',
  steps: [{ kind: 'gainSkill', target: 'chosenPersonnel' }],
};
const FACING: AttemptAbility = {
  ...ATTEMPTING,
  title: 'Invented Drills',
  text: 'While your personnel is facing a dilemma, you may make that personnel gain a skill he or she already has until the end of that dilemma.',
  window: 'facingDilemma',
};

jest.mock('../../../lib/attemptAbilities', () => {
  const actual = jest.requireActual('../../../lib/attemptAbilities');
  const rows = (name: string): AttemptAbility[] | undefined => (name === 'Invented Practice' ? [ATTEMPTING] : name === 'Invented Drills' ? [FACING] : undefined);
  return { ...actual, attemptAbilitiesOfTitle: (name: string) => rows(name) ?? actual.attemptAbilitiesOfTitle(name) };
});

const card = (id: string, row: Record<string, unknown>, extra: Partial<CardInstance> = {}): CardInstance => ({
  id,
  card: { collectorsinfo: id, imagefile: id, unique: 'n', gametext: '', cost: '1', ...row } as CardInstance['card'],
  face: 'up',
  ...extra,
});
const person = (id: string, skills: string, extra: Partial<CardInstance> = {}) =>
  card(id, { type: 'personnel', name: `crewman ${id}`, originalName: `Crewman ${id}`, skills, integrity: '5', cunning: '5', strength: '5' }, extra);
const dilemma = (id: string, name: string) => card(id, { type: 'dilemma', name: name.toLowerCase(), originalName: name, cost: '1' }, { face: 'down' });
const practice = card('practice', { type: 'event', name: 'invented practice', originalName: 'Invented Practice' });
const drills = card('drills', { type: 'event', name: 'invented drills', originalName: 'Invented Drills' });
const planet = card('m0', { type: 'mission', name: 'moab iv', originalName: 'Moab IV', missiontype: 'p', quadrant: 'a', skills: '2 Security' });

function table({ phase = 'face' as 'face' | 'choose', team = [person('p1', 'Security, Diplomacy'), person('p2', 'Medical'), person('p3', 'Science', { stopped: true })] } = {}): TableState {
  const stack = [dilemma('d1', 'Invented Snare'), dilemma('d2', 'Invented Trap')];
  return {
    ...initialTableState,
    segment: 'playAndDraw',
    opponent: 'bot',
    core: [practice, drills],
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
      cardText: true,
      botDraw: 2,
      botSpend: 2,
      botStack: stack.map((c) => c.id),
      botRevealed: [],
    },
  };
}

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);
const gain = (targetId: string, skill?: string, id = 'practice'): GameAction => ({ type: 'useAttemptAbility', id, index: 0, targetId, ...(skill ? { skill } : {}) });
const under: MoveTarget = { zone: 'missionPile', missionIndex: 0, pile: 'underMission' };
const SECURITY = SKILL_INDEX.security;

const pileOf = (s: GameState): PileAttempt => pileAttemptOf(pileTableInputOf(s.table, 0, undefined, true)).attempt;
const playOf = (attempt: PileAttempt, modifiers?: PlayModifiers) =>
  new PlayState({ attempt: modifiers ? { ...attempt, modifiers } : attempt, rand: seededRandom(1) });

describe('the gainSkill rows (#1958)', () => {
  it('a core row gives the skill to a chosen personnel, a self row to its card', () => {
    expect(attemptAbilityRowValid(ATTEMPTING)).toBe(true);
    expect(attemptAbilityRowValid({ ...ATTEMPTING, steps: [{ kind: 'gainSkill', target: 'self' }] })).toBe(false);
    expect(attemptAbilityRowValid({ ...ATTEMPTING, source: undefined })).toBe(false);
  });
});

describe('the skills offered (#1958)', () => {
  it('are only the skills the personnel already has', () => {
    const s = initialGameState(table());
    expect(gainSkillOptionsOf(s.table, 'p1')).toEqual(['Diplomacy', 'Security']);
    expect(gainSkillOptionsOf(s.table, 'p2')).toEqual(['Medical']);
    // A stopped personnel, or a card that is not in the group, has none.
    expect(gainSkillOptionsOf(s.table, 'p3')).toEqual([]);
    expect(gainSkillOptionsOf(s.table, 'practice')).toEqual([]);
  });

  it('refuse a skill it lacks, a stopped personnel and a use with no skill', () => {
    const s = initialGameState(table());
    expect(attemptAbilitiesOf(s).filter((o) => o.id === 'practice').map((o) => o.targetId)).toEqual(['p1', 'p2']);
    expect(run(s, gain('p1', 'Medical'))).toBe(s);
    expect(run(s, gain('p1', 'Plasma'))).toBe(s);
    expect(run(s, gain('p3', 'Science'))).toBe(s);
    expect(run(s, gain('p1'))).toBe(s);
    expect(run(s, { type: 'useAttemptAbility', id: 'practice', index: 0, skill: 'Security' })).toBe(s);
  });

  it('include a level an earlier use gave', () => {
    const s = run(initialGameState(table()), gain('p1', 'Security'), gain('p1', 'Security'));
    expect(s.table.attempt?.timed?.map((t) => t.skills)).toEqual([['Security'], ['Security']]);
    expect(pileOf(s).personnel[0].skills[SECURITY]).toBe(3);
  });
});

describe('a gained level (#1958)', () => {
  const used = () => run(initialGameState(table()), gain('p1', 'Security'));

  it('is kept as a timed change and logged', () => {
    const s = used();
    expect(s.table.attempt?.timed).toEqual([{ title: 'Invented Practice', sourceId: 'practice', targetId: 'p1', changes: {}, skills: ['Security'] }]);
    expect(s.log.at(-1)).toMatchObject({ kind: 'attemptAbilityUsed', skill: 'Security' });
    expect(logEntryText(s.log.at(-1)!)).toBe('Invented Practice: made Crewman p1 gain Security until the end of this mission attempt');
  });

  it('is Security 2 for the bot, and the first listed skill is unchanged', () => {
    const before = pileOf(initialGameState(table()));
    const after = pileOf(used());
    expect(before.personnel[0].skills[SECURITY]).toBe(1);
    expect(after.personnel[0].skills[SECURITY]).toBe(2);
    expect(after.personnel[0].firstSkill).toBe(SECURITY);
    expect(after.personnel[0].firstSkillLevel).toBe(1);
    // The skill checks of the bot's Resolve, and the mission's 2 Security after the last dilemma.
    expect(playOf(before).skill(0, SECURITY)).toBe(1);
    expect(playOf(after).skill(0, SECURITY)).toBe(2);
    expect(playOf(before).meetsWithout()).toBe(false);
    expect(playOf(after).meetsWithout()).toBe(true);
  });

  it('stays when the first listed skill is turned off: only the listed level goes', () => {
    const before = pileOf(initialGameState(table()));
    const after = pileOf(used());
    expect(playOf(before, { firstSkillOff: true }).skill(0, SECURITY)).toBe(0);
    expect(playOf(after, { firstSkillOff: true }).skill(0, SECURITY)).toBe(1);
    const twice = pileOf(run(used(), gain('p1', 'Security')));
    expect(playOf(twice, { firstSkillOff: true }).meetsWithout()).toBe(true);
    expect(playOf(after, { firstSkillOff: true }).meetsWithout()).toBe(false);
  });

  it('is not a first skill of a personnel with no printed skill', () => {
    const s = initialGameState(table({ team: [person('p1', '')] }));
    expect(gainSkillOptionsOf(s.table, 'p1')).toEqual([]);
  });

  it('ends with the attempt, and one undo removes it', () => {
    const s = used();
    expect(run(s, { type: 'endAttempt' }).table.attempt).toBeUndefined();
    const undone = run(s, { type: 'undo' });
    expect(undone.table.attempt?.timed).toBeUndefined();
    expect(pileOf(undone).personnel[0].skills[SECURITY]).toBe(1);
  });

  it('is kept by a save, and a save with an unknown skill drops it', () => {
    const s = used();
    const cards = [planet, practice, drills, person('p1', 'Security, Diplomacy'), person('p2', 'Medical'), person('p3', 'Science'), dilemma('d1', 'Invented Snare'), dilemma('d2', 'Invented Trap')];
    const deck: DeckList = Object.fromEntries(cards.map((c) => [c.id, { count: 1, row: c.card }]));
    const save = () => JSON.parse(JSON.stringify(toSavedGame(s.table, deck, 'builder', undefined, undefined, s.log)));
    expect(fromSavedGame(JSON.stringify(save()), deck)?.table.attempt?.timed).toEqual(s.table.attempt?.timed);
    const unknown = save();
    unknown.table.attempt.timed[0].skills = ['Plasma'];
    const repaired = fromSavedGame(JSON.stringify(unknown), deck);
    expect(repaired?.table.attempt).toBeDefined();
    expect(repaired?.table.attempt?.timed).toBeUndefined();
  });
});

describe('a gain in the facing-dilemma window (#1958, #1956)', () => {
  const facing = () => run(initialGameState(table()), { type: 'flip', id: 'd1' }, gain('p1', 'Security', 'drills'));

  it('counts in the revealed dilemma reads, and ends with its dilemma', () => {
    const s = facing();
    expect(s.table.attempt?.timed).toEqual([{ title: 'Invented Drills', sourceId: 'drills', targetId: 'p1', changes: {}, skills: ['Security'], untilDilemma: 'd1' }]);
    expect(logEntryText(s.log.at(-1)!)).toBe('Invented Drills: made Crewman p1 gain Security until the end of Invented Snare');
    expect(revealedPileAttemptOf(s.table)?.personnel[0].skills[SECURITY]).toBe(2);
    const moved = run(s, { type: 'move', id: 'd1', to: under });
    expect(moved.table.attempt?.timed).toBeUndefined();
    expect(pileOf(moved).personnel[0].skills[SECURITY]).toBe(1);
  });
});

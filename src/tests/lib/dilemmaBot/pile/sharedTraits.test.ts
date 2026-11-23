// Issue #1868: the dilemma tests of `families.ts` match their traits with the table view's predicate, so a
// dilemma and a player card that say "a personnel who has Honor" read the same code. The dilemma reads its
// skills live, through `PlayState.skill`.
import { SKILL_INDEX, BOT_SKILLS } from '../../../../lib/dilemmaBot/requirements';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { PileAttempt, PlayModifiers } from '../../../../lib/dilemmaBot/pile/model';
import { PlayState } from '../../../../lib/dilemmaBot/pile/play';
import { affiliationIs, hasAny, iconIs, keywordIs, personnelIs, speciesIs } from '../../../../lib/dilemmaBot/pile/families';
import { pileAttemptOf } from '../../../../lib/dilemmaBot/pile/tableAttempt';
import { SourcePersonnel, TableSource, TraitQuery, personnel } from '../../../../lib/tableView';

const skillsOf = (...names: string[]): number[] => {
  const skills = new Array<number>(BOT_SKILLS.length).fill(0);
  for (const n of names) skills[SKILL_INDEX[n]] += 1;
  return skills;
};

const TRAITS = {
  name: 'alpha',
  affiliation: 'romulan',
  species: ['romulan'],
  keywords: ['admiral'],
  icons: ['[cmd]', '[tng]'],
  skills: skillsOf('honor', 'physics'),
};

function attemptWith(traits?: typeof TRAITS): PileAttempt {
  const mission = { type: 'mission', name: 'mission p', originalName: 'Mission p', missiontype: 'p', skills: 'Physics', points: 35, span: 3 };
  const { attempt } = pileAttemptOf({
    cards: [
      {
        card: { type: 'personnel', name: 'alpha', originalName: 'Alpha', skills: 'Honor, Physics', affiliation: 'Romulan', species: 'Romulan', integrity: 5, cunning: 5, strength: 5, cost: 2 },
        id: 'card-1',
      },
    ],
    mission,
    placedOn: [],
    underMission: [],
    missions: [{ mission }],
    hand: [],
    discard: [],
    turn: 3,
  });
  return { ...attempt, personnel: attempt.personnel.map((p) => (traits ? { ...p, traits } : { ...p, traits: undefined })) };
}

const stateOf = (attempt: PileAttempt, modifiers?: PlayModifiers, skillRead?: () => void) =>
  new PlayState({ attempt: modifiers ? { ...attempt, modifiers } : attempt, rand: seededRandom(1), skillRead });

const sourceOf = (p: SourcePersonnel): TableSource => ({
  personnelOf: () => [p],
  shipsOf: () => [],
  eventsOf: () => [],
  missionsOf: () => [],
  coreOf: () => [],
  playsOf: () => [],
});

describe('the shared trait predicate (#1868)', () => {
  const queries: TraitQuery[] = [
    { skill: 'honor' },
    { skill: 'diplomacy' },
    { anySkill: ['diplomacy', 'physics'] },
    { anySkill: ['diplomacy', 'medical'] },
    { species: 'romulan' },
    { species: 'human' },
    { affiliation: 'romulan' },
    { affiliation: 'Federation' },
    { keyword: 'admiral' },
    { keyword: 'general' },
    { icon: '[cmd]' },
    { icon: 'TNG' },
    { icon: '[stf]' },
  ];

  it.each(queries)('reads one card the same as a table-view personnel and as a dilemma personnel: %j', (q) => {
    const asView = personnel(sourceOf({ ...TRAITS }), { ...q, unstopped: false }).length > 0;
    const asDilemma = personnelIs(q)(stateOf(attemptWith(TRAITS)), 0);
    expect(asDilemma).toBe(asView);
  });

  it('fails a skill the attempt blocks, read live', () => {
    const attempt = attemptWith(TRAITS);
    expect(hasAny('physics')(stateOf(attempt), 0)).toBe(true);
    expect(hasAny('physics')(stateOf(attempt, { blockedSkills: [SKILL_INDEX.physics] }), 0)).toBe(false);
    expect(hasAny('diplomacy', 'physics')(stateOf(attempt, { blockedSkills: [SKILL_INDEX.physics] }), 0)).toBe(false);
  });

  it('calls skillRead when a test reads a skill, and not for a printed trait', () => {
    const attempt = attemptWith(TRAITS);
    const read = jest.fn();
    expect(affiliationIs('romulan')(stateOf(attempt, undefined, read), 0)).toBe(true);
    expect(speciesIs('romulan')(stateOf(attempt, undefined, read), 0)).toBe(true);
    expect(read).not.toHaveBeenCalled();
    hasAny('honor')(stateOf(attempt, undefined, read), 0);
    expect(read).toHaveBeenCalled();
  });

  it('gives a personnel with no traits no keyword and no icon', () => {
    const s = stateOf(attemptWith());
    expect(keywordIs('admiral')(s, 0)).toBe(false);
    expect(iconIs('[cmd]')(s, 0)).toBe(false);
    const withTraits = stateOf(attemptWith(TRAITS));
    expect(keywordIs('admiral')(withTraits, 0)).toBe(true);
    expect(iconIs('[cmd]')(withTraits, 0)).toBe(true);
  });

  it('keeps the texts the Resolve prints', () => {
    expect(hasAny('honor', 'treachery').text).toBe('Honor or Treachery');
    expect(affiliationIs('romulan').text).toBe('the Romulan affiliation');
  });

  it('throws on an unknown skill', () => {
    expect(() => personnelIs({ skill: 'juggling' })).toThrow('unknown skill juggling');
  });
});

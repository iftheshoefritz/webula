// Issue #1509: the dilemma lab's attempt of the pile bot, and its draw as titles.
import { LAB_TABLE, drawLabTitles, labPileAttemptOf } from '../../../../lib/dilemmaBot/pile/labAttempt';
import { pilePersonnelOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { OPPONENT_DILEMMAS } from '../../../../lib/dilemmaBot/opponentPile';
import { seededRandom } from '../../../../lib/dilemmaBot/simulator';

const row = (name: string, skills: string, gametext?: string) => ({
  originalName: name,
  name,
  cost: '2',
  integrity: '6',
  cunning: '6',
  strength: '6',
  skills,
  ...(gametext ? { gametext } : {}),
});

const LOSS = 'while you command a [bor] non-dissident personnel, this personnel loses all of his skills and his next ability.';

describe('labPileAttemptOf (#1509)', () => {
  const mission = { requirements: 'Physics, Cunning>10', missiontype: 's', quadrant: 'a', points: '35', span: 3, nebula: true };

  it('plays against the plain table, with no ship, at the mission of the lab', () => {
    const attempt = labPileAttemptOf([row('A', 'Physics'), row('B', 'Science')], mission, { gameOnMission: 1, choice: 'random' })!;

    expect(attempt.table).toEqual({
      headquarters: 0,
      completedMissions: 0,
      completedSpaceMission: false,
      handSize: 7,
      handHasCunning7Or11: false,
      discardCopiesMax: 0,
      missionSkills: [],
      underMission: [],
      turn: 1,
    });
    expect(attempt.table).toBe(LAB_TABLE);
    expect(attempt.mission).toEqual({ kind: 'space', points: 35, span: 3, nebula: true });
    expect(attempt.ship).toBeUndefined();
    expect(attempt.gameOnMission).toBe(1);
    expect(attempt.choice).toBe('random');
    expect(attempt.personnel.map((p) => p.name)).toEqual(['A', 'B']);
    expect(attempt.requirements.length).toBeGreaterThan(0);
  });

  it('reads a planet mission, and gives null when the bot cannot read the requirements', () => {
    const planet = labPileAttemptOf([row('A', 'Physics')], { ...mission, missiontype: 'p', nebula: false }, { gameOnMission: 0, choice: 'best' })!;
    expect(planet.mission.kind).toBe('planet');
    expect(planet.mission.nebula).toBe(false);
    expect(labPileAttemptOf([], { ...mission, requirements: 'Something the parser cannot read' }, { gameOnMission: 0, choice: 'best' })).toBeNull();
  });

  it('keeps a skill loss suspended when Sphere 117 holds', () => {
    const tuvok = row('T', 'Law, Security', LOSS);
    const lost = labPileAttemptOf([tuvok], mission, { gameOnMission: 0, choice: 'best' })!;
    const kept = labPileAttemptOf([tuvok], mission, { gameOnMission: 0, choice: 'best', sphere117: true })!;
    expect(lost.personnel[0].skills.some(Boolean)).toBe(false);
    expect(kept.personnel[0].skills.some(Boolean)).toBe(true);
  });
});

describe('pilePersonnelOf with lossSuspended (#1509)', () => {
  it('keeps the skills of a personnel with a skill loss when it is set', () => {
    const tuvok = row('T', 'Law, Security', LOSS);
    expect(pilePersonnelOf(tuvok).skills.some(Boolean)).toBe(false);
    expect(pilePersonnelOf(tuvok, undefined, undefined, true).skills.some(Boolean)).toBe(true);
  });
});

describe('drawLabTitles (#1509)', () => {
  it('draws the same titles for the same randoms', () => {
    const titles = drawLabTitles(9, 1, 2, seededRandom(5));
    expect(titles).toEqual(drawLabTitles(9, 1, 2, seededRandom(5)));
    expect(titles).toHaveLength(9);
  });

  it('takes the dilemmas under the mission from the copies that are not Chula: The Game', () => {
    for (let s = 1; s <= 20; s++) {
      const titles = drawLabTitles(27, 0, 2, seededRandom(s));
      expect(titles).toHaveLength(25);
      expect(titles.filter((t) => t === 'Chula: The Game')).toHaveLength(3);
    }
  });

  it('draws only titles of the registry, at most 3 of each, and no more Games than are left', () => {
    for (let s = 1; s <= 20; s++) {
      const titles = drawLabTitles(27, 2, 0, seededRandom(s));
      expect(titles).toHaveLength(25);
      for (const t of titles) expect(REGISTRY.get(t)).toBeDefined();
      for (const d of OPPONENT_DILEMMAS) expect(titles.filter((t) => t === d.title).length).toBeLessThanOrEqual(3);
      expect(titles.filter((t) => t === 'Chula: The Game')).toHaveLength(1);
    }
  });
});

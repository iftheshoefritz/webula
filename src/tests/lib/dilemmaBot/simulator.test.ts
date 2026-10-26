import { DilemmaId } from '../../../lib/dilemmaBot/opponentPile';
import { BOT_SKILLS, parseRequirementBranches } from '../../../lib/dilemmaBot/requirements';
import { BotAttempt, BotPersonnel, PlayerChoice, botPersonnelOf, playStack, seededRandom } from '../../../lib/dilemmaBot/simulator';

const person = (i: number, c: number, s: number, cost = 2, skills: Record<string, number> = {}): BotPersonnel => ({
  name: `P${i}${c}${s}`,
  cost,
  attrs: [i, c, s],
  skills: BOT_SKILLS.map((name) => skills[name] ?? 0),
});

const anyGroup = parseRequirementBranches('Cunning>0')!;

/** The average result of 500 plays. */
function average(
  personnel: BotPersonnel[],
  stack: DilemmaId[],
  { gameOnMission = 0, requirements = anyGroup, choice = 'best' as PlayerChoice } = {},
) {
  const attempt: BotAttempt = { personnel, requirements, gameOnMission, choice };
  let stopped = 0;
  let returned = 0;
  let fails = 0;
  const plays = 500;
  for (let r = 0; r < plays; r++) {
    const result = playStack(attempt, stack, seededRandom(r));
    stopped += result.stopped;
    returned += result.returned;
    fails += result.fail ? 1 : 0;
  }
  return { stopped: stopped / plays, returned: returned / plays, pFail: fails / plays };
}

const three = (i: number, c: number, s: number) => [person(i, c, s), person(i, c, s), person(i, c, s)];

describe('each dilemma of the pile', () => {
  it('Chula: Echoes stops all three when the highest Cunning is even', () => {
    expect(average([person(5, 6, 5), person(5, 4, 5), person(5, 3, 5)], ['echoes']).stopped).toBe(3);
    expect(average([person(5, 7, 5), person(5, 4, 5), person(5, 3, 5)], ['echoes']).stopped).toBe(0);
  });

  it('Chula: Move Along Home stops all three when the highest Strength is even', () => {
    expect(average([person(5, 5, 8), person(5, 5, 3), person(5, 5, 5)], ['moveAlongHome']).stopped).toBe(3);
    expect(average(three(5, 5, 7), ['moveAlongHome']).stopped).toBe(0);
  });

  it('Chula: Unfortunate Roll stops all three when the total Integrity is odd', () => {
    expect(average([person(5, 5, 5), person(6, 5, 5), person(6, 5, 5)], ['unfortunateRoll']).stopped).toBe(3);
    expect(average(three(6, 5, 5), ['unfortunateRoll']).stopped).toBe(0);
  });

  it('Chula: Trickery stops all three unless they have 2 Officer or 12 different skills', () => {
    expect(average(three(5, 5, 5), ['trickery']).stopped).toBe(3);
    expect(average([person(5, 5, 5, 2, { officer: 2 }), person(5, 5, 5), person(5, 5, 5)], ['trickery']).stopped).toBe(0);
    const twelve = Object.fromEntries(BOT_SKILLS.slice(0, 12).map((s) => [s, 1]));
    expect(average([person(5, 5, 5, 2, twelve), person(5, 5, 5), person(5, 5, 5)], ['trickery']).stopped).toBe(0);
  });

  it('Chula: The Dice stops everyone unless three different personnel have Integrity>6, Cunning>6 and Strength>6', () => {
    expect(average([person(7, 1, 1), person(1, 7, 1), person(1, 1, 7), person(1, 1, 1)], ['dice']).stopped).toBe(0);
    // One personnel with 7/7/7 is not three different personnel.
    expect(average([person(7, 7, 7), person(1, 1, 1), person(1, 1, 1)], ['dice']).stopped).toBe(3);
  });

  it('Chula: The Chandra stops the first selected and each one until a cost equal or greater', () => {
    // All costs are equal, so the second selected ends it.
    expect(average([person(5, 5, 5, 1), person(5, 5, 5, 1), person(5, 5, 5, 1)], ['chandra']).stopped).toBe(2);
    // The first is the most expensive: every personnel is selected, and all are stopped.
    const costs = [person(5, 5, 5, 5), person(5, 5, 5, 1), person(5, 5, 5, 1)];
    const r = average(costs, ['chandra']);
    expect(r.stopped).toBeGreaterThan(2);
    expect(r.stopped).toBeLessThan(3);
  });

  it('Chula: The Precipice stops one half of an even group unless a half has Leadership, Cunning>5 and Honor', () => {
    expect(average(three(5, 5, 5), ['precipice']).stopped).toBe(0);
    expect(average([...three(5, 5, 5), person(5, 5, 5)], ['precipice']).stopped).toBe(2);
    const strong = [person(5, 5, 5, 2, { leadership: 1 }), person(5, 6, 5), person(5, 5, 5, 2, { honor: 1 })];
    // Both halves of 6 are the strong trio only when the split puts them together: some plays stop no one.
    expect(average([...strong, ...strong], ['precipice']).stopped).toBeLessThan(3);
  });

  it('Chula: Pick One to Save Two: the best choice returns one personnel when the requirements stay met', () => {
    const r = average(three(5, 5, 5), ['pickOne']);
    expect(r.returned).toBe(1);
    expect(r.stopped).toBe(0);
  });

  it('Chula: Pick One to Save Two: the best choice stops all three when no return keeps the requirements met', () => {
    const requirements = parseRequirementBranches('Cunning>14')!;
    const r = average(three(5, 5, 5), ['pickOne'], { requirements });
    expect(r.stopped).toBe(3);
    expect(r.returned).toBe(0);
  });

  it('Chula: Pick One to Save Two: a random choice sometimes stops all three', () => {
    const r = average(three(5, 5, 5), ['pickOne'], { choice: 'random' });
    expect(r.stopped).toBeGreaterThan(0);
    expect(r.returned).toBeGreaterThan(0);
  });
});

describe('Chula: The Game', () => {
  const odd = () => Array.from({ length: 6 }, () => person(6, 7, 5));

  it('a copy in the stack stops one personnel before each later dilemma of the stack', () => {
    // Odd Cunning and even Integrity totals: Echoes and Unfortunate Roll have no effect of their own.
    expect(average(odd(), ['game', 'echoes', 'unfortunateRoll']).stopped).toBe(2);
  });

  it('a copy already on the mission does the same in a new attempt', () => {
    expect(average(odd(), ['echoes'], { gameOnMission: 1 }).stopped).toBe(1);
  });

  it('two copies on the mission stop two personnel before each dilemma', () => {
    expect(average(odd(), ['echoes', 'unfortunateRoll'], { gameOnMission: 2 }).stopped).toBe(4);
  });

  it('a copy on the mission also stops a personnel before a new copy, which then adds its own stop', () => {
    expect(average(odd(), ['game', 'echoes'], { gameOnMission: 1 }).stopped).toBe(3);
  });
});

describe('the end of the stack', () => {
  it('the attempt fails when the unstopped personnel lose a required skill', () => {
    const requirements = parseRequirementBranches('Physics')!;
    const group = [person(5, 6, 5, 2, { physics: 1 }), person(5, 4, 5), person(5, 3, 5)];
    expect(average(group, ['echoes'], { requirements }).pFail).toBe(1);
    expect(average(group, [], { requirements }).pFail).toBe(0);
  });

  it('the dilemmas after the last stop are not faced', () => {
    const lines: string[] = [];
    playStack(
      { personnel: three(1, 1, 1), requirements: anyGroup, gameOnMission: 0, choice: 'best' },
      ['dice', 'echoes'],
      seededRandom(1),
      (line) => lines.push(line),
    );
    expect(lines).toContain('echoes: not faced, every personnel is stopped');
  });
});

describe('botPersonnelOf', () => {
  it('reads a lowercased card data row', () => {
    const p = botPersonnelOf({
      originalName: 'Kira Nerys',
      name: 'kira nerys',
      cost: '3',
      integrity: '6',
      cunning: '6',
      strength: '6',
      skills: 'anthropology 2 honor leadership',
    });
    expect(p.name).toBe('Kira Nerys');
    expect(p.attrs).toEqual([6, 6, 6]);
    expect(p.skills[BOT_SKILLS.indexOf('honor')]).toBe(2);
    expect(p.skills[BOT_SKILLS.indexOf('leadership')]).toBe(1);
  });
});

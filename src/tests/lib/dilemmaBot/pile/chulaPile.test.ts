import { readFileSync } from 'fs';
import { join } from 'path';
import { BOT_SKILLS, RequirementBranch, parseRequirementBranches } from '../../../../lib/dilemmaBot/requirements';
import { PlayerChoice, partnerGroupOf, seededRandom } from '../../../../lib/dilemmaBot/simulator';
import { OPPONENT_DILEMMAS } from '../../../../lib/dilemmaBot/opponentPile';
import { PileAttempt, PilePersonnel, PileResult } from '../../../../lib/dilemmaBot/pile/model';
import { playPileStack } from '../../../../lib/dilemmaBot/pile/play';
import { pilePersonnelOf } from '../../../../lib/dilemmaBot/pile/pile';
import { REGISTRY } from '../../../../lib/dilemmaBot/pile/registry';
import { beamPileSearch, legalPileStacks } from '../../../../lib/dilemmaBot/pile/search';

// The Chula pile on the pile bot (#1507). The cases of the Chula bot's play (#1282, the partner gains of
// #1357), ported: each Chula dilemma draws its randoms and traces its lines as the Chula bot did.

const GAME = 'Chula: The Game';
const ECHOES = 'Chula: Echoes';
const MOVE = 'Chula: Move Along Home';
const ROLL = 'Chula: Unfortunate Roll';
const TRICKERY = 'Chula: Trickery';
const DICE = 'Chula: The Dice';
const CHANDRA = 'Chula: The Chandra';
const PRECIPICE = 'Chula: The Precipice';
const PICK_ONE = 'Chula: Pick One to Save Two';

const TABLE: PileAttempt['table'] = {
  headquarters: 1,
  completedMissions: 0,
  completedSpaceMission: false,
  handSize: 7,
  handHasCunning7Or11: false,
  discardCopiesMax: 0,
  missionSkills: [],
  underMission: [],
  turn: 1,
};
const PLANET: PileAttempt['mission'] = { kind: 'planet', points: 35, span: 2, nebula: false };

const person = (i: number, c: number, s: number, cost = 2, skills: Record<string, number> = {}): PilePersonnel => {
  const levels = BOT_SKILLS.map((name) => skills[name] ?? 0);
  return {
    name: `P${i}${c}${s}`,
    cost,
    attrs: [i, c, s],
    skills: levels,
    species: ['human'],
    affiliation: 'federation',
    skillDots: Object.keys(skills).length,
    hologram: false,
    printed: { skills: levels.slice(), attrs: [i, c, s] },
  };
};
const three = (i: number, c: number, s: number) => [person(i, c, s), person(i, c, s), person(i, c, s)];
const anyGroup = parseRequirementBranches('Cunning>0')!;

const attemptOf = (
  personnel: PilePersonnel[],
  { gameOnMission = 0, requirements = anyGroup, choice = 'best' as PlayerChoice } = {},
): PileAttempt => ({ personnel, requirements, mission: PLANET, table: TABLE, gameOnMission, choice });

const play = (attempt: PileAttempt, titles: string[], rand: () => number, trace?: (line: string) => void): PileResult =>
  playPileStack(attempt, titles.map((t) => REGISTRY.get(t)!), rand, trace);

/** The average result of 500 plays. */
function average(personnel: PilePersonnel[], titles: string[], options: Parameters<typeof attemptOf>[1] = {}) {
  const attempt = attemptOf(personnel, options);
  let stopped = 0;
  let returned = 0;
  let fails = 0;
  const plays = 500;
  for (let r = 0; r < plays; r++) {
    const result = play(attempt, titles, seededRandom(r));
    stopped += result.stopped;
    returned += result.returned;
    fails += result.fail ? 1 : 0;
  }
  return { stopped: stopped / plays, returned: returned / plays, pFail: fails / plays };
}

describe('the Chula pile in the registry', () => {
  it('has a model for each of the 9 Chula cards', () => {
    for (const d of OPPONENT_DILEMMAS) expect([d.title, REGISTRY.get(d.title)?.status]).toEqual([d.title, 'play']);
  });

  it('gives each Chula model the printed cost of the Chula bot', () => {
    for (const d of OPPONENT_DILEMMAS) expect([d.title, REGISTRY.get(d.title)!.printedCost]).toEqual([d.title, d.cost]);
  });
});

describe('each Chula dilemma, as the Chula bot played it', () => {
  it('Chula: Echoes stops all three when the highest Cunning is even', () => {
    expect(average([person(5, 6, 5), person(5, 4, 5), person(5, 3, 5)], [ECHOES]).stopped).toBe(3);
    expect(average([person(5, 7, 5), person(5, 4, 5), person(5, 3, 5)], [ECHOES]).stopped).toBe(0);
  });

  it('Chula: Move Along Home stops all three when the highest Strength is even', () => {
    expect(average([person(5, 5, 8), person(5, 5, 3), person(5, 5, 5)], [MOVE]).stopped).toBe(3);
    expect(average(three(5, 5, 7), [MOVE]).stopped).toBe(0);
  });

  it('Chula: Unfortunate Roll stops all three when the total Integrity is odd', () => {
    expect(average([person(5, 5, 5), person(6, 5, 5), person(6, 5, 5)], [ROLL]).stopped).toBe(3);
    expect(average(three(6, 5, 5), [ROLL]).stopped).toBe(0);
  });

  it('Chula: Trickery stops all three unless they have 2 Officer or 12 different skills', () => {
    expect(average(three(5, 5, 5), [TRICKERY]).stopped).toBe(3);
    expect(average([person(5, 5, 5, 2, { officer: 2 }), person(5, 5, 5), person(5, 5, 5)], [TRICKERY]).stopped).toBe(0);
    const twelve = Object.fromEntries(BOT_SKILLS.slice(0, 12).map((s) => [s, 1]));
    expect(average([person(5, 5, 5, 2, twelve), person(5, 5, 5), person(5, 5, 5)], [TRICKERY]).stopped).toBe(0);
  });

  it('Chula: The Dice stops everyone unless three different personnel have Integrity>6, Cunning>6 and Strength>6', () => {
    expect(average([person(7, 1, 1), person(1, 7, 1), person(1, 1, 7), person(1, 1, 1)], [DICE]).stopped).toBe(0);
    expect(average([person(7, 7, 7), person(1, 1, 1), person(1, 1, 1)], [DICE]).stopped).toBe(3);
  });

  it('Chula: The Chandra stops the first selected and each one until a cost equal or greater', () => {
    expect(average([person(5, 5, 5, 1), person(5, 5, 5, 1), person(5, 5, 5, 1)], [CHANDRA]).stopped).toBe(2);
    const r = average([person(5, 5, 5, 5), person(5, 5, 5, 1), person(5, 5, 5, 1)], [CHANDRA]);
    expect(r.stopped).toBeGreaterThan(2);
    expect(r.stopped).toBeLessThan(3);
  });

  it('Chula: The Precipice stops one half of an even group unless a half has Leadership, Cunning>5 and Honor', () => {
    expect(average(three(5, 5, 5), [PRECIPICE]).stopped).toBe(0);
    expect(average([...three(5, 5, 5), person(5, 5, 5)], [PRECIPICE]).stopped).toBe(2);
    const strong = [person(5, 5, 5, 2, { leadership: 1 }), person(5, 6, 5), person(5, 5, 5, 2, { honor: 1 })];
    expect(average([...strong, ...strong], [PRECIPICE]).stopped).toBeLessThan(3);
  });

  it('Chula: Pick One to Save Two: the best choice returns one personnel when the requirements stay met', () => {
    const r = average(three(5, 5, 5), [PICK_ONE]);
    expect([r.returned, r.stopped]).toEqual([1, 0]);
  });

  it('Chula: Pick One to Save Two: the best choice stops all three when no return keeps the requirements met', () => {
    const r = average(three(5, 5, 5), [PICK_ONE], { requirements: parseRequirementBranches('Cunning>14')! });
    expect([r.stopped, r.returned]).toEqual([3, 0]);
  });

  it('Chula: Pick One to Save Two: a random choice sometimes stops all three', () => {
    const r = average(three(5, 5, 5), [PICK_ONE], { choice: 'random' });
    expect(r.stopped).toBeGreaterThan(0);
    expect(r.returned).toBeGreaterThan(0);
  });
});

describe('Chula: The Game', () => {
  const odd = () => Array.from({ length: 6 }, () => person(6, 7, 5));

  it('a copy in the stack stops one personnel before each later Chula dilemma of the stack', () => {
    // Odd Cunning and even Integrity totals: Echoes and Unfortunate Roll have no effect of their own.
    expect(average(odd(), [GAME, ECHOES, ROLL]).stopped).toBe(2);
  });

  it('a copy already on the mission does the same in a new attempt', () => {
    expect(average(odd(), [ECHOES], { gameOnMission: 1 }).stopped).toBe(1);
  });

  it('two copies on the mission stop two personnel before each dilemma', () => {
    expect(average(odd(), [ECHOES, ROLL], { gameOnMission: 2 }).stopped).toBe(4);
  });

  it('a copy on the mission also stops a personnel before a new copy, which then adds its own stop', () => {
    expect(average(odd(), [GAME, ECHOES], { gameOnMission: 1 }).stopped).toBe(3);
  });

  it('stops no one before a dilemma whose title does not begin with Chula', () => {
    // Discommendation: three random personnel, none Klingon, so the player stops one of them.
    expect(average(odd(), ['Discommendation'], { gameOnMission: 2 }).stopped).toBe(1);
    expect(average(odd(), [GAME, 'Discommendation']).stopped).toBe(1);
  });

  it('goes onto the mission, not beneath it', () => {
    expect(REGISTRY.get(GAME)!.goesUnder).toBe(false);
  });

  it('leads every stack of a draw that holds it, one copy only', () => {
    const attempt = attemptOf(odd());
    const drawn = [GAME, ECHOES, GAME, ROLL, TRICKERY];
    const stacks = legalPileStacks(attempt, drawn, 4);
    expect(stacks.every((s) => s[0] === GAME && s.filter((t) => t === GAME).length === 1)).toBe(true);
    expect(stacks).toContainEqual([GAME]);
    const result = beamPileSearch(attempt, drawn, 4, 1);
    for (const s of result.ranked) expect([s.stack[0], s.stack.filter((t) => t === GAME).length]).toEqual([GAME, 1]);
  });
});

describe('the end of the stack', () => {
  it('the attempt fails when the unstopped personnel lose a required skill', () => {
    const requirements = parseRequirementBranches('Physics')!;
    const group = [person(5, 6, 5, 2, { physics: 1 }), person(5, 4, 5), person(5, 3, 5)];
    expect(average(group, [ECHOES], { requirements }).pFail).toBe(1);
    expect(average(group, [], { requirements }).pFail).toBe(0);
  });

  it('the dilemmas after the last stop are not faced', () => {
    const lines: string[] = [];
    play(attemptOf(three(1, 1, 1)), [DICE, ECHOES], seededRandom(1), (line) => lines.push(line));
    expect(lines).toContain(`${ECHOES}: not faced, every personnel is stopped`);
  });
});

// ---- The partner gains in a play (#1357) ----

// The rows are read by hand and lowercased as `parseCardData` does: Jest does not load the real d3.
const data = (() => {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
  return rows.map((r) => {
    const row = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()])) as Record<string, string> & { name: string };
    row.originalName = r[head.indexOf('Name')];
    return row;
  });
})();
type Row = Parameters<typeof pilePersonnelOf>[0];

describe('the partner gains in a play (#1357)', () => {
  const byName = (name: string) => ({ ...data.find((c) => c.originalName === name)!, type: 'personnel' }) as unknown as Row;
  const troi = byName('Deanna Troi Major Rakal'); // 6/5/4; with a Dissident 7/6/5 and Intelligence, Leadership, Security
  const dissident = byName('N\'Vek Soldier of the Underground'); // [Rom], Dissident, 4/5/6
  const jural = byName('Jural'); // 4/6/5, no Security
  const tuvok = byName('Tuvok Undercover'); // 6/7/7; facing with a [Maq] 7/8/8 and Intelligence
  const maquis = byName('Cal Hudson Convincing Recruiter'); // [Maq], 4/6/6
  const low = data.find(
    (c) => c.type === 'personnel' && c.integrity === '4' && c.cunning === '4' && !c.gametext.includes('present'),
  )! as unknown as Row;

  /** `rand` that returns `values` in turn, then 0. */
  const scripted = (...values: number[]) => () => values.shift() ?? 0;
  const branch = (skill: string): RequirementBranch[] => [{ skills: BOT_SKILLS.map((s) => (s === skill ? 1 : 0)), attrs: [-1, -1, -1] }];
  const partnerAttempt = (cards: Row[], requirements: RequirementBranch[] = [], gameOnMission = 0): PileAttempt => ({
    ...partnerGroupOf(cards.map((c) => pilePersonnelOf(c))),
    requirements,
    mission: PLANET,
    table: TABLE,
    gameOnMission,
    choice: 'best',
  });
  const traceOf = (attempt: PileAttempt, titles: string[], rand: () => number) => {
    const lines: string[] = [];
    const result = play(attempt, titles, rand, (line) => lines.push(line));
    return { ...result, lines };
  };

  it('counts Troi\'s gain at the first dilemma, with the Dissident unstopped', () => {
    const { lines } = traceOf(partnerAttempt([troi, dissident, jural]), [ROLL], scripted());
    expect(lines.some((l) => l.includes('total Integrity 15: stops Deanna Troi'))).toBe(true);
  });

  it('checks the dilemma that stops the Dissident with the gain', () => {
    const { lines } = traceOf(partnerAttempt([troi, dissident, low]), [ECHOES], scripted());
    expect(lines.some((l) => l.includes('highest Cunning 6') && l.includes('stops'))).toBe(true);
  });

  it('drops the gain from the next dilemma on, after Echoes stops the Dissident', () => {
    const { lines } = traceOf(partnerAttempt([troi, dissident, jural, maquis]), [ECHOES, ROLL], scripted(0.3, 0.4, 0.6));
    expect(lines.some((l) => l.includes('highest Cunning 6') && l.includes('stops') && !l.includes('Troi'))).toBe(true);
    expect(lines.some((l) => l.includes('total Integrity 6: even, no effect'))).toBe(true);
  });

  it('drops the gain at the dilemma after Chula: The Game stops the Dissident', () => {
    const { lines } = traceOf(partnerAttempt([troi, dissident, jural], [], 1), [ROLL], scripted(0.4));
    expect(lines.some((l) => l.includes('Chula: The Game on the mission stops N\'Vek'))).toBe(true);
    expect(lines.some((l) => l.includes('total Integrity 10: even, no effect'))).toBe(true);
  });

  it('meets a requirement only Troi\'s gain gives while the Dissident is unstopped after the last dilemma', () => {
    const security = branch('security');
    expect(play(partnerAttempt([troi, dissident, jural], security), [], scripted()).fail).toBe(false);
    expect(play(partnerAttempt([troi, dissident, jural], security, 1), [GAME], scripted(0.4)).fail).toBe(true);
    expect(play(partnerAttempt([troi, dissident, jural], security, 1), [GAME], scripted(0.9)).fail).toBe(false);
  });

  it('predicts the requirements check in Pick One to Save Two with the gains of the set it tests', () => {
    const { fail, lines } = traceOf(partnerAttempt([troi, dissident, jural], branch('security')), [PICK_ONE], scripted());
    expect(lines.some((l) => l.endsWith('the player returns Jural to the hand'))).toBe(true);
    expect(fail).toBe(false);
  });

  it('drops the gain from the next dilemma on, after Pick One returns the Dissident', () => {
    const attempt = { ...partnerAttempt([troi, dissident, jural]), choice: 'random' as const };
    const { lines } = traceOf(attempt, [PICK_ONE, ROLL], scripted(0, 0, 0, 0.5));
    expect(lines.some((l) => l.includes('the player returns N\'Vek'))).toBe(true);
    expect(lines.some((l) => l.includes('total Integrity 10: even, no effect'))).toBe(true);
  });

  it('drops Tuvok\'s gain in the dilemma checks when his [Maq] partner is stopped, and never counts it in the requirements', () => {
    const lowIntegrity = pilePersonnelOf(low).attrs[0];
    const { fail, lines } = traceOf(partnerAttempt([tuvok, maquis, low], branch('intelligence'), 1), [ROLL], scripted(0.4));
    expect(lines.some((l) => l.includes('Chula: The Game on the mission stops Cal Hudson'))).toBe(true);
    expect(lines.some((l) => l.includes(`total Integrity ${6 + lowIntegrity}`))).toBe(true);
    expect(fail).toBe(true);
    expect(play(partnerAttempt([tuvok, maquis, low], branch('intelligence')), [], scripted()).fail).toBe(true);
  });
});

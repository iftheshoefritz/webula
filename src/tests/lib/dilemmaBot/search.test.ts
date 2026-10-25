import { DILEMMA_BY_ID, DilemmaId, opponentPile } from '../../../lib/dilemmaBot/opponentPile';
import { BOT_SKILLS, parseRequirementBranches } from '../../../lib/dilemmaBot/requirements';
import {
  FULL_SEARCH_LIMIT,
  chooseStack,
  drawDilemmas,
  fastSearch,
  isLegalStack,
  legalStacks,
  randomLegalStack,
  rankScores,
  StackScore,
} from '../../../lib/dilemmaBot/search';
import { BotAttempt, BotPersonnel, seededRandom } from '../../../lib/dilemmaBot/simulator';

const ALL_TITLES = Array.from(new Set(opponentPile()));

const person = (k: number, skills: Record<string, number> = {}): BotPersonnel => ({
  name: `P${k}`,
  cost: 1 + (k % 4),
  attrs: [4 + (k % 4), 5 + (k % 3), 4 + (k % 5)],
  skills: BOT_SKILLS.map((s) => skills[s] ?? 0),
});

const attemptOf = (size: number, gameOnMission = 0): BotAttempt => ({
  personnel: Array.from({ length: size }, (_, k) => person(k, k === 0 ? { physics: 1 } : { science: 1 })),
  requirements: parseRequirementBranches('Physics, 2 Science')!,
  gameOnMission,
  choice: 'best',
});

describe('the legality filter', () => {
  const drawn: DilemmaId[] = ['echoes', 'dice', 'pickOne', 'chandra'];

  it('fails a stack with a total cost above N', () => {
    expect(isLegalStack(['dice', 'pickOne'], drawn, 4)).toBe(false);
  });

  it('passes a stack with a total cost of exactly N', () => {
    expect(isLegalStack(['dice', 'echoes'], drawn, 4)).toBe(true);
  });

  it('fails a stack with a duplicate title', () => {
    expect(isLegalStack(['echoes', 'echoes'], ['echoes', 'echoes'], 4)).toBe(false);
  });

  it('fails a stack with a title that was not drawn', () => {
    expect(isLegalStack(['trickery'], drawn, 4)).toBe(false);
  });
});

describe('legalStacks', () => {
  it('puts one copy of Chula: The Game first in every stack when the draw holds it', () => {
    const stacks = legalStacks(['game', 'game', 'echoes', 'unfortunateRoll'], 2);
    expect(stacks.every((s) => s[0] === 'game' && s.filter((id) => id === 'game').length === 1)).toBe(true);
    expect(stacks).toHaveLength(5); // [], [E], [U], [E, U], [U, E], each after The Game
  });

  it('gives 109,601 ordered stacks when every title is drawn and N is 18 or more', () => {
    expect(legalStacks(ALL_TITLES, 18)).toHaveLength(109601);
  });
});

describe('drawDilemmas', () => {
  it('draws N dilemmas, and a drawn 0-cost dilemma uses one of the N draws', () => {
    for (let seed = 0; seed < 50; seed++) {
      const drawn = drawDilemmas(6, 0, 0, seededRandom(seed));
      expect(drawn).toHaveLength(6);
    }
    const withGame = Array.from({ length: 200 }, (_, s) => drawDilemmas(6, 0, 0, seededRandom(s))).find((d) =>
      d.includes('game'),
    )!;
    expect(withGame.filter((id) => id !== 'game').length).toBeLessThan(6);
  });

  it('leaves out the copies of Chula: The Game on the mission', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(drawDilemmas(24, 3, 0, seededRandom(seed))).not.toContain('game');
    }
  });

  it('leaves out the dilemmas under the mission', () => {
    expect(drawDilemmas(27, 0, 5, seededRandom(1))).toHaveLength(22);
  });
});

describe('rankScores', () => {
  const score = (pFail: number, damage: number, under: number): StackScore => ({
    stack: [],
    pFail,
    damage,
    under,
    plays: 1,
  });

  it('when confident, takes the most lasting damage among the sure stacks', () => {
    const { mode, ranked } = rankScores([score(1, 4, 2), score(0.95, 6, 2), score(0.5, 9, 1)]);
    expect(mode).toBe('confident');
    expect(ranked[0].damage).toBe(6);
  });

  it('when no stack can fail the attempt, takes the most lasting damage, then the fewest under', () => {
    const { mode, ranked } = rankScores([score(0.01, 3, 3), score(0, 3, 1), score(0.02, 2, 0)]);
    expect(mode).toBe('cannot-fail');
    expect(ranked[0].under).toBe(1);
  });

  it('otherwise takes the highest P(fail)', () => {
    const { mode, ranked } = rankScores([score(0.5, 9, 1), score(0.7, 1, 3)]);
    expect(mode).toBe('probability');
    expect(ranked[0].pFail).toBe(0.7);
  });
});

describe('the search at small, medium and large N', () => {
  it.each([2, 6, 12])('returns a legal stack at N = %i', (n) => {
    for (let seed = 1; seed <= 3; seed++) {
      const drawn = drawDilemmas(n, seed % 4, 0, seededRandom(seed));
      const result = chooseStack(attemptOf(Math.max(n, 6), seed % 3), drawn, n, seed);
      expect(isLegalStack(result.best.stack, drawn, n)).toBe(true);
      if (drawn.includes('game')) expect(result.best.stack[0]).toBe('game');
    }
  });

  it('uses the fast search above the limit of the full search', () => {
    const drawn = ALL_TITLES;
    expect(legalStacks(drawn, 12).length).toBeGreaterThan(FULL_SEARCH_LIMIT);
    expect(chooseStack(attemptOf(12), drawn, 12).method).toBe('fast');
    expect(chooseStack(attemptOf(6), drawn, 4).method).toBe('full');
  });

  it('the fast search returns a legal stack that holds a cost of N or less', () => {
    const result = fastSearch(attemptOf(10), legalStacks(ALL_TITLES, 10));
    expect(result.best.stack.reduce((s, id) => s + DILEMMA_BY_ID[id].cost, 0)).toBeLessThanOrEqual(10);
  });

  it('the random legal choice returns a legal stack', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(isLegalStack(randomLegalStack(ALL_TITLES, 5, seededRandom(seed)), ALL_TITLES, 5)).toBe(true);
    }
  });
});

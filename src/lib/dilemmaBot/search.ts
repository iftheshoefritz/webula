import { DILEMMA_BY_ID, DilemmaId, opponentPile } from './opponentPile';
import { BotAttempt, Rand, playStack, seededRandom } from './simulator';

// The search of the dilemma bot (#1282, #1287): every legal ordered stack of the draw, scored by the
// simulator, and ranked by P(fail), then the lasting damage, then the dilemmas under the mission.

/** A stack holds only drawn titles, no title twice, and a total cost of N or less. */
export function isLegalStack(stack: DilemmaId[], drawn: DilemmaId[], n: number): boolean {
  const titles = new Set(stack);
  if (titles.size !== stack.length) return false;
  if (!stack.every((id) => drawn.includes(id))) return false;
  return stack.reduce((sum, id) => sum + DILEMMA_BY_ID[id].cost, 0) <= n;
}

/**
 * Every legal ordered stack of the drawn titles. When the draw holds Chula: The Game, one copy goes
 * first in every stack: it costs 0, and the bot always plays it.
 */
export function legalStacks(drawn: DilemmaId[], n: number): DilemmaId[][] {
  const titles = Array.from(new Set(drawn)).filter((id) => id !== 'game');
  const prefix: DilemmaId[] = drawn.includes('game') ? ['game'] : [];
  const out: DilemmaId[][] = [];
  const grow = (current: DilemmaId[], cost: number) => {
    out.push(prefix.concat(current));
    for (const id of titles) {
      if (current.includes(id)) continue;
      const next = cost + DILEMMA_BY_ID[id].cost;
      if (next > n) continue;
      current.push(id);
      grow(current, next);
      current.pop();
    }
  };
  grow([], 0);
  return out;
}

/**
 * Draw `n` dilemmas from the opponent pile, without the copies of Chula: The Game on the mission and
 * the dilemmas under it. A drawn 0-cost dilemma uses one of the `n` draws too.
 */
export function drawDilemmas(n: number, gameOnMission: number, underMission: number, rand: Rand): DilemmaId[] {
  const pile = opponentPile();
  for (let c = 0; c < gameOnMission; c++) pile.splice(pile.indexOf('game'), 1);
  shuffle(pile, rand);
  for (let u = 0; u < underMission; u++) {
    const i = pile.findIndex((id) => id !== 'game');
    if (i >= 0) pile.splice(i, 1);
  }
  return pile.slice(0, Math.max(0, n));
}

function shuffle<T>(items: T[], rand: Rand): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** From this P(fail) the bot is confident, and takes the most lasting damage among the sure stacks. */
export const CONFIDENT = 0.9;
/** Below this best P(fail) no stack can fail the attempt, and the bot takes the most lasting damage. */
export const CANNOT_FAIL = 0.05;

export interface StackScore {
  stack: DilemmaId[];
  /** The probability that the stack fails the attempt. */
  pFail: number;
  /**
   * The average lasting damage: the personnel returned to the hand. A stop does not count, because a stopped
   * personnel is unstopped at the start of the next turn, so stops would only reward a bigger stack.
   */
  damage: number;
  /** The dilemmas the stack puts under the mission: every one except Chula: The Game. */
  under: number;
  plays: number;
}

export type DecisionMode = 'confident' | 'probability' | 'cannot-fail';

export function underCount(stack: DilemmaId[]): number {
  return stack.filter((id) => id !== 'game').length;
}

/** Play the stack `plays` times. Play `r` uses the seed `seed + r` for every stack, so two stacks compare fairly. */
export function scoreStack(attempt: BotAttempt, stack: DilemmaId[], plays: number, seed: number): StackScore {
  let fails = 0;
  let damage = 0;
  for (let r = 0; r < plays; r++) {
    const result = playStack(attempt, stack, seededRandom(seed * 7919 + r));
    if (result.fail) fails++;
    damage += result.returned;
  }
  return { stack, pFail: fails / plays, damage: damage / plays, under: underCount(stack), plays };
}

const byDamage = (a: StackScore, b: StackScore) => b.damage - a.damage || a.under - b.under;

/** Rank the scores, best first, by the rules of #1282. */
export function rankScores(scores: StackScore[]): { mode: DecisionMode; ranked: StackScore[] } {
  const best = Math.max(...scores.map((s) => s.pFail));
  if (best < CANNOT_FAIL) return { mode: 'cannot-fail', ranked: scores.slice().sort(byDamage) };
  if (best >= CONFIDENT) {
    const sure = scores.filter((s) => s.pFail >= CONFIDENT).sort(byDamage);
    const rest = scores.filter((s) => s.pFail < CONFIDENT).sort((a, b) => b.pFail - a.pFail || byDamage(a, b));
    return { mode: 'confident', ranked: sure.concat(rest) };
  }
  return { mode: 'probability', ranked: scores.slice().sort((a, b) => b.pFail - a.pFail || byDamage(a, b)) };
}

export type SearchMethod = 'full' | 'fast';

export interface SearchResult {
  method: SearchMethod;
  mode: DecisionMode;
  best: StackScore;
  /** The ranked stacks of the last round. */
  ranked: StackScore[];
  stackCount: number;
  plays: number;
}

/** Up to this many legal stacks, the bot plays every stack `FULL_PLAYS` times. */
export const FULL_SEARCH_LIMIT = 500;
export const FULL_PLAYS = 500;

/** Every stack with the same number of plays. */
export function fullSearch(attempt: BotAttempt, stacks: DilemmaId[][], plays = FULL_PLAYS, seed = 1): SearchResult {
  const { mode, ranked } = rankScores(stacks.map((s) => scoreStack(attempt, s, plays, seed)));
  return { method: 'full', mode, best: ranked[0], ranked, stackCount: stacks.length, plays: stacks.length * plays };
}

/** 8 plays for every stack, then keep the best third and double the plays, until 4 stacks are left. */
export function fastSearch(attempt: BotAttempt, stacks: DilemmaId[][], seed = 1, finalPlays = 400): SearchResult {
  let candidates = stacks;
  let plays = 8;
  let total = 0;
  while (candidates.length > 4) {
    const { ranked } = rankScores(candidates.map((s) => scoreStack(attempt, s, plays, seed)));
    total += candidates.length * plays;
    candidates = ranked.slice(0, Math.max(4, Math.ceil(ranked.length / 3))).map((s) => s.stack);
    plays *= 2;
  }
  const { mode, ranked } = rankScores(candidates.map((s) => scoreStack(attempt, s, finalPlays, seed)));
  total += candidates.length * finalPlays;
  return { method: 'fast', mode, best: ranked[0], ranked, stackCount: stacks.length, plays: total };
}

/** The bot's choice: the full search for a small draw, the fast search above `FULL_SEARCH_LIMIT` stacks. */
export function chooseStack(attempt: BotAttempt, drawn: DilemmaId[], n: number, seed = 1): SearchResult {
  const stacks = legalStacks(drawn, n);
  return stacks.length <= FULL_SEARCH_LIMIT ? fullSearch(attempt, stacks, FULL_PLAYS, seed) : fastSearch(attempt, stacks, seed);
}

/** The baseline of #1282: a random legal stack, Chula: The Game first when drawn. */
export function randomLegalStack(drawn: DilemmaId[], n: number, rand: Rand): DilemmaId[] {
  const stacks = legalStacks(drawn, n);
  return stacks[Math.floor(rand() * stacks.length)];
}

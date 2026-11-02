import { CANNOT_FAIL, CONFIDENT, DecisionMode, FULL_PLAYS, FULL_SEARCH_LIMIT, SearchMethod } from '../search';
import { Rand, seededRandom } from '../simulator';
import { DilemmaModel, PileAttempt, PileResult, costOf, lastingDamage } from './model';
import { playPileStack } from './play';
import { REGISTRY } from './registry';

// The search of the pile bot (#1320, the pilot). The same search as the Chula bot's (#1282): every legal
// ordered stack, scored by P(fail), then the lasting damage, then the dilemmas under the mission. What
// changes is the legality, which reads the registry, and the damage, which uses the weights of #1320.

/**
 * The models of the drawn titles the search tries: a title the registry lacks is left out, and so is a
 * title whose family is `'no-effect'`. It changes neither P(fail) nor the damage, and it puts one more
 * dilemma beneath the mission, so a stack with it always ranks below the same stack without it. Each
 * one would multiply the ordered stacks, since most cost 0.
 */
function modelsOf(drawn: ReadonlyArray<string>): DilemmaModel[] {
  return drawn.map((t) => REGISTRY.get(t)).filter((m): m is DilemmaModel => !!m && m.status === 'play' && m.family !== 'no-effect');
}

export const fitsMission = (model: DilemmaModel, attempt: PileAttempt) => model.kind === 'dual' || model.kind === attempt.mission.kind;

/**
 * A stack holds only drawn titles that match the mission, no title twice unless its model is
 * `repeatable` (and then no more copies than were drawn), and a total cost, for this attempt, of N or less.
 */
export function isLegalPileStack(attempt: PileAttempt, stack: ReadonlyArray<string>, drawn: ReadonlyArray<string>, n: number): boolean {
  let cost = 0;
  const used = new Map<string, number>();
  for (const title of stack) {
    const model = REGISTRY.get(title);
    if (!model || model.status !== 'play' || !fitsMission(model, attempt)) return false;
    const count = (used.get(title) ?? 0) + 1;
    if (count > 1 && !model.repeatable) return false;
    if (count > drawn.filter((t) => t === title).length) return false;
    used.set(title, count);
    cost += costOf(model, attempt);
  }
  return cost <= n;
}

/** Every legal ordered stack of the drawn titles, the empty stack first. */
export function legalPileStacks(attempt: PileAttempt, drawn: ReadonlyArray<string>, n: number, limit = Infinity): string[][] {
  const copies = new Map<string, number>();
  for (const m of modelsOf(drawn)) if (fitsMission(m, attempt)) copies.set(m.title, (copies.get(m.title) ?? 0) + 1);
  const options = Array.from(copies.keys()).map((title) => {
    const model = REGISTRY.get(title)!;
    return { title, cost: costOf(model, attempt), max: model.repeatable ? copies.get(title)! : 1 };
  });
  const out: string[][] = [];
  const used = new Map<string, number>();
  const current: string[] = [];
  const grow = (cost: number) => {
    if (out.length >= limit) return;
    out.push(current.slice());
    for (const o of options) {
      if ((used.get(o.title) ?? 0) >= o.max || cost + o.cost > n) continue;
      used.set(o.title, (used.get(o.title) ?? 0) + 1);
      current.push(o.title);
      grow(cost + o.cost);
      current.pop();
      used.set(o.title, used.get(o.title)! - 1);
    }
  };
  grow(0);
  return out;
}

/** The number of legal ordered stacks, counted without building them. */
export function countPileStacks(attempt: PileAttempt, drawn: ReadonlyArray<string>, n: number): number {
  const options = Array.from(new Set(modelsOf(drawn).filter((m) => fitsMission(m, attempt)).map((m) => m.title))).map((t) =>
    costOf(REGISTRY.get(t)!, attempt),
  );
  const memo = new Map<string, number>();
  const count = (mask: number, budget: number): number => {
    const key = `${mask}:${budget}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let total = 1;
    options.forEach((c, i) => {
      if (!(mask & (1 << i)) && c <= budget) total += count(mask | (1 << i), budget - c);
    });
    memo.set(key, total);
    return total;
  };
  return count(0, n);
}

export interface PileStackScore {
  stack: string[];
  pFail: number;
  /** The average lasting damage, with the weights of #1320. */
  damage: number;
  /** The dilemmas the stack puts beneath the mission. */
  under: number;
  plays: number;
}

export const underOf = (stack: ReadonlyArray<string>) => stack.filter((t) => REGISTRY.get(t)?.goesUnder !== false).length;

export function scorePileStack(attempt: PileAttempt, stack: string[], plays: number, seed: number, drawnCount = stack.length): PileStackScore {
  const models = stack.map((t) => REGISTRY.get(t)!);
  let fails = 0;
  let damage = 0;
  for (let r = 0; r < plays; r++) {
    const result: PileResult = playPileStack(attempt, models, seededRandom(seed * 7919 + r), undefined, drawnCount - stack.length);
    if (result.fail) fails++;
    damage += lastingDamage(result);
  }
  return { stack, pFail: fails / plays, damage: damage / plays, under: underOf(stack), plays };
}

const byDamage = (a: PileStackScore, b: PileStackScore) => b.damage - a.damage || a.under - b.under;

/** Rank the scores, best first, by the rules of #1282. */
export function rankPileScores(scores: PileStackScore[]): { mode: DecisionMode; ranked: PileStackScore[] } {
  // A reduce, not Math.max(...): the fast search ranks up to several hundred thousand scores.
  const best = scores.reduce((m, s) => Math.max(m, s.pFail), 0);
  if (best < CANNOT_FAIL) return { mode: 'cannot-fail', ranked: scores.slice().sort(byDamage) };
  if (best >= CONFIDENT) {
    const sure = scores.filter((s) => s.pFail >= CONFIDENT).sort(byDamage);
    const rest = scores.filter((s) => s.pFail < CONFIDENT).sort((a, b) => b.pFail - a.pFail || byDamage(a, b));
    return { mode: 'confident', ranked: sure.concat(rest) };
  }
  return { mode: 'probability', ranked: scores.slice().sort((a, b) => b.pFail - a.pFail || byDamage(a, b)) };
}

export interface PileSearchResult {
  method: SearchMethod;
  mode: DecisionMode;
  best: PileStackScore;
  ranked: PileStackScore[];
  stackCount: number;
  plays: number;
}

export function fullPileSearch(attempt: PileAttempt, stacks: string[][], plays = FULL_PLAYS, seed = 1, drawnCount = 0): PileSearchResult {
  const { mode, ranked } = rankPileScores(stacks.map((s) => scorePileStack(attempt, s, plays, seed, drawnCount)));
  return { method: 'full', mode, best: ranked[0], ranked, stackCount: stacks.length, plays: stacks.length * plays };
}

/** 8 plays for every stack, then keep the best third and double the plays, until 4 stacks are left. */
export function fastPileSearch(attempt: PileAttempt, stacks: string[][], seed = 1, finalPlays = 400, drawnCount = 0): PileSearchResult {
  let candidates = stacks;
  let plays = 8;
  let total = 0;
  while (candidates.length > 4) {
    const { ranked } = rankPileScores(candidates.map((s) => scorePileStack(attempt, s, plays, seed, drawnCount)));
    total += candidates.length * plays;
    candidates = ranked.slice(0, Math.max(4, Math.ceil(ranked.length / 3))).map((s) => s.stack);
    plays *= 2;
  }
  const { mode, ranked } = rankPileScores(candidates.map((s) => scorePileStack(attempt, s, finalPlays, seed, drawnCount)));
  total += candidates.length * finalPlays;
  return { method: 'fast', mode, best: ranked[0], ranked, stackCount: stacks.length, plays: total };
}

/** The bot's choice, as `chooseStack` of the Chula bot: the full search for a small draw, the fast search above. */
export function choosePileStack(attempt: PileAttempt, drawn: string[], n: number, seed = 1): PileSearchResult {
  const stacks = legalPileStacks(attempt, drawn, n);
  return stacks.length <= FULL_SEARCH_LIMIT
    ? fullPileSearch(attempt, stacks, FULL_PLAYS, seed, drawn.length)
    : fastPileSearch(attempt, stacks, seed, 400, drawn.length);
}

/** The baseline of #1282: a random legal stack. */
export function randomLegalPileStack(attempt: PileAttempt, drawn: string[], n: number, rand: Rand): string[] {
  const stacks = legalPileStacks(attempt, drawn, n);
  return stacks[Math.floor(rand() * stacks.length)];
}

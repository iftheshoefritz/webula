import { Rand, seededRandom } from '../simulator';
import { DilemmaModel, PileAttempt, PileResult, costOf, lastingDamage, stackCostOf } from './model';
import { playPileStack } from './play';
import { REGISTRY } from './registry';

// The search of the pile bot (#1320): a beam search over the legal ordered stacks, each scored by
// P(fail), then the lasting damage, then the dilemmas under the mission (#1282). The legality reads the
// registry, and the damage uses the weights of #1320.

/** From this P(fail) the bot is confident, and takes the most lasting damage among the sure stacks. */
export const CONFIDENT = 0.9;
/** Below this best P(fail) no stack can fail the attempt, and the bot takes the most lasting damage. */
export const CANNOT_FAIL = 0.05;

export type DecisionMode = 'confident' | 'probability' | 'cannot-fail';

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
 * `repeatable` (and then no more copies than were drawn), and a total cost, for this attempt, of N or less
 * (`stackCostOf`, which reads the order).
 */
export function isLegalPileStack(attempt: PileAttempt, stack: ReadonlyArray<string>, drawn: ReadonlyArray<string>, n: number): boolean {
  const used = new Map<string, number>();
  const models: DilemmaModel[] = [];
  for (const title of stack) {
    const model = REGISTRY.get(title);
    if (!model || model.status !== 'play' || !fitsMission(model, attempt)) return false;
    const count = (used.get(title) ?? 0) + 1;
    if (count > 1 && !model.repeatable) return false;
    if (count > drawn.filter((t) => t === title).length) return false;
    used.set(title, count);
    models.push(model);
  }
  return stackCostOf(attempt, models) <= n;
}

interface StackOption {
  title: string;
  cost: number;
  /** The copies a stack can hold: 1, or the copies drawn for a `repeatable` title. */
  max: number;
  model: DilemmaModel;
}

/**
 * The title every stack of this draw starts with, and its cost: a drawn `leads` title that fits the
 * mission and N, such as Chula: The Game (#1282). Null when the draw holds none.
 */
function leadOf(attempt: PileAttempt, drawn: ReadonlyArray<string>, n: number): { title: string; cost: number } | null {
  const model = modelsOf(drawn).find((m) => m.leads && fitsMission(m, attempt) && costOf(m, attempt) <= n);
  return model ? { title: model.title, cost: costOf(model, attempt) } : null;
}

/** The titles a stack can take after its lead, each with its cost and the copies it can hold. */
function stackOptions(attempt: PileAttempt, drawn: ReadonlyArray<string>): StackOption[] {
  const copies = new Map<string, number>();
  for (const m of modelsOf(drawn)) if (fitsMission(m, attempt) && !m.leads) copies.set(m.title, (copies.get(m.title) ?? 0) + 1);
  return Array.from(copies.keys()).map((title) => {
    const model = REGISTRY.get(title)!;
    return { title, cost: costOf(model, attempt), max: model.repeatable ? copies.get(title)! : 1, model };
  });
}

/**
 * Every legal ordered stack of the drawn titles, the shortest first, each after the draw's lead when it has
 * one. A stack grows at its end, with the discount its last title gives the next (Peremptory Plea). A
 * stack over N still grows while the extra budget of the titles not in it yet (Entanglement) could bring
 * it back to N.
 */
export function legalPileStacks(attempt: PileAttempt, drawn: ReadonlyArray<string>, n: number, limit = Infinity): string[][] {
  const options = stackOptions(attempt, drawn);
  const lead = leadOf(attempt, drawn, n);
  const out: string[][] = [];
  const used = new Map<string, number>();
  const current: string[] = lead ? [lead.title] : [];
  const leadModel = lead ? REGISTRY.get(lead.title)! : null;
  // The extra budget of the copies not in the stack yet.
  let slack = options.reduce((t, o) => t + (o.model.extraBudget ?? 0) * o.max, 0);
  const grow = (cost: number, discount: number) => {
    if (out.length >= limit) return;
    if (cost <= n) out.push(current.slice());
    for (const o of options) {
      if ((used.get(o.title) ?? 0) >= o.max) continue;
      const extra = o.model.extraBudget ?? 0;
      const next = cost + Math.max(0, o.cost - discount) - extra;
      if (next > n + slack - extra) continue;
      used.set(o.title, (used.get(o.title) ?? 0) + 1);
      current.push(o.title);
      slack -= extra;
      grow(next, o.model.discountsNext ? o.model.discountsNext(attempt) : 0);
      slack += extra;
      current.pop();
      used.set(o.title, used.get(o.title)! - 1);
    }
  };
  grow(lead?.cost ?? 0, leadModel?.discountsNext ? leadModel.discountsNext(attempt) : 0);
  return out;
}

/**
 * The number of legal ordered stacks, counted without building them. It reads each title at its own cost,
 * so it undercounts a draw with a title that changes the cost of a stack by its order or its extra budget
 * (Peremptory Plea, Entanglement): the lab and the pilot script read it only as a size.
 */
export function countPileStacks(attempt: PileAttempt, drawn: ReadonlyArray<string>, n: number): number {
  const options = Array.from(new Set(modelsOf(drawn).filter((m) => fitsMission(m, attempt) && !m.leads).map((m) => m.title))).map((t) =>
    costOf(REGISTRY.get(t)!, attempt),
  );
  const lead = leadOf(attempt, drawn, n);
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
  return count(0, n - (lead?.cost ?? 0));
}

export interface PileStackScore {
  stack: string[];
  pFail: number;
  /** The average lasting damage, with the weights of #1320. */
  damage: number;
  /** The dilemmas the stack puts beneath the mission. */
  under: number;
  /** The average personnel the stack stops. Not part of the rank: the beam search keeps stacks by it too. */
  stopped: number;
  plays: number;
}

export const underOf = (stack: ReadonlyArray<string>) => stack.filter((t) => REGISTRY.get(t)?.goesUnder !== false).length;

export function scorePileStack(attempt: PileAttempt, stack: string[], plays: number, seed: number, drawnCount = stack.length): PileStackScore {
  const models = stack.map((t) => REGISTRY.get(t)!);
  let fails = 0;
  let damage = 0;
  let stopped = 0;
  for (let r = 0; r < plays; r++) {
    const result: PileResult = playPileStack(attempt, models, seededRandom(seed * 7919 + r), undefined, drawnCount - stack.length);
    if (result.fail) fails++;
    damage += lastingDamage(result);
    stopped += result.stopped;
  }
  return { stack, pFail: fails / plays, damage: damage / plays, under: underOf(stack), stopped: stopped / plays, plays };
}

const byDamage = (a: PileStackScore, b: PileStackScore) => b.damage - a.damage || a.under - b.under;

/** Rank the scores, best first, by the rules of #1282. */
export function rankPileScores(scores: PileStackScore[]): { mode: DecisionMode; ranked: PileStackScore[] } {
  // A reduce, not Math.max(...): a long list of scores would overflow the stack of the call.
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
  method: 'beam';
  mode: DecisionMode;
  best: PileStackScore;
  ranked: PileStackScore[];
  stackCount: number;
  plays: number;
}

export interface BeamOptions {
  /** The stacks kept at each length. */
  width: number;
  /** The plays of each stack the beam scores. */
  plays: number;
  /** The best stacks of every length that get `finalPlays` at the end. */
  finalists: number;
  finalPlays: number;
}

/** The narrowest setting the beam pilot tried lost no P(fail) and at most 0.02 damage, at a quarter of the cost of 80×64 (#1320). */
export const BEAM_DEFAULTS: BeamOptions = { width: 20, plays: 32, finalists: 6, finalPlays: 400 };

/**
 * The beam search: build the stacks one dilemma at a time. Score every stack of one dilemma, keep the
 * best `width`, grow each of those by every title that still fits N, at every position, score the new
 * stacks, keep the best `width` again, until nothing fits. Every stack scored stays a candidate, so a short stack can
 * still win. The `finalists` best candidates then get `finalPlays` each. Its cost grows with N and the
 * width, never with the number of legal stacks. Every stack uses the same seeds, so two stacks compare fairly.
 */
export function beamPileSearch(
  attempt: PileAttempt,
  drawn: string[],
  n: number,
  seed = 1,
  options: Partial<BeamOptions> = {},
): PileSearchResult {
  const { width, plays, finalists, finalPlays } = { ...BEAM_DEFAULTS, ...options };
  const stackOpts = stackOptions(attempt, drawn);
  const score = (stack: string[]) => scorePileStack(attempt, stack, plays, seed, drawn.length);
  const lead = leadOf(attempt, drawn, n);
  const start = lead ? [lead.title] : [];
  const candidates: PileStackScore[] = [score(start)];
  let total = plays;
  let beam: { stack: string[] }[] = [{ stack: start }];
  let stackCount = 1;
  while (beam.length) {
    // Each kept stack grows by one title, put at every position, not only at the end: a dilemma such as
    // Dereliction of Duty does nothing alone and pays off only before another, so no stack that ends
    // with it ranks well enough to be kept.
    // The cost of each grown stack is checked as a whole (`stackCostOf`), since a discount on the title
    // after another (Peremptory Plea) depends on where the new title goes.
    const next: { stack: string[] }[] = [];
    const seen = new Set<string>();
    for (const { stack } of beam) {
      const models = stack.map((t) => REGISTRY.get(t)!);
      for (const o of stackOpts) {
        if (stack.filter((t) => t === o.title).length >= o.max) continue;
        for (let at = start.length; at <= stack.length; at++) {
          const grown = [...stack.slice(0, at), o.title, ...stack.slice(at)];
          const key = grown.join('\u0000');
          if (seen.has(key)) continue;
          seen.add(key);
          if (stackCostOf(attempt, [...models.slice(0, at), o.model, ...models.slice(at)]) > n) continue;
          next.push({ stack: grown });
        }
      }
    }
    if (!next.length) break;
    const scored = next.map((x) => ({ ...x, score: score(x.stack) }));
    total += next.length * plays;
    stackCount += next.length;
    candidates.push(...scored.map((x) => x.score));
    // Half the beam is the best by rank. The other half is the stacks that take the most personnel out
    // of the attempt, stops included, which rank no better: a stop does no lasting damage, but a later
    // "unless" dilemma fires only once enough personnel are stopped.
    const scores = scored.map((x) => x.score);
    const kept = new Set(rankPileScores(scores).ranked.slice(0, Math.ceil(width / 2)));
    const bySetup = scores.slice().sort((a, b) => b.stopped + b.damage - (a.stopped + a.damage) || a.under - b.under);
    for (const sc of bySetup) {
      if (kept.size >= width) break;
      kept.add(sc);
    }
    beam = scored.filter((x) => kept.has(x.score));
  }
  const top = rankPileScores(candidates).ranked.slice(0, finalists).map((c) => c.stack);
  const { mode, ranked } = rankPileScores(top.map((stack) => scorePileStack(attempt, stack, finalPlays, seed, drawn.length)));
  total += top.length * finalPlays;
  return { method: 'beam', mode, best: ranked[0], ranked, stackCount, plays: total };
}

/**
 * The bot's choice: the beam search, for every draw. It lost no P(fail) against a search of every legal
 * stack at any N of the beam pilot, 2 to 12, and its slowest search at N = 12 took under a second
 * (#1320, #1503).
 */
export function choosePileStack(attempt: PileAttempt, drawn: string[], n: number, seed = 1): PileSearchResult {
  return beamPileSearch(attempt, drawn, n, seed);
}

/** The baseline of #1282: a random legal stack. */
export function randomLegalPileStack(attempt: PileAttempt, drawn: string[], n: number, rand: Rand): string[] {
  const stacks = legalPileStacks(attempt, drawn, n);
  return stacks[Math.floor(rand() * stacks.length)];
}

import { COST_REGISTRY } from './registry';
import { cardTitleOf } from '../cardTitle';

// The detection of the cost-changing titles (#1692), and the coverage of a deck by the cost registry
// (#1697): the backlog test reads it over the whole card data, the game menu over the dealt deck.

/** The patterns of a sentence that changes a cost or grants counters. */
const COST_PATTERNS: RegExp[] = [
  /\bcosts? [+\-−]\s?\d/i, // "she is cost -1", "play this personnel at cost +1", "costs -2", "this personnel's cost -1"
  /\badditional (\d+ |\w+ )?counters?\b/i, // "an additional counter", "5 additional counters"
  /\b(at|is) cost \d/i, // a set cost: "play this personnel at cost 1", "is cost 1" (#1737)
  /\bcost is [+\-−]\d/i, // "this personnel's cost is -1"
];

/**
 * Whether a game text changes a cost: one of its sentences matches a pattern and is not about a
 * dilemma's cost, which the dilemma spend reads and the counters do not. A text that only reads a
 * cost, "a dilemma that costs 1 or less" or "who has a cost of 4 or more", matches no pattern.
 */
export function changesCost(gametext: string): boolean {
  return gametext
    .split(/(?<=[.!?])\s+/)
    .some((s) => !/\bdilemma\b/i.test(s) && COST_PATTERNS.some((p) => p.test(s)));
}

export type CostCardRow = { name: string; type: string; gametext: string };

/** Whether a card is cost-affecting: not a dilemma, and its text changes a cost. */
export const isCostAffecting = (card: CostCardRow): boolean =>
  String(card.type).toLowerCase() !== 'dilemma' && changesCost(String(card.gametext ?? ''));

export type CostModelCoverage = { modelled: string[]; missing: string[] };

/**
 * The cost-affecting titles of `cards`, each once by `cardTitleOf`, split into those the registry
 * models and those it lacks, each sorted. A title of the registry counts as modelled even when its
 * text matches no pattern.
 */
export function costModelCoverage(
  cards: CostCardRow[],
  registry: ReadonlyMap<string, unknown> = COST_REGISTRY
): CostModelCoverage {
  const titles = new Set<string>();
  for (const c of cards) {
    const title = cardTitleOf(c.name);
    if (registry.has(title) || isCostAffecting(c)) titles.add(title);
  }
  const sorted = [...titles].sort((a, b) => a.localeCompare(b));
  return { modelled: sorted.filter((t) => registry.has(t)), missing: sorted.filter((t) => !registry.has(t)) };
}

/** "Cost models: 12 of 15 titles", "Cost models: all 6 titles", or null for no cost-affecting title. */
export function costModelCoverageText({ modelled, missing }: CostModelCoverage): string | null {
  const total = modelled.length + missing.length;
  if (total === 0) return null;
  const noun = total === 1 ? 'title' : 'titles';
  return missing.length === 0 ? `Cost models: all ${total} ${noun}` : `Cost models: ${modelled.length} of ${total} ${noun}`;
}

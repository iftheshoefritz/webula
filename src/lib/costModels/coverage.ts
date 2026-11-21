// The detection of the cost-changing titles (#1692): the backlog test reads it over the whole card
// data.

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

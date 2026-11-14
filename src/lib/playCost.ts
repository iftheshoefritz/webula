// The cost of a move on the practice table (#1606): in the play and draw segment a card played
// from the hand costs its printed cost in counters, and a draw from the draw deck costs 1. The
// classifier reads no card text, so a discount, a "place", a download and extra counters all
// charge the plain rule. It imports no React and no reducer: it takes a plain description of the
// move, so a later bot can ask it too.

// The segment of a turn, as `TurnSegment` in the practice table names it.
export type CostSegment = 'playAndDraw' | 'orders' | 'discard';

// The kind of a place a card can be: a flat zone of the table, the mission row, or one of the
// places on a mission or a ship.
export type CostPlace =
  | 'drawDeck'
  | 'hand'
  | 'discard'
  | 'core'
  | 'brig'
  | 'dilemmaPile'
  | 'dilemmaHand'
  | 'dilemmaStack'
  | 'botBrig'
  | 'missions'
  | 'shipRow'
  | 'crew'
  | 'awayTeam'
  | 'underMission'
  | 'on';

// What a move charged: a play of a card at its printed cost, or a draw at 1.
export type Charge = { kind: 'play'; cost: number } | { kind: 'draw'; cost: 1 };

// The places on the table a card is played to: a ship row, a ship's crew, a mission's away team,
// the core, and on another card.
const PLAY_PLACES: ReadonlySet<CostPlace> = new Set<CostPlace>(['shipRow', 'crew', 'awayTeam', 'core', 'on']);

// The printed cost of a card, the `Cost` column; an empty or missing cost is 0.
export const printedCost = (card: { cost?: unknown } | null | undefined): number => Number(card?.cost) || 0;

// The charge of a move of `card` from `from` to `to`, the place it landed, or null.
export function moveCharge(
  segment: CostSegment,
  from: CostPlace,
  to: CostPlace,
  card: { type?: unknown; cost?: unknown } | null | undefined
): Charge | null {
  if (segment !== 'playAndDraw' || from !== 'hand' || !PLAY_PLACES.has(to)) return null;
  if (String(card?.type ?? '').toLowerCase() === 'dilemma') return null;
  return { kind: 'play', cost: printedCost(card) };
}

// The charge of a draw from `from` into `to`: 1 for a draw from the draw deck into the hand.
export function drawCharge(segment: CostSegment, from: CostPlace, to: CostPlace): Charge | null {
  return segment === 'playAndDraw' && from === 'drawDeck' && to === 'hand' ? { kind: 'draw', cost: 1 } : null;
}

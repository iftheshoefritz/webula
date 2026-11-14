// The cost of a move on the practice table (#1606): in the play and draw segment a card played
// from the hand costs its printed cost in counters, and a draw from the draw deck costs 1. Before
// the printed cost the classifier asks the cost registry (#1654), whose model of the card's title
// may give its cost or a choice. A download only takes a card into the hand, and its later play
// costs what any play does. A card with neither takes the first pending discount of the turn whose test
// it passes (#1656). Every other discount, a "place" and extra counters charge the plain rule.
// It imports no React and no reducer: it takes a plain description of the move, so a later bot can
// ask it too.

import { cardDisplayName } from './cardCount';
import { CostFacts, CostSource } from './costModels/model';
import { costModelName, costModelOf } from './costModels/registry';

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

// What a move charged: a play of a card at its cost, with the source of a cost the table suggested,
// or a draw at 1.
export type Charge = { kind: 'play'; cost: number; source?: CostSource } | { kind: 'draw'; cost: 1 };

// The places on the table a card is played to: a ship row, a ship's crew, a mission's away team,
// the core, and on another card.
const PLAY_PLACES: ReadonlySet<CostPlace> = new Set<CostPlace>(['shipRow', 'crew', 'awayTeam', 'core', 'on']);

// The printed cost of a card, the `Cost` column; an empty or missing cost is 0.
export const printedCost = (card: { cost?: unknown } | null | undefined): number => Number(card?.cost) || 0;

// The charge of a move of `card` from `from` to `to`, the place it landed, or null. With `facts`, a
// card's model gives its cost or its choice; otherwise the
// first pending discount of `facts` that the card passes takes off its amount; otherwise it costs its
// printed cost. The cost never goes below 0. `id` is the card's instance id, so a model
// that reads the hand leaves the card itself out.
export function moveCharge(
  segment: CostSegment,
  from: CostPlace,
  to: CostPlace,
  card:
    | { type?: unknown; cost?: unknown; name?: unknown; originalName?: unknown; affiliation?: unknown; icons?: unknown }
    | null
    | undefined,
  facts?: CostFacts,
  id?: string
): Charge | null {
  if (segment !== 'playAndDraw' || from !== 'hand' || !PLAY_PLACES.has(to)) return null;
  const type = String(card?.type ?? '').toLowerCase();
  if (type === 'dilemma') return null;
  const printed = printedCost(card);
  const name = card ? String(cardDisplayName(card) ?? '') : '';
  const model = facts && name ? costModelOf(name) : undefined;
  const play = {
    id,
    type,
    printed,
    affiliation: String(card?.affiliation ?? '').toLowerCase(),
    icons: String(card?.icons ?? '').toLowerCase().match(/\[[a-z0-9]+\]/g) ?? [],
  };
  const suggested = model?.playCost && facts ? model.playCost(play, facts) : null;
  if (model && suggested) {
    const choice =
      suggested.choice?.cost !== undefined ? { ...suggested.choice, cost: Math.max(0, suggested.choice.cost) } : suggested.choice;
    return {
      kind: 'play',
      cost: Math.max(0, suggested.cost),
      source: { title: costModelName(model), reason: suggested.reason, ...(choice ? { choice } : {}) },
    };
  }
  const discount = facts?.pending?.find((d) => d.applies(play));
  if (discount) {
    return {
      kind: 'play',
      cost: Math.max(0, printed - discount.amount),
      source: { title: discount.title, reason: `−${discount.amount} on the ${discount.label}`, discount: discount.origin },
    };
  }
  return { kind: 'play', cost: printed };
}

// The charge of a draw from `from` into `to`: 1 for a draw from the draw deck into the hand.
export function drawCharge(segment: CostSegment, from: CostPlace, to: CostPlace): Charge | null {
  return segment === 'playAndDraw' && from === 'drawDeck' && to === 'hand' ? { kind: 'draw', cost: 1 } : null;
}

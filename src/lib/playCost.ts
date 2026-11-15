// The cost of a move on the practice table (#1606): in the play and draw segment a card played
// from the hand costs its printed cost in counters, and a draw from the draw deck costs 1. Before
// the printed cost the classifier asks the cost registry (#1654), whose model of the card's title
// may give its cost or a choice. A download only takes a card into the hand, and its later play
// costs what any play does. A card whose text lets it be played from the discard pile (#1698) costs
// what its model says from there, and every other move out of the discard pile is no play. A card with neither takes the first pending discount of the turn whose test
// it passes (#1656). Every other discount, a "place" and extra counters charge the plain rule.
// It imports no React and no reducer: it takes a plain description of the move, so a later bot can
// ask it too.

import { cardDisplayName } from './cardCount';
import { CostFacts, CostSource, CountedChoice, PendingDiscount } from './costModels/model';
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

// A counted choice from the printed cost `base` (#1695), its `max` clamped to the count where the cost
// reaches 0, so no step changes nothing.
const countedChoiceOf = (choice: CountedChoice, base: number): CountedChoice | undefined =>
  choice.step > 0
    ? { ...choice, base, max: Math.max(0, Math.min(choice.max, Math.ceil(base / choice.step))) }
    : undefined;

// The reason a pending discount gives: "−2 on the next [Fed][DS9] personnel".
const discountReason = (discount: PendingDiscount): string => `−${discount.amount} on the ${discount.label}`;

// A text field of a card row as a lowercased list, split on `separator`: "Temporal. Treaty." or
// "Android/Borg" (#1699).
const listOf = (value: unknown, separator: string): string[] =>
  String(value ?? '')
    .toLowerCase()
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);

// The charge of a move of `card` from `from` to `to`, the place it landed, or null. With `facts`, a
// card's model gives its cost or its choice, less the first pending discount of `facts` that the card
// passes, when one does (#1699); otherwise the
// first pending discount of `facts` that the card passes takes off its amount; otherwise it costs its
// printed cost. From the discard pile only the card's own model prices the play, with
// `discardPlayCost`, and with no answer the move is no play. The cost never goes below 0. `id` is the card's instance id, so a model
// that reads the hand leaves the card itself out.
export function moveCharge(
  segment: CostSegment,
  from: CostPlace,
  to: CostPlace,
  card:
    | {
        type?: unknown;
        cost?: unknown;
        name?: unknown;
        originalName?: unknown;
        affiliation?: unknown;
        icons?: unknown;
        keywords?: unknown;
        species?: unknown;
      }
    | null
    | undefined,
  facts?: CostFacts,
  id?: string
): Charge | null {
  if (segment !== 'playAndDraw' || (from !== 'hand' && from !== 'discard') || !PLAY_PLACES.has(to)) return null;
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
    keywords: listOf(card?.keywords, '.'),
    species: listOf(card?.species, '/'),
  };
  const discount = from === 'hand' ? facts?.pending?.find((d) => d.applies(play)) : undefined;
  const price = from === 'discard' ? model?.discardPlayCost : model?.playCost;
  const suggested = price && facts ? price(play, facts) : null;
  if (model && suggested) {
    // Cost changes stack (#1699): a pending discount that applies comes off the suggested cost and off
    // the choice's cost too.
    const off = discount?.amount ?? 0;
    const offered = suggested.choice;
    const choice =
      offered?.step !== undefined
        ? countedChoiceOf(offered, Math.max(0, printed - off))
        : offered?.cost !== undefined
          ? { ...offered, cost: Math.max(0, offered.cost - off) }
          : offered;
    const reason = discount ? `${suggested.reason}, and ${discount.title}: ${discountReason(discount)}` : suggested.reason;
    return {
      kind: 'play',
      cost: Math.max(0, suggested.cost - off),
      source: {
        title: costModelName(model),
        reason,
        ...(choice ? { choice } : {}),
        ...(discount ? { discount: discount.origin } : {}),
      },
    };
  }
  if (from === 'discard') return null;
  if (discount) {
    return {
      kind: 'play',
      cost: Math.max(0, printed - discount.amount),
      source: { title: discount.title, reason: discountReason(discount), discount: discount.origin },
    };
  }
  return { kind: 'play', cost: printed };
}

// The charge of a draw from `from` into `to`: 1 for a draw from the draw deck into the hand.
export function drawCharge(segment: CostSegment, from: CostPlace, to: CostPlace): Charge | null {
  return segment === 'playAndDraw' && from === 'drawDeck' && to === 'hand' ? { kind: 'draw', cost: 1 } : null;
}

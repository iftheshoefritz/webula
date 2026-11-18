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
import { cardTitleOf } from './cardTitle';
import { CostFacts, CostPlay, CostReveal, CostSource, CostUse, CountedChoice, PendingDiscount } from './costModels/model';
import { coreCostsOf, costModelName, costModelOf, costUsesOf, missionCostsOf } from './costModels/registry';

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
  | 'resolving'
  | 'missions'
  | 'shipRow'
  | 'crew'
  | 'awayTeam'
  | 'underMission'
  | 'on';

// What a move charged: a play of a card at its cost, with the source of a cost the table suggested,
// or a draw at 1. `uses` are the uses the cards on the table offer for the play (#1713), which do not
// change its cost until the player takes one. `reveal` are the cards of the opponent's dilemma pile the
// play reveals (#1738), which go to the bottom of that pile.
export type Charge =
  | { kind: 'play'; cost: number; source?: CostSource; uses?: CostUse[]; reveal?: CostReveal }
  | { kind: 'draw'; cost: 1 };

// The places on the table a card is played to: a ship row, a ship's crew, a mission's away team,
// the core, on another card, and the resolving zone of an event (#1727).
const PLAY_PLACES: ReadonlySet<CostPlace> = new Set<CostPlace>(['shipRow', 'crew', 'awayTeam', 'core', 'on', 'resolving']);

// Whether `card` is an event that resolves at once when played (#1727): an event whose text has no
// "Plays in …" or "Plays on …" clause, so it stays in no place. Every other card, an interrupt too, is not.
// The card data lowercases the text (`useDataFetching`), so the clause matches in any case (#1729).
export const resolvesOnPlay = (card: { type?: unknown; gametext?: unknown } | null | undefined): boolean =>
  String(card?.type ?? '').toLowerCase() === 'event' && !/\bplays (in|on)\b/i.test(String(card?.gametext ?? ''));

// Whether `card` is an event that removes itself from the game once it resolves (#1730): its text has the
// sentence "Remove this event from the game.", at the start of the text or after the end of another
// sentence. The card data lowercases the text, so the match ignores case and reads the sentence start
// instead: "you may remove this event…" and "At the start of your next turn, remove this event…" are a
// later choice or a condition of an event that stays in play, and do not count.
export const removesItselfFromGame = (card: { type?: unknown; gametext?: unknown } | null | undefined): boolean =>
  String(card?.type ?? '').toLowerCase() === 'event' &&
  /(?:^|[.!?)]\s*)remove this event from the game/i.test(String(card?.gametext ?? ''));

// Where a played card landed (#1702): the mission slot, and the ship whose crew it boards, or the slot
// whose mission card it is placed on (#1752).
export type CostDestination = Pick<CostPlay, 'missionIndex' | 'shipId' | 'onMissionIndex'>;

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

// The skills of a card row as lowercased words, the counts dropped: "2 Honor Programming" gives "honor"
// and "programming" (#1752).
export const skillWordsOf = (value: unknown): string[] =>
  String(value ?? '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

// The card of a charge, as `moveCharge` reads it.
type ChargedCard =
  | {
      type?: unknown;
      cost?: unknown;
      name?: unknown;
      originalName?: unknown;
      affiliation?: unknown;
      icons?: unknown;
      keywords?: unknown;
      species?: unknown;
      unique?: unknown;
      skills?: unknown;
      class?: unknown;
    }
  | null
  | undefined;

// The play a model prices: the card's traits, its instance id and where it landed.
const costPlayOf = (card: ChargedCard, id: string | undefined, destination: CostDestination): CostPlay => ({
  id,
  ...destination,
  type: String(card?.type ?? '').toLowerCase(),
  printed: printedCost(card),
  unique: String(card?.unique ?? '').toLowerCase() === 'y',
  affiliation: String(card?.affiliation ?? '').toLowerCase(),
  icons: String(card?.icons ?? '').toLowerCase().match(/\[[a-z0-9]+\]/g) ?? [],
  keywords: listOf(card?.keywords, '.'),
  species: listOf(card?.species, '/'),
  title: card ? cardTitleOf(String(cardDisplayName(card) ?? '')) : '',
  skills: skillWordsOf(card?.skills),
  shipClass: String(card?.class ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").trim(),
});

// The charge of a move of `card` from `from` to `to`, the place it landed, or null. With `facts`, a
// card's model gives its cost or its choice, less the first pending discount of `facts` that the card
// passes, when one does (#1699); otherwise the
// first pending discount of `facts` that the card passes takes off its amount; otherwise it costs its
// printed cost. From the discard pile only the card's own model prices the play, with
// `discardPlayCost`, and with no answer the move is no play. The cost never goes below 0. `id` is the card's instance id, so a model
// that reads the hand leaves the card itself out. `destination` is the mission slot and the ship the card
// landed in (#1702), and the cards of the core price the play from the hand too (`coreCostsOf`).
// The uses the cards on the table offer for a play from the hand (#1713) join its charge. They change
// no cost until the player takes one.
export function moveCharge(
  segment: CostSegment,
  from: CostPlace,
  to: CostPlace,
  card: ChargedCard,
  facts?: CostFacts,
  id?: string,
  destination: CostDestination = {}
): Charge | null {
  const charge = baseCharge(segment, from, to, card, facts, id, destination);
  if (charge?.kind !== 'play' || from !== 'hand' || !facts) return charge;
  const uses = costUsesOf(costPlayOf(card, id, destination), facts);
  return uses.length ? { ...charge, uses } : charge;
}

function baseCharge(
  segment: CostSegment,
  from: CostPlace,
  to: CostPlace,
  card: ChargedCard,
  facts?: CostFacts,
  id?: string,
  destination: CostDestination = {}
): Charge | null {
  if (segment !== 'playAndDraw' || (from !== 'hand' && from !== 'discard') || !PLAY_PLACES.has(to)) return null;
  const type = String(card?.type ?? '').toLowerCase();
  if (type === 'dilemma') return null;
  const printed = printedCost(card);
  const name = card ? String(cardDisplayName(card) ?? '') : '';
  const model = facts && name ? costModelOf(name) : undefined;
  const play = costPlayOf(card, id, destination);
  const discount = from === 'hand' ? facts?.pending?.find((d) => d.applies(play)) : undefined;
  const price = from === 'discard' ? model?.discardPlayCost : model?.playCost;
  const suggested = price && facts ? price(play, facts) : null;
  // Cost changes stack (#1699, #1702): the card's own model, then each card of the core that prices its
  // play from the hand, then each mission of the player's that does (#1752), then a pending discount, every change summed. The charge keeps one source, whose
  // title joins the names of the models and whose reason joins their reasons.
  const parts = [
    ...(model && suggested ? [{ title: costModelName(model), cost: suggested }] : []),
    ...(from === 'hand' && facts ? coreCostsOf(play, facts) : []),
    ...(from === 'hand' && facts ? missionCostsOf(play, facts) : []),
  ];
  if (parts.length > 0) {
    const off = discount?.amount ?? 0;
    const deltas = parts.map((p) => p.cost.cost - printed);
    const total = deltas.reduce((a, b) => a + b, 0) - off;
    // At most one choice, the first part's that offers one; the other changes shift its cost too.
    const chooser = parts.findIndex((p) => p.cost.choice);
    const offered = chooser >= 0 ? parts[chooser].cost.choice : undefined;
    const shift = total - (chooser >= 0 ? deltas[chooser] : 0);
    const choice =
      offered?.step !== undefined
        ? countedChoiceOf(offered, Math.max(0, printed + shift))
        : offered?.cost !== undefined
          ? { ...offered, cost: Math.max(0, offered.cost + shift) }
          : offered;
    const named = parts.length === 1 ? parts[0].cost.reason : parts.map((p) => `${p.title}: ${p.cost.reason}`).join('; ');
    const reason = discount ? `${named}, and ${discount.title}: ${discountReason(discount)}` : named;
    // Only the card's own model reveals, on its play from the hand (#1738).
    const reveal = from === 'hand' && model && suggested?.reveal?.ids.length ? suggested.reveal : undefined;
    return {
      kind: 'play',
      ...(reveal ? { reveal } : {}),
      cost: Math.max(0, printed + total),
      source: {
        title: parts.map((p) => p.title).join(', '),
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

// The resolve models of the practice table (#1739): what the table automates of the text of an event while
// it resolves in the resolving zone (#1727). One model per title, in the style of the cost registry
// (`src/lib/costModels/`). A model gives the steps of the resolution, of one of two kinds:
// - `'drawThenBottom'`: a free draw, of the cost of one of the player's personnel or of a fixed number, and
//   then a number of cards of the hand to put on the bottom of the draw deck, in the player's order.
// - `'discardDraw'` (#1745): one step, a card of the hand discarded to draw a number of cards free. With an
//   empty hand nothing is discarded and nothing is drawn: the discard is the cost of the draw.
// An event with no model resolves by hand, as before.
//
// It imports no React and no reducer.

import { cardTitleOf } from '../cardTitle';

/** The draw of a resolution: as many cards as the printed cost of a personnel the player chooses, or a fixed number. */
export type ResolveDraw = { kind: 'personnelCost' } | { kind: 'fixed'; count: number };

export interface DrawThenBottomModel {
  kind: 'drawThenBottom';
  /** The title of the event, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  draw: ResolveDraw;
  /** The cards of the hand the player puts on the bottom of the draw deck after the draw. */
  bottomFromHand: number;
}

/** "Discard a card from hand to draw two cards" (#1745). */
export interface DiscardDrawModel {
  kind: 'discardDraw';
  title: string;
  /** The cards drawn. */
  draw: number;
  /** The cards drawn instead while the player commands no completed mission (Downfallen Civilization). */
  drawWithoutCompleted?: number;
}

export type ResolveModel = DrawThenBottomModel | DiscardDrawModel;

/** The cards a `'discardDraw'` model draws, by whether the player commands a completed mission. */
export const discardDrawCount = (model: DiscardDrawModel, anyCompleted: boolean): number =>
  !anyCompleted && model.drawWithoutCompleted !== undefined ? model.drawWithoutCompleted : model.draw;

export const RESOLVE_MODELS: ResolveModel[] = [
  // "Draw a number of cards equal to the cost of one of your personnel, then place three cards from hand
  // on the bottom of your deck in any order. Destroy this event."
  { kind: 'drawThenBottom', title: 'These Are The Voyages', draw: { kind: 'personnelCost' }, bottomFromHand: 3 },
  // "Draw four cards, then place three cards from hand on the bottom of your deck. Destroy this event."
  { kind: 'drawThenBottom', title: 'Miracle Working', draw: { kind: 'fixed', count: 4 }, bottomFromHand: 3 },
  // The four events below each have a condition of play, which the table does not check (#1745).
  // "To play this event, you must command a [Baj] Anthropology personnel. Discard a card from hand to draw
  // two cards. Destroy this event."
  { kind: 'discardDraw', title: 'Days of Atonement', draw: 2 },
  // "To play this event, you must command a [Kli] Honor personnel. Discard a card from hand to draw two
  // cards. Destroy this event."
  { kind: 'discardDraw', title: "Order of the Bat'leth", draw: 2 },
  // "To play this event, you must command three [SF] personnel. Discard a card from hand to draw two cards.
  // Destroy this event."
  { kind: 'discardDraw', title: "That's the Last Time", draw: 2 },
  // "To play this event, you must command a Medical Vidiian. Discard a card from hand to draw two cards (or
  // draw three cards if you do not command a completed mission). Destroy this event."
  { kind: 'discardDraw', title: 'Downfallen Civilization', draw: 2, drawWithoutCompleted: 3 },
];

const BY_TITLE = new Map(RESOLVE_MODELS.map((m) => [m.title.toLowerCase(), m]));

/** The resolve model of the card named `name`, by its title, or undefined. */
export const resolveModelOf = (name: string): ResolveModel | undefined => BY_TITLE.get(cardTitleOf(name).toLowerCase());

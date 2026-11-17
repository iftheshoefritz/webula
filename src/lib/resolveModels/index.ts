// The resolve models of the practice table (#1739): what the table automates of the text of an event while
// it resolves in the resolving zone (#1727). One model per title, in the style of the cost registry
// (`src/lib/costModels/`). A model gives the steps of the resolution: a free draw, of the cost of one of
// the player's personnel or of a fixed number, and then a number of cards of the hand to put on the bottom
// of the draw deck, in the player's order. An event with no model resolves by hand, as before.
//
// It imports no React and no reducer.

import { cardTitleOf } from '../cardTitle';

/** The draw of a resolution: as many cards as the printed cost of a personnel the player chooses, or a fixed number. */
export type ResolveDraw = { kind: 'personnelCost' } | { kind: 'fixed'; count: number };

export interface ResolveModel {
  /** The title of the event, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  draw: ResolveDraw;
  /** The cards of the hand the player puts on the bottom of the draw deck after the draw. */
  bottomFromHand: number;
}

export const RESOLVE_MODELS: ResolveModel[] = [
  // "Draw a number of cards equal to the cost of one of your personnel, then place three cards from hand
  // on the bottom of your deck in any order. Destroy this event."
  { title: 'These Are The Voyages', draw: { kind: 'personnelCost' }, bottomFromHand: 3 },
  // "Draw four cards, then place three cards from hand on the bottom of your deck. Destroy this event."
  { title: 'Miracle Working', draw: { kind: 'fixed', count: 4 }, bottomFromHand: 3 },
];

const BY_TITLE = new Map(RESOLVE_MODELS.map((m) => [m.title.toLowerCase(), m]));

/** The resolve model of the card named `name`, by its title, or undefined. */
export const resolveModelOf = (name: string): ResolveModel | undefined => BY_TITLE.get(cardTitleOf(name).toLowerCase());

// The resolve models of the practice table (#1739): what the table automates of the text of an event while
// it resolves in the resolving zone (#1727). One model per title, in the style of the cost registry
// (`src/lib/costModels/`). A model is a list of effect steps (#1863, `src/lib/effectSteps.ts`), each stage of
// which is one step of the resolution, and the event goes to the discard pile after the last:
// - These Are The Voyages and Miracle Working: a free draw, of the cost of one of the player's personnel or of
//   a fixed number, then cards of the hand to the bottom of the draw deck, in the player's order.
// - The "discard a card from hand to draw" events (#1745): `[discardFromHand(1), draw(2)]`, one stage. With an
//   empty hand nothing is discarded and nothing is drawn: the discard is the cost of the draw.
// - Second Edition (#1746): a copy of a personnel the player commands downloaded, the deck shuffled, and a draw
//   when that personnel has an icon, one stage.
// - Vidiian Organ Bank (#1765) and The Crossing (#1826): an exchange.
// An event with no model resolves by hand, as before.
//
// It imports no React and no reducer.

import { cardTitleOf } from '../cardTitle';
import { bottomFromHand, draw, drawIfPickedIcon, drawPersonnelCost, discardFromHand, EffectStage, EffectStep, shuffle, stagesOf } from '../effectSteps';

export interface ResolveModel {
  /** The title of the event, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  steps: EffectStep[];
}

/** The stages of a resolve model, in order (#1863). */
export const resolveStagesOf = (model: ResolveModel): EffectStage[] => stagesOf(model.steps);

export const RESOLVE_MODELS: ResolveModel[] = [
  // "Draw a number of cards equal to the cost of one of your personnel, then place three cards from hand
  // on the bottom of your deck in any order. Destroy this event."
  { title: 'These Are The Voyages', steps: [drawPersonnelCost(), bottomFromHand(3)] },
  // "Draw four cards, then place three cards from hand on the bottom of your deck. Destroy this event."
  { title: 'Miracle Working', steps: [draw(4), bottomFromHand(3)] },
  // The four events below each have a condition of play, which the table does not check (#1745).
  // "To play this event, you must command a [Baj] Anthropology personnel. Discard a card from hand to draw
  // two cards. Destroy this event."
  { title: 'Days of Atonement', steps: [discardFromHand(1), draw(2)] },
  // "To play this event, you must command a [Kli] Honor personnel. Discard a card from hand to draw two
  // cards. Destroy this event."
  { title: "Order of the Bat'leth", steps: [discardFromHand(1), draw(2)] },
  // "To play this event, you must command three [SF] personnel. Discard a card from hand to draw two cards.
  // Destroy this event."
  { title: "That's the Last Time", steps: [discardFromHand(1), draw(2)] },
  // "To play this event, you must command a Medical Vidiian. Discard a card from hand to draw two cards (or
  // draw three cards if you do not command a completed mission). Destroy this event."
  { title: 'Downfallen Civilization', steps: [discardFromHand(1), draw(2, { withoutCompleted: 3 })] },
  // "Download a copy of a personnel you command. If that personnel is an [AU] personnel, draw a card.
  // Destroy this event." A copy is a card of the same title; the brig is not commanded.
  {
    title: 'Second Edition',
    steps: [{ kind: 'download', of: { kind: 'copyOfCommanded' }, upTo: 1, to: { kind: 'hand' } }, shuffle(), drawIfPickedIcon('[au]', 1)],
  },
  { title: 'Vidiian Organ Bank', steps: [{ kind: 'exchange', affiliation: 'vidiian', replacedTo: 'hand' }] },
  // "To play this event, you must command three [SF] personnel or three [Xin] personnel. Replace one of your
  // personnel with a personnel of the same affiliation from your hand. Place the personnel you replaced in
  // your discard pile. Destroy this event." (#1826) The condition of play is not checked.
  { title: 'The Crossing', steps: [{ kind: 'exchange', replacedTo: 'discard' }] },
];

const BY_TITLE = new Map(RESOLVE_MODELS.map((m) => [m.title.toLowerCase(), m]));

/** The resolve model of the card named `name`, by its title, or undefined. */
export const resolveModelOf = (name: string): ResolveModel | undefined => BY_TITLE.get(cardTitleOf(name).toLowerCase());

// The order models of the practice table (#1866): what the table automates of an "Order - …" clause, an action
// the player takes in the orders segment from a card of theirs on the table. One row per order, by whole title
// (`cardTitleOf`), so a card with several orders (Optimism) has a row for each one modelled, `index` its place
// among the card's orders. A row is the order's text, a cost (what the text puts before "to"), a condition, a
// limit and a list of effect steps (`src/lib/effectSteps.ts`, #1863).
//
// The costs of today:
// - `none`: "Order - Place a card from hand on the bottom of your deck."
// - `discardFromHand`: N cards of the hand that pass a test, "Discard a [Car] ship from hand".
// - `stopPersonnel`: one of the player's unstopped personnel that passes a test, "Stop one of your [Fer] personnel";
//   with `present`, only one in the order card's own group, "Stop one of your personnel present" (#1960).
// - `placeThisOnBottom`: the card itself to the bottom of the draw deck, "Place this personnel on the bottom of his
//   owner's deck".
// - `placePresentOnBottom`: one card of a type in the card's own group (its away team or crew), "Place your
//   equipment present on the bottom of its owner's deck".
// - `placeFromDiscardOnThis`: one card of the discard pile that passes a test, placed on the order's own card,
//   "Place a personnel from your discard pile on this event" (#1837).
// - `placeFromHandOnThis`: one card of the hand that passes a test, placed on the ability's own card, "place a [Fed]
//   card from hand on this event" (#1957). The card comes from outside play, so it is not in play (#1943).
// An attempt ability's row (`src/lib/attemptAbilities/`) may carry a cost of this same type, paid the same way.
// Next, for the orders still in the backlog: stop this card, destroy this card, lose points, return this card to
// hand, and the choice of one of several effects.
//
// The condition is shown and never enforced. An order with a `limit` (#1834) is not offered again that turn once
// used that many times.
//
// It imports no React and no reducer.

import { cardTitleOf } from '../cardTitle';
import { bottomFromHand, chooseSkill, discardFromHand, download, draw, DownloadTest, drawUpTo, EffectStage, EffectStep, shuffle, stagesOf } from '../effectSteps';
import type { PlayCondition } from '../playModels';
import { ONCE_EACH_TURN, UseLimit } from '../useLimit';

export type OrderCost =
  | { kind: 'none' }
  | { kind: 'discardFromHand'; count: number; test?: DownloadTest[]; text: string }
  | { kind: 'stopPersonnel'; test: DownloadTest[]; text: string; present?: true }
  | { kind: 'placeThisOnBottom' }
  | { kind: 'placePresentOnBottom'; types: string[]; text: string }
  | { kind: 'placeFromDiscardOnThis'; test: DownloadTest[]; text: string }
  | { kind: 'placeFromHandOnThis'; test: DownloadTest[]; text: string };

export type OrderCostKind = OrderCost['kind'];

/** An order: the card's title, its place among the card's orders, its text, cost, condition, limit and steps. */
export interface OrderModel {
  /** The title of the card, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  /** Which "Order - " clause of the card's text this is, from 0. */
  index: number;
  /** The order's text, for the panel, without "Order - ". */
  text: string;
  cost: OrderCost;
  condition?: PlayCondition;
  /** "You may do this only once each turn": at most `times` uses each turn (#1834). */
  limit?: UseLimit;
  steps: EffectStep[];
}

const NONE: OrderCost = { kind: 'none' };

export const ORDER_MODELS: OrderModel[] = [
  // "Order - Discard a [Car] ship from hand to draw three cards. You may do this only once each turn."
  {
    title: 'Damar Ambitious Glinn',
    index: 0,
    text: 'Discard a [Car] ship from hand to draw three cards. You may do this only once each turn.',
    cost: { kind: 'discardFromHand', count: 1, test: [{ types: ['ship'], affiliations: ['cardassian'] }], text: 'a [Car] ship' },
    limit: ONCE_EACH_TURN,
    steps: [draw(3)],
  },
  // "Order - Discard a card from hand to download a [Voy] ship. You may do this only once each turn."
  {
    title: 'Finding Our Way',
    index: 0,
    text: 'Discard a card from hand to download a [Voy] ship. You may do this only once each turn.',
    cost: { kind: 'discardFromHand', count: 1, text: 'a card' },
    limit: ONCE_EACH_TURN,
    steps: [download(1, 'a [Voy] ship', [{ types: ['ship'], icons: ['[voy]'] }]), shuffle()],
  },
  // "Order - Place this personnel on the bottom of his owner's deck to download two unique [Bor] personnel."
  {
    title: 'Four of Nine Heuristics Drone',
    index: 0,
    text: "Place this personnel on the bottom of his owner's deck to download two unique [Bor] personnel.",
    cost: { kind: 'placeThisOnBottom' },
    steps: [download(2, 'two unique [Bor] personnel', [{ types: ['personnel'], affiliations: ['borg'], unique: true }]), shuffle()],
  },
  // "Order - Draw a card and then discard a card from hand. You may do this only once each turn."
  {
    title: 'Indebtedness',
    index: 0,
    text: 'Draw a card and then discard a card from hand. You may do this only once each turn.',
    cost: NONE,
    limit: ONCE_EACH_TURN,
    steps: [draw(1), discardFromHand(1)],
  },
  // "Order - Discard a [SF] ship from hand to draw up to two cards. You may do this only once each turn."
  {
    title: 'Henry Archer Trailblazing Engineer',
    index: 0,
    text: 'Discard a [SF] ship from hand to draw up to two cards. You may do this only once each turn.',
    cost: { kind: 'discardFromHand', count: 1, test: [{ types: ['ship'], affiliations: ['starfleet'] }], text: 'a [SF] ship' },
    limit: ONCE_EACH_TURN,
    steps: [drawUpTo(2, false)],
  },
  // "Order - Stop one of your [Fer] personnel to draw a card."
  {
    title: 'Rule of Acquisition #6',
    index: 0,
    text: 'Stop one of your [Fer] personnel to draw a card.',
    cost: { kind: 'stopPersonnel', test: [{ types: ['personnel'], affiliations: ['ferengi'] }], text: 'one of your [Fer] personnel' },
    steps: [draw(1)],
  },
  // "Order - Place your equipment present on the bottom of its owner's deck to draw two cards. You may do this
  // only once each turn."
  {
    title: 'Charles Tucker III Horse Trader',
    index: 0,
    text: "Place your equipment present on the bottom of its owner's deck to draw two cards. You may do this only once each turn.",
    cost: { kind: 'placePresentOnBottom', types: ['equipment'], text: 'your equipment present' },
    limit: ONCE_EACH_TURN,
    steps: [draw(2)],
  },
  // "Order - Place a card from hand on the bottom of your deck."
  {
    title: 'Starship Defiant Ripe for the Taking',
    index: 0,
    text: 'Place a card from hand on the bottom of your deck.',
    cost: NONE,
    steps: [bottomFromHand(1)],
  },
  // "Order - Place a personnel from your discard pile on this event to add one of their skills (except Acquisition,
  // Intelligence, Law, or Telepathy) to the requirements of each mission in play. This effect lasts until you lose
  // command of this event or this order is executed again." (#1837) The choice is kept on the event; the requirement
  // change is its row in `requirementRules.ts`.
  {
    title: 'Renewal Scroll',
    index: 0,
    text:
      'Place a personnel from your discard pile on this event to add one of their skills (except Acquisition, Intelligence, Law, or Telepathy) to the requirements of each mission in play. This effect lasts until you lose command of this event or this order is executed again.',
    cost: { kind: 'placeFromDiscardOnThis', test: [{ types: ['personnel'] }], text: 'a personnel from your discard pile' },
    steps: [chooseSkill(['Acquisition', 'Intelligence', 'Law', 'Telepathy'])],
  },
  // Optimism's first order of three: "Order - Place a card from hand on the bottom of your deck."
  {
    title: 'Optimism',
    index: 0,
    text: 'Place a card from hand on the bottom of your deck.',
    cost: NONE,
    steps: [bottomFromHand(1)],
  },
  // "Order - Discard a card titled {The Doctor} or Revised Doctor from hand to download an interrupt." (#1960) The
  // title test matches a persona by prefix, so "The Doctor Emergency Medical Hologram" passes "the doctor".
  {
    title: 'Revised Doctor Mass Murderer',
    index: 0,
    text: 'Discard a card titled {The Doctor} or Revised Doctor from hand to download an interrupt.',
    cost: { kind: 'discardFromHand', count: 1, test: [{ titles: ['the doctor', 'revised doctor'] }], text: 'a card titled {The Doctor} or Revised Doctor' },
    steps: [download(1, 'an interrupt', [{ types: ['interrupt'] }]), shuffle()],
  },
  // "Order - Discard a Decay event from hand to download an non-Decay event or interrupt. You may do this only once
  // each turn." (#1960) The card data writes the keyword "Decay: 3.", which `downloadTakes` reads as "decay".
  {
    title: 'Stewart Rivers Patriotic Engineer',
    index: 0,
    text: 'Discard a Decay event from hand to download an non-Decay event or interrupt. You may do this only once each turn.',
    cost: { kind: 'discardFromHand', count: 1, test: [{ types: ['event'], keywords: ['decay'] }], text: 'a Decay event' },
    limit: ONCE_EACH_TURN,
    steps: [download(1, 'a non-Decay event or interrupt', [{ types: ['event', 'interrupt'], notKeywords: ['decay'] }]), shuffle()],
  },
  // "Order - Stop one of your personnel present to draw a card." (#1960) Present: in her away team or crew, she too.
  {
    title: 'Anij Guiding Light',
    index: 0,
    text: 'Stop one of your personnel present to draw a card.',
    cost: { kind: 'stopPersonnel', test: [{ types: ['personnel'] }], text: 'one of your personnel present', present: true },
    steps: [draw(1)],
  },
];

const BY_TITLE = new Map<string, OrderModel[]>();
for (const m of ORDER_MODELS) {
  const key = m.title.toLowerCase();
  BY_TITLE.set(key, [...(BY_TITLE.get(key) ?? []), m]);
}

/** The orders of a card, by its name or title, in the order of its text. */
export const orderModelsOf = (name: string): OrderModel[] => BY_TITLE.get(cardTitleOf(name).toLowerCase()) ?? [];

/** The order `index` of a card, or undefined. */
export const orderModelOf = (name: string, index: number): OrderModel | undefined => orderModelsOf(name).find((m) => m.index === index);

/** The stages of an order's steps. */
export const orderStagesOf = (model: OrderModel): EffectStage[] => stagesOf(model.steps);

/** Whether the cost asks the player for cards: a discard, a personnel to stop, a card present to place. */
export const costNeedsPick = (cost: OrderCost): boolean =>
  cost.kind === 'discardFromHand' ||
  cost.kind === 'stopPersonnel' ||
  cost.kind === 'placePresentOnBottom' ||
  cost.kind === 'placeFromDiscardOnThis' ||
  cost.kind === 'placeFromHandOnThis';

/** How many cards the cost's pick takes. */
export const costPickCount = (cost: OrderCost): number => (cost.kind === 'discardFromHand' ? cost.count : costNeedsPick(cost) ? 1 : 0);

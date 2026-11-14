// The cost models of the practice table (#1654): what the table reads of a card's text that changes
// what its play costs. A model reads a plain description of the table that the page builds
// (`CostFacts`), never `TableState`, and imports no React and no reducer, so a later bot can ask it
// too. A model only counts: it moves no card and refuses nothing.

import type { PartnerTraits } from '../dilemmaBot/gains';

/**
 * The shape of the text a model reads. `'ownCost'`: a card that changes its own cost. `'limit'`: a card
 * that adds to the counters the player may spend this turn (#1655). `'pendingDiscount'`: a card whose
 * play makes a later card of this turn cheaper (#1656).
 */
export type CostFamily = 'ownCost' | 'limit' | 'pendingDiscount';

/** A card of the hand, as a model reads it: its instance id, its title (`cardTitleOf`) and its type, lowercased. */
export interface CostHandCard {
  id: string;
  title: string;
  type: string;
}

/** What the models read of the table, as it stands before the move. */
export interface CostFacts {
  /** The printed traits of each personnel the player commands: every away team and every crew, never the brig. */
  commanded: PartnerTraits[];
  /** The titles of the cards in the core. */
  core: string[];
  hand: CostHandCard[];
  /**
   * The display names of the cards downloaded this turn that no play of that name, nor a move back to
   * the draw deck, has ended yet (`downloadedThisTurn`), one per card.
   */
  downloaded: string[];
  /** The pending discounts of the turn, oldest first (`pendingDiscountsOf` in `gameLog.ts`, #1656). */
  pending?: PendingDiscount[];
}

/**
 * The card a model prices: its instance id, its type, its affiliation and its icons, lowercased ("[ds9]"),
 * and its printed cost.
 */
export interface CostPlay {
  id?: string;
  type: string;
  printed: number;
  affiliation?: string;
  icons?: string[];
}

/** The charge of the play that made a pending discount (#1656), as a `ChargeTarget` of the log names it. */
export interface DiscountOrigin {
  entry: number;
  move?: number;
  card?: number;
}

/**
 * A discount that waits for a later play of this turn (#1656): the model's name, what it discounts
 * ("next [Fed][DS9] personnel"), the counters it takes off, the play that made it, and the test of the
 * card it discounts.
 */
export interface PendingDiscount {
  title: string;
  label: string;
  amount: number;
  origin: DiscountOrigin;
  applies: (play: CostPlay) => boolean;
}

/**
 * A "may" the chip offers beside the printed cost: its label and the cost it sets, or the counters it
 * adds to the turn's limit (#1655).
 */
export type CostChoice = { label: string; cost: number; limit?: undefined } | { label: string; limit: number; cost?: undefined };

/** A grant to the turn's limit while the table holds its condition (#1655): the model's title, the counters and why. */
export interface LimitGrant {
  title: string;
  amount: number;
  reason: string;
}

/** Where a suggested cost came from: the model's title, or "Downloaded", a short reason, and its choice. */
export interface CostSource {
  title: string;
  reason: string;
  choice?: CostChoice;
  /** The play whose pending discount this cost used (#1656). */
  discount?: DiscountOrigin;
}

/** The answer of a model: the cost it suggests, with its reason, and a choice when the text says "may". */
export interface ModelCost {
  cost: number;
  reason: string;
  choice?: CostChoice;
}

export interface CostModel {
  /** The title of the card, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  /** The name the chip, the list and the log show, when it is not the title: "Tricia Jenkins". */
  label?: string;
  family: CostFamily;
  /** The cost of the card's own play, or null when the text changes nothing on this table. */
  playCost?: (play: CostPlay, facts: CostFacts) => ModelCost | null;
  /** The counters the card adds to the turn's limit while the table stands as `facts` say, or null (#1655). */
  limitGrant?: (facts: CostFacts) => { amount: number; reason: string } | null;
  /**
   * The discount the card's own play leaves for the first later play of this turn whose card passes
   * `applies` (#1656): its label, "next [Fed][DS9] personnel", and the counters it takes off.
   */
  pendingDiscount?: { label: string; amount: number; applies: (play: CostPlay) => boolean };
}

/** The source of a downloaded card's play. */
export const DOWNLOADED_SOURCE: CostSource = { title: 'Downloaded', reason: 'downloaded this turn' };

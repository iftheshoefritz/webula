// The cost models of the practice table (#1654): what the table reads of a card's text that changes
// what its play costs. A model reads a plain description of the table that the page builds
// (`CostFacts`), never `TableState`, and imports no React and no reducer, so a later bot can ask it
// too. A model only counts: it moves no card and refuses nothing.

import type { PartnerTraits } from '../dilemmaBot/gains';

/**
 * The shape of the text a model reads. `'ownCost'`: a card that changes its own cost. `'limit'`: a card
 * that adds to the counters the player may spend this turn (#1655). `'pendingDiscount'`: a card whose
 * play makes a later card of this turn cheaper (#1656). `'standingRule'`: a card of the core whose text prices
 * the play of another card while it stands there (#1703).
 */
export type CostFamily = 'ownCost' | 'limit' | 'pendingDiscount' | 'standingRule';

/** A card of the hand, as a model reads it: its instance id, its title (`cardTitleOf`) and its type, lowercased. */
export interface CostHandCard {
  id: string;
  title: string;
  type: string;
}

/** A personnel the player commands, as a model reads it: its printed traits and whether it is unique (#1693). */
export interface CommandedTraits extends PartnerTraits {
  unique?: boolean;
}

/**
 * A mission slot of the player, as a model reads it (#1694): whether it is completed, the mission's name,
 * its requirement text, its printed points, its type (`p`, `s` or `h`), its affiliation icons ("[baj]"),
 * its quadrant and the number of dilemmas beneath it, all lowercased but the name. An empty slot reads as
 * not completed, with an empty requirement and an empty type. An affiliation field that is a sentence,
 * "Any affiliation (except [Kli]) may attempt this mission.", gives no icons (#1696).
 */
export interface CostMission {
  completed: boolean;
  name: string;
  requirements: string;
  points: number;
  type: string;
  icons: string[];
  quadrant: string;
  dilemmasUnder: number;
  /** The regions of the mission's keywords, lowercased: "Region: Delphic Expanse." gives "delphic expanse" (#1696). */
  regions?: string[];
  /**
   * The personnel at the slot (#1702): its away team and the crew of each ship of its ship row, stopped
   * personnel too, never the brig. Absent is none.
   */
  personnel?: CommandedTraits[];
  /** The ships of the slot's ship row (#1702). Absent is none. */
  ships?: CostShip[];
}

/** A ship of a mission slot (#1702): its instance id, its title (`cardTitleOf`), and its affiliation and icons, lowercased. */
export interface CostShip {
  id: string;
  title: string;
  affiliation: string;
  icons: string[];
}

/** What the models read of the table, as it stands before the move. */
export interface CostFacts {
  /**
   * The printed traits of each personnel the player commands: every away team and every crew, never the
   * brig, with its uniqueness.
   */
  commanded: CommandedTraits[];
  /** The titles of the cards in the core. */
  core: string[];
  /** The cards of the core, in the order of `core`, with their type, keywords and printed cost (#1704). Absent is none. */
  coreCards?: CostCoreCard[];
  hand: CostHandCard[];
  /** The discard pile by title and type, the cards removed from the game left out (#1700). Absent is empty. */
  discard?: CostHandCard[];
  /** The titles of the ships the player commands, those of every mission's ship row (#1700). Absent is none. */
  ships?: string[];
  /** The player's score (#1700). Absent is 0. */
  score?: number;
  /** The player's mission slots, one entry per slot, in slot order (#1694). */
  missions?: CostMission[];
  /** The pending discounts of the turn, oldest first (`pendingDiscountsOf` in `gameLog.ts`, #1656). */
  pending?: PendingDiscount[];
  /** The number of cards placed on each card of the core, in the order of `core` (#1703). Absent is none. */
  corePlaced?: number[];
  /**
   * The cards played earlier this turn, oldest first, whatever they cost (`turnPlaysOf` in `gameLog.ts`,
   * #1703), for "the first … each turn". Absent is none.
   */
  plays?: CostTurnPlay[];
}

/** A card of the core (#1704): its title (`cardTitleOf`), its type and keywords, lowercased, and its printed cost. */
export interface CostCoreCard {
  title: string;
  type: string;
  keywords: string[];
  cost: number;
}

/**
 * A card played earlier this turn (#1703), by the traits a standing rule tests: its type, whether it is
 * unique, and its icons, lowercased. A play the log recorded no traits of, from before #1703, has the type
 * `''` and passes no test.
 */
export interface CostTurnPlay {
  type: string;
  unique: boolean;
  icons: string[];
}

/**
 * The card a model prices: its instance id, its type, its affiliation and its icons, lowercased ("[ds9]"),
 * its keywords and its species, lowercased ("temporal", "android", #1699), and its printed cost. Where it
 * lands (#1702): the mission slot, and the instance id of the ship whose crew it boards. Absent is
 * neither, as for a play to the core.
 */
export interface CostPlay {
  id?: string;
  /** Whether the card is unique, the `Unique` column (#1703). */
  unique?: boolean;
  missionIndex?: number;
  shipId?: string;
  type: string;
  printed: number;
  affiliation?: string;
  icons?: string[];
  keywords?: string[];
  species?: string[];
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
 * adds to the turn's limit (#1655), or a count (#1695): the label of what is counted, the counters each
 * one takes off, the largest count, and the printed cost it counts from (`moveCharge` fills `base`). A
 * count `n` sets the cost to `max(0, base − step·n)`.
 */
export type CostChoice =
  | { label: string; cost: number; limit?: undefined; step?: undefined }
  | { label: string; limit: number; cost?: undefined; step?: undefined }
  | CountedChoice;

/** A choice of a count (#1695): "Completed missions of the opponent", −2 each, at most 2, from 4. */
export interface CountedChoice {
  label: string;
  step: number;
  max: number;
  base?: number;
  cost?: undefined;
  limit?: undefined;
}

/** Whether `choice` is a well-formed counted choice with its base, so a malformed save reads as no choice. */
export const isCountedChoice = (choice: unknown): choice is CountedChoice & { base: number } => {
  const c = choice as CountedChoice | null | undefined;
  return (
    !!c &&
    typeof c.label === 'string' &&
    [c.step, c.max, c.base].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    c.step > 0 &&
    c.max >= 0
  );
};

/** The cost a count `n` of a counted choice sets, never below 0. */
export const countedCost = (choice: CountedChoice & { base: number }, n: number): number => Math.max(0, choice.base - choice.step * n);

/** A grant to the turn's limit while the table holds its condition (#1655): the model's title, the counters and why. */
export interface LimitGrant {
  title: string;
  amount: number;
  reason: string;
}

/** A cap on the turn's limit while the table holds its condition (#1704): the model's title, the cap and why. */
export interface LimitCap {
  title: string;
  amount: number;
  reason: string;
}

/**
 * A choice of the turn that raises its limit (#1704), for a text that acts at the start of the turn: the
 * model's title, the label and the counters it adds. One choice of a model is taken a turn.
 */
export interface TurnLimitChoice {
  title: string;
  label: string;
  limit: number;
}

/** Where a suggested cost came from: the model's title, a short reason, and its choice. */
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
  /** The cost of the card's own play from the hand, or null when the text changes nothing on this table. */
  playCost?: (play: CostPlay, facts: CostFacts) => ModelCost | null;
  /**
   * The cost of a play of the card from the discard pile, which only its own text allows (#1698), or null.
   * A card with none is not played from the discard pile: the move is no play.
   */
  discardPlayCost?: (play: CostPlay, facts: CostFacts) => ModelCost | null;
  /**
   * The cost of the play from the hand of another card, while this card is in the core (#1702): Captain
   * on the Bridge makes a Commander aboard his ship cost −1. Null when the text changes nothing.
   */
  costOfPlay?: (play: CostPlay, facts: CostFacts) => ModelCost | null;
  /** The counters the card adds to the turn's limit while the table stands as `facts` say, or null (#1655). */
  limitGrant?: (facts: CostFacts) => { amount: number; reason: string } | null;
  /** The most counters the turn's limit may reach while the table stands as `facts` say, or null (#1704). */
  limitCap?: (facts: CostFacts) => { amount: number; reason: string } | null;
  /** The choices of the turn that raise its limit while the table stands as `facts` say (#1704), one taken a turn. */
  turnChoices?: (facts: CostFacts) => { label: string; limit: number }[];
  /**
   * The discount the card's own play leaves for the first later play of this turn whose card passes
   * `applies` (#1656): its label, "next [Fed][DS9] personnel", and the counters it takes off.
   */
  pendingDiscount?: { label: string; amount: number; applies: (play: CostPlay) => boolean };
}

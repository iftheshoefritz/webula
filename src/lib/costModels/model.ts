// The cost models of the practice table (#1654): what the table reads of a card's text that changes
// what its play costs. A model reads a plain description of the table that the page builds
// (`CostFacts`), never `TableState`, and imports no React and no reducer, so a later bot can ask it
// too. A model only counts: it moves no card and refuses nothing.

import type { PartnerTraits } from '../dilemmaBot/gains';
import type { ModifierRow } from '../modifiers/model';
import { isUseLimit, type UseLimit } from '../useLimit';

/**
 * The shape of the text a model reads. `'ownCost'`: a card that changes its own cost. `'limit'`: a card
 * that adds to the counters the player may spend this turn (#1655). `'pendingDiscount'`: a card whose
 * play makes a later card of this turn cheaper (#1656). `'standingRule'`: a card of the core whose text prices
 * the play of another card while it stands there (#1703). `'missionRule'`: a mission of the player's whose text prices
 * the play of another card (#1752). `'personnelRule'`: a personnel of the player's whose text prices the play of
 * another card while it is unstopped (#1756).
 */
export type CostFamily = 'ownCost' | 'limit' | 'pendingDiscount' | 'standingRule' | 'missionRule' | 'personnelRule';

/** A card of the hand, as a model reads it: its instance id, its title (`cardTitleOf`) and its type, lowercased. */
export interface CostHandCard {
  id: string;
  title: string;
  type: string;
}

/** A personnel the player commands, as a model reads it: its printed traits and whether it is unique (#1693). */
export interface CommandedTraits extends PartnerTraits {
  unique?: boolean;
  /** Its instance id, its title (`cardTitleOf`) and whether it is stopped (#1713). Absent in `commanded`. */
  id?: string;
  title?: string;
  stopped?: boolean;
  /** Its card title alone, lowercased (`rowCardTitleOf`, #1974): "khan noonien singh". Absent: read from `name`. */
  cardTitle?: string;
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
  /** The card title of the mission alone, lowercased (`rowCardTitleOf`, #1974): "ceti alpha v". Absent: read from `name`. */
  cardTitle?: string;
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
  /** Whether the mission shows its back face (#1752). Absent is its front. */
  flipped?: boolean;
}

/** A ship of a mission slot (#1702): its instance id, its title (`cardTitleOf`), and its affiliation and icons, lowercased. */
export interface CostShip {
  id: string;
  title: string;
  /** The card title alone, lowercased (`rowCardTitleOf`, #1986): a Commander keyword names it. Absent, it is `cardTitleOf` of `title`. */
  cardTitle?: string;
  affiliation: string;
  icons: string[];
}

/** What the models read of the table, as it stands before the move. */
export interface CostFacts {
  /**
   * The printed traits of each unstopped personnel the player commands: every away team and every crew, never
   * the brig, with its uniqueness. A stopped personnel is still commanded, but it meets no "if you command",
   * "while you command" or "for each … you command" condition (#1751). Every personnel, stopped ones too, is
   * in `missions[].personnel`.
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
  /**
   * The opponent's dilemma pile, top first, in a bot game only (#1738): each card's instance id and its
   * dilemma type, lowercased (`d` is a dual dilemma). Absent where the table holds no opponent's pile: in a
   * game with no bot the dilemma pile is the player's own.
   */
  opponentDilemmaPile?: CostPileCard[];
  /**
   * The events the player commands (#1749): every event face up on the player's table, those of the core and
   * those placed on the player's mission cards and ships, never the brig, nor an event placed on a card of
   * the core. Each with its keywords, lowercased. Absent is none.
   */
  events?: CostEventCard[];
  /**
   * The printed cost of each card the player commands (#1768), a non-numeric cost 0: the unstopped personnel
   * and the equipment of every away team and crew, never the brig, the ships of every ship row, and the
   * events of `events`. Missions have no cost. Absent is none.
   */
  commandedCosts?: number[];
  /**
   * The top cards of the player's own draw deck, top first, at most `DECK_TOP_FACTS` (#1744), each with its
   * instance id, its type and its species, lowercased. The player's deck in every game. Absent is empty.
   */
  drawDeckTop?: CostDeckCard[];
}

/** The most cards of the draw deck's top that `CostFacts.drawDeckTop` holds (#1744). */
export const DECK_TOP_FACTS = 3;

/** A card of the top of the player's draw deck (#1744): its instance id, its type and its species, lowercased. */
export interface CostDeckCard {
  id: string;
  type: string;
  species: string[];
}

/** An event the player commands (#1749): its title (`cardTitleOf`) and its keywords, lowercased. */
export interface CostEventCard {
  title: string;
  keywords: string[];
}

/** A card of the opponent's dilemma pile (#1738): its instance id and its dilemma type, lowercased. */
export interface CostPileCard {
  id: string;
  dilemmaType: string;
}

/** A card of the core (#1704): its title (`cardTitleOf`), its type and keywords, lowercased, and its printed cost. */
export interface CostCoreCard {
  /** Its instance id (#1713). */
  id?: string;
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
  /**
   * Its species and its skills, lowercased, and the quadrant of the mission slot it landed at, lowercased
   * (#1752). Absent in a play the log recorded before #1752, which passes no test that reads them.
   */
  species?: string[];
  skills?: string[];
  quadrant?: string;
  /** Its affiliation, lowercased (#1750). Absent in a play the log recorded before #1750. */
  affiliation?: string;
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
  /** Its title (`cardTitleOf`), its skills, lowercased words, and its ship class, lowercased (#1752). */
  title?: string;
  skills?: string[];
  shipClass?: string;
  /** The mission slot whose mission card the card is placed on (#1752), apart from `missionIndex`. */
  onMissionIndex?: number;
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
  /**
   * Whether the discount is for a play from the draw deck (#1763, the card The New Resistance revealed): the
   * one play from the draw deck the table charges. Such a discount never applies to a play from the hand.
   */
  fromDrawDeck?: true;
}

/**
 * A "may" the chip offers beside the printed cost: its label and the cost it sets, or the counters it
 * adds to the turn's limit (#1655), or a count (#1695): the label of what is counted, the counters each
 * one takes off, the largest count, and the printed cost it counts from (`moveCharge` fills `base`). A
 * count `n` sets the cost to `max(0, base − step·n)`. A cost choice with `nameDilemma` (#1761, Tristan
 * Adams's "+2: name a dilemma") asks for a dilemma title before it sets the cost, and the correction keeps
 * the title. A cost choice with `discardTop` (#1744, Type III Galor's "Discard the top 3: −2") discards that
 * many cards from the top of the draw deck as it sets the cost, in one entry.
 */
export type CostChoice =
  | { label: string; cost: number; limit?: undefined; step?: undefined; personnel?: undefined; nameDilemma?: true; discardTop?: number }
  | { label: string; limit: number; cost?: undefined; step?: undefined; personnel?: undefined }
  | CountedChoice
  | PersonnelChoice
  | DownloadChoice;

/**
 * A download from the draw deck (#1762, K'mtar's "you may download up to two events, then play each of them at
 * cost -3"): the label, the type of card, the most cards, and the counters each card's own later play takes
 * off. Only data, since the log saves it.
 */
export interface DownloadChoice {
  label: string;
  download: 'event';
  max: number;
  discount: number;
  cost?: undefined;
  limit?: undefined;
  step?: undefined;
  personnel?: undefined;
}

/** Whether `choice` is a well-formed download choice, so a malformed save reads as no choice. */
export const isDownloadChoice = (choice: unknown): choice is DownloadChoice => {
  const c = choice as DownloadChoice | null | undefined;
  return (
    !!c &&
    typeof c.label === 'string' &&
    c.download === 'event' &&
    [c.max, c.discount].every((n) => typeof n === 'number' && Number.isInteger(n) && n > 0)
  );
};

/**
 * A choice of personnel from the table (#1712): the label, and what the choice does with them. Only data,
 * since the log saves it. `stopAffiliations`: choose any number of the unstopped personnel the player
 * commands, stop them, and raise the turn's limit by their different affiliations (Common Purpose).
 */
export interface PersonnelChoice {
  label: string;
  personnel: 'stopAffiliations';
  cost?: undefined;
  limit?: undefined;
  step?: undefined;
}

/** Whether `choice` is a well-formed choice of personnel, so a malformed save reads as no choice. */
export const isPersonnelChoice = (choice: unknown): choice is PersonnelChoice => {
  const c = choice as PersonnelChoice | null | undefined;
  return !!c && typeof c.label === 'string' && c.personnel === 'stopAffiliations';
};

/** The number of different affiliations among `affiliations`, an empty one not counted (#1712). */
export const differentAffiliations = (affiliations: string[]): number =>
  new Set(affiliations.map((a) => a.trim().toLowerCase()).filter(Boolean)).size;

/** A choice of a count (#1695): "Completed missions of the opponent", −2 each, at most 2, from 4. */
export interface CountedChoice {
  label: string;
  step: number;
  max: number;
  base?: number;
  cost?: undefined;
  limit?: undefined;
  personnel?: undefined;
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
  /** The cards of the opponent's dilemma pile the play reveals (#1738), which then go to its bottom. */
  reveal?: CostReveal;
  /** The cards of the player's draw deck the play discards from its top (#1744, Alliance Galor), top first. */
  discard?: CostReveal;
}

/** The number of cards a choice discards from the top of the draw deck (#1744), or 0 for any other choice. */
export const choiceDiscardTop = (choice: unknown): number => {
  const c = choice as { cost?: unknown; discardTop?: unknown } | null | undefined;
  return !!c && typeof c.cost === 'number' && typeof c.discardTop === 'number' && Number.isInteger(c.discardTop) && c.discardTop > 0
    ? c.discardTop
    : 0;
};

/**
 * The cards a play reveals from the top of the opponent's dilemma pile (#1738), by instance id, top first.
 * The page shows them in the reveal panel, and the play puts them on the bottom of the pile, where the
 * player orders them.
 */
export interface CostReveal {
  ids: string[];
}

/**
 * What a use of a card on the table does to that card (#1713): `'destroy'` moves it from the core to the
 * discard pile, `'stop'` stops a personnel the player commands. A later use adds a tag.
 */
// `'revealTop'` (#1763, The New Resistance): reveal the top card of the draw deck, which takes no counters
// off the play; a revealed card the text allows then plays from the draw deck through a pending discount
// with `fromDrawDeck`.
export type CostUseEffect = 'destroy' | 'stop' | 'revealTop';

/**
 * A use a card on the table offers for one play (#1713): the instance id of the card, the model's name,
 * the label ("Destroy Delivery Boy: −3"), the counters it takes off and what it does to the card. Only
 * data, since the log saves it.
 */
export interface CostUse {
  id: string;
  title: string;
  label: string;
  amount: number;
  effect: CostUseEffect;
  /** "Only once each turn" of the card's text (#1834): the use is not offered past it, whichever play it serves. */
  limit?: UseLimit;
}

/** Whether `use` is a well-formed use, so a malformed save reads as no use. */
export const isCostUse = (use: unknown): use is CostUse => {
  const u = use as CostUse | null | undefined;
  return (
    !!u &&
    typeof u.id === 'string' &&
    typeof u.title === 'string' &&
    typeof u.label === 'string' &&
    typeof u.amount === 'number' &&
    Number.isFinite(u.amount) &&
    (u.effect === 'destroy' || u.effect === 'stop' || u.effect === 'revealTop') &&
    (u.limit === undefined || isUseLimit(u.limit))
  );
};

export interface CostModel {
  /** The title of the card, `cardTitleOf` of its name, the key of the registry. */
  title: string;
  /** The name the chip, the list and the log show, when it is not the title: "Tricia Jenkins". */
  label?: string;
  family: CostFamily;
  /**
   * The static cost changes of the card's text, as modifier rows (#1888, `rows.ts`): its own cost, the play it
   * prices from the core, a mission or a personnel, its grant or cap of the limit, and the discount its play
   * leaves. The registry generates the hooks of the rows below from them; a model never has both for one place.
   */
  rows?: readonly ModifierRow[];
  /** The cost of the card's own play from the hand, or null when the text changes nothing on this table. */
  playCost?: (play: CostPlay, facts: CostFacts) => ModelCost | null;
  /**
   * The cost of a play of the card from the discard pile, which only its own text allows (#1698), or null.
   * A card with none is not played from the discard pile: the move is no play.
   */
  discardPlayCost?: (play: CostPlay, facts: CostFacts) => ModelCost | null;
  /**
   * The N of a Recall the card's game text grants (#1764): "While you command two completed missions, this
   * event gains Recall: 1." Null while it has none, so its play from the discard pile is refused. A card whose
   * `Keywords` hold "Recall: N." needs no model (`recallOf` in `playCost.ts`).
   */
  recall?: (facts: CostFacts) => number | null;
  /**
   * The cost of the play from the hand of another card, while this card is in the core (#1702): Captain
   * on the Bridge makes a Commander aboard his ship cost −1. Null when the text changes nothing.
   */
  costOfPlay?: (play: CostPlay, facts: CostFacts) => ModelCost | null;
  /**
   * The cost of the play from the hand of another card, while this mission is in the player's slot
   * `slot` (#1752): Romulus Patient Stronghold makes a D'deridex-class ship cost −1. Asked once per title,
   * for its first slot. Null when the text changes nothing.
   */
  missionCostOfPlay?: (play: CostPlay, facts: CostFacts, slot: number) => ModelCost | null;
  /**
   * The cost of the play from the hand of another card, while an unstopped personnel of this title is in an
   * away team or a crew of the player's, never the brig (#1756): Anthwara makes an event played on a mission
   * cost −1. Asked once per title. Null when the text changes nothing.
   */
  personnelCostOfPlay?: (play: CostPlay, facts: CostFacts) => ModelCost | null;
  /**
   * The uses of the copies of this card on the table for the play from the hand of another card (#1713):
   * Delivery Boy in the core may be destroyed to make a Q or Temporal event cost −3. One per copy that
   * stands where its text says, by instance id. The registry adds the model's name and the label.
   */
  usesForPlay?: (play: CostPlay, facts: CostFacts) => { id: string; amount: number; effect: CostUseEffect }[];
  /** The use limit of `usesForPlay` (#1834), counted per copy over the turn's plays. None: one use per copy per play. */
  useLimit?: UseLimit;
  /** The counters the card adds to the turn's limit while the table stands as `facts` say, or null (#1655). */
  limitGrant?: (facts: CostFacts) => { amount: number; reason: string } | null;
  /**
   * The counters the card adds to the limit of the first turn, decided once at the start of that turn, the
   * Draw 7 tap, from the table as it stands then, or null (#1755, Ledos). The log keeps the answer.
   */
  firstTurnGrant?: (facts: CostFacts) => { amount: number; reason: string } | null;
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

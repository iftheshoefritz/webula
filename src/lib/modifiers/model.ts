// The kind of a static modifier (#1887): a row of plain data, with no function of the registry, so the title lists
// of `titles/` build their rows from it with no import of `index.ts`, which imports them.

import type { CostFacts, CostPlay, ModelCost } from '../costModels/model';
import type { Condition, TableSource, TableView, ViewCard, ViewMission, ViewShip, ViewTableCard } from '../tableView';
import type { CrewedCard } from './words';

/** A personnel's attributes. */
export type PersonnelQuantity = 'integrity' | 'cunning' | 'strength';
/** A ship's attributes: its Range, its Weapons and its Shields. */
export type ShipQuantity = 'range' | 'weapons' | 'shields';
/** A quantity a row adds to: summed, then floored at 0. */
export type AmountQuantity = PersonnelQuantity | ShipQuantity;
/**
 * Every quantity: the amounts, the span total of a move and the 2 between quadrants it adds, the cost of a play
 * and the counters of the turn (#1888).
 */
export type Quantity = AmountQuantity | 'span' | 'quadrantWaiver' | 'cost' | 'counterLimit';

export const PERSONNEL_QUANTITIES: readonly PersonnelQuantity[] = ['integrity', 'cunning', 'strength'];
/** The quantities of `ATTRIBUTE_REGISTRY`: a personnel's attributes and a ship's Weapons and Shields. */
export const ATTRIBUTE_QUANTITIES: readonly AmountQuantity[] = ['integrity', 'cunning', 'strength', 'weapons', 'shields'];

/**
 * Where the source card must stand for its row to apply:
 * - `self`: the card is its own target: a personnel in an away team or a crew, a ship on a ship row (for its
 *   Range, a ship anywhere);
 * - `group`: a personnel or an equipment of an away team or a crew;
 * - `aboard`: a personnel of a ship's crew;
 * - `placedOnShip`: placed on a ship;
 * - `shipRow`: a ship on a ship row;
 * - `missionCard`: placed on a mission card;
 * - `mission`: the mission card of a slot;
 * - `core`: the core;
 * - `commanded`: a personnel in an away team or a crew, stopped too;
 * - `moveMission`: the card of either mission of a move;
 * - `moveShip`: the moving ship;
 * - `played`: the card being played, for its own cost (#1888);
 * - `unstopped`: an unstopped personnel of an away team or a crew, never the brig (#1888).
 *
 * A cost row of `core` reads its title in the core, and one of `mission` the mission card of one of the player's
 * slots, asked with its slot.
 */
export type SourcePlace =
  | 'self'
  | 'group'
  | 'aboard'
  | 'placedOnShip'
  | 'shipRow'
  | 'missionCard'
  | 'mission'
  | 'core'
  | 'commanded'
  | 'moveMission'
  | 'moveShip'
  | 'played'
  | 'unstopped';

/**
 * The cards a row changes, relative to its source: the source itself (`self`), each card of its away team or crew,
 * the source counting or not as the change says (`group`), the crew of the source ship (`crew`), the ship the
 * source is aboard or placed on (`itsShip`), every ship on a ship row (`shipsOnRows`), any card, a card off the
 * table too (`any`), or a move: its two missions and its ship (`move`), the card being played (`play`, #1888), or
 * the counters the player may spend this turn (`turnLimit`, #1888).
 */
export type TargetRelation = 'self' | 'group' | 'crew' | 'itsShip' | 'shipsOnRows' | 'any' | 'move' | 'play' | 'turnLimit';

/**
 * How long a row applies: while its source stands in its place, or for the next play of the turn that passes its
 * test (`nextPlay`, #1888: "the next … you play this turn"), a discount the card's own play leaves, which the log
 * keeps (`pendingDiscountsOf`). Part 3 of #1864 adds the scope of an attempt.
 */
export type Scope = 'whileInPlay' | 'nextPlay';

/** A card a row reads: a view card, with its crew for a ship. */
export type ModifierCard = CrewedCard;

/** What a change of an amount reads. */
export interface AmountContext {
  view: TableView;
  /** The card of the row. */
  source: ModifierCard;
  /** The card it changes. */
  target: ModifierCard;
  /**
   * The slot of the source's place (`mission`, `missionCard`, `shipRow`), or of the target's group (`self`,
   * `group`), or of a ship on a ship row (`self`); absent elsewhere.
   */
  slot?: ViewMission;
  /** The away team or the crew of the target (`self` of a personnel, `group`). */
  group?: ViewTableCard[];
  /** The ship whose crew is the group (`group`, `self` of a personnel), or the target ship. */
  ship?: ViewShip;
  /** The Range of a ship on the table, the card text on. */
  rangeOf: (ship: ModifierCard) => number;
}

/** A change of an amount: a number, or one read from the table. */
export type Delta = number | ((c: AmountContext) => number);

/** What a change of the span total reads: the source card and the move. */
export interface MoveContext {
  source: ViewCard;
  from: ViewCard;
  to: ViewCard;
  ship: ModifierCard;
}

/** A change of the span total: a reduction, before the floor, or the total a move requires, last. */
export type SpanChange = { reduce: (m: MoveContext) => number } | { set: (m: MoveContext, total: number) => number };

/** What a change of a play's cost reads (#1888): the play, the facts of the table and their source. */
export interface CostContext {
  play: CostPlay;
  facts: CostFacts;
  source: TableSource;
  /** The slot of the mission card of a `mission` row. */
  slot?: number;
  /** The words of the row's condition, which held; '' for a row with none. */
  because: string;
}

/**
 * A change of a play's cost (#1888): the cost it sets, with its reason, or null where it changes nothing. A change
 * that sets the printed cost is still a part of the charge.
 */
export type CostChange = (c: CostContext) => ModelCost | null;

/** A discount for the next play of the turn whose card passes `applies` (`nextPlay`): its label and its counters. */
export interface NextPlayDiscount {
  label: string;
  amount: number;
  applies: (play: CostPlay) => boolean;
}

/** What a change of the turn's counters reads (#1888): the facts of the table and their source. */
export interface LimitContext {
  facts: CostFacts;
  source: TableSource;
  because: string;
}

/** The counters a row adds to the turn's limit, or the most it may reach (#1888), with why, or null. */
export type LimitChange =
  | { grant: (c: LimitContext) => { amount: number; reason: string } | null; cap?: undefined }
  | { cap: (c: LimitContext) => { amount: number; reason: string } | null; grant?: undefined };

/** What a row changes: each quantity with its own change. One shared change is the same function under each. */
export interface ModifierChanges extends Partial<Record<AmountQuantity, Delta>> {
  span?: SpanChange;
  /** Whether a move between different quadrants adds no 2. */
  quadrantWaiver?: (m: MoveContext) => boolean;
  /** The cost of a play: a change while the source stands, or the discount of the next play (`nextPlay`). */
  cost?: CostChange | NextPlayDiscount;
  counterLimit?: LimitChange;
}

export interface ModifierRow {
  /** The title, less its version suffix, as the card data names it ("U.S.S. Enterprise-J"). */
  title: string;
  source: SourcePlace;
  target: TargetRelation;
  changes: ModifierChanges;
  /** The row applies only while it holds, read from the view. */
  condition?: Condition;
  scope: Scope;
  /**
   * Each title counts once for a target, however many copies stand there: the cost rows of the player's missions
   * and personnel (#1888), asked once per title.
   */
  eachTitleOnce?: boolean;
  /** The name a cost row's suggestions show, when it is not the title: "Seska" (#1888). */
  label?: string;
}

/** Each copy of the title `title` in `source` changes `changes` of `target`, while `whileInPlay`. */
export const row = (title: string, source: SourcePlace, target: TargetRelation, changes: ModifierChanges, extra: Partial<ModifierRow> = {}): ModifierRow => ({
  title,
  source,
  target,
  changes,
  scope: 'whileInPlay',
  ...extra,
});

/** One change under each of `quantities`: "this ship is attributes +2" changes its Range, Weapons and Shields. */
export const each = (quantities: readonly AmountQuantity[], delta: Delta): ModifierChanges =>
  Object.fromEntries(quantities.map((q) => [q, delta]));

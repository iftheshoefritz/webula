// The kind of a static modifier (#1887): a row of plain data, with no function of the registry, so the title lists
// of `titles/` build their rows from it with no import of `index.ts`, which imports them.

import type { CostFacts, CostPlay, ModelCost } from '../costModels/model';
import type { Condition, TableSource, TableView, TraitQuery, ViewCard, ViewMission, ViewShip, ViewTableCard } from '../tableView';
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
export type Quantity = AmountQuantity | 'span' | 'quadrantWaiver' | 'cost' | 'counterLimit' | 'skills' | PermissionQuantity;

/**
 * The actions a permission allows or forbids (#1915): the play of the card ("To play this event, you must …"), the
 * place it plays to ("may (and must) play to …"), a mission attempt ("cannot attempt missions") and a spend of
 * counters to draw ("You cannot spend counters to draw cards"). A permission has no number: it is in no amount's sum.
 */
export type PermissionQuantity = 'play' | 'playPlace' | 'attempt' | 'spendToDraw';

export const PERMISSION_QUANTITIES: readonly PermissionQuantity[] = ['play', 'playPlace', 'attempt', 'spendToDraw'];

/**
 * A permission's change: `forbid`, the action breaks the rule unless the row's condition holds; `allow`, the action
 * is open where the row says, a place a play may go to.
 */
export type Permission = 'allow' | 'forbid';

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
 * - `unstopped`: an unstopped personnel of an away team or a crew, never the brig (#1888);
 * - `attempt`: no card: an earlier dilemma of the attempt (#1889). No evaluator reads it.
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
  | 'unstopped'
  | 'attempt';

/**
 * The cards a row changes, relative to its source: the source itself (`self`), each card of its away team or crew,
 * the source counting or not as the change says (`group`), the crew of the source ship (`crew`), the ship the
 * source is aboard or placed on (`itsShip`), every ship on a ship row (`shipsOnRows`), any card, a card off the
 * table too (`any`), or a move: its two missions and its ship (`move`), the card being played (`play`, #1888), or
 * the counters the player may spend this turn (`turnLimit`, #1888); for an `attempt` row, every attempting
 * personnel (`attempting`) or the one card of `targetId` (`card`), which no evaluator reads (#1889).
 */
export type TargetRelation =
  | 'self'
  | 'group'
  | 'crew'
  | 'itsShip'
  | 'shipsOnRows'
  | 'any'
  | 'move'
  | 'play'
  | 'turnLimit'
  | 'attempting'
  | 'card';

/**
 * How long a row applies: while its source stands in its place, for the next play of the turn that passes its
 * test (`nextPlay`, #1888: "the next … you play this turn"), a discount the card's own play leaves, which the log
 * keeps (`pendingDiscountsOf`), or for the rest of the attempt (`thisAttempt`, #1889), the bonus and the losses of
 * the bot's `PileModifiers`, never in the registry.
 */
export type Scope = 'whileInPlay' | 'nextPlay' | 'thisAttempt';

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

/**
 * A counted change (#1833): `per` for each of `count` items, capped by the signed `limit` the card prints, "+1 for
 * each Cadet aboard (limit +4)" is `{ count, per: 1, limit: 4 }`, "Integrity -1 for each … (limit -3)" `{ per: -1,
 * limit: -3 }`. The evaluator applies the limit; a row never writes it.
 */
export interface CountedChange<C> {
  count: (c: C) => number;
  per: number;
  limit?: number;
}

/**
 * A change of an amount: a number, one read from the table, a counted change, or the sum of several, as a ship's
 * Range less 3 when crowded beside its capped count.
 */
export type Delta = number | ((c: AmountContext) => number) | CountedChange<AmountContext> | readonly Delta[];

/** `per` for each of `count`, at most `limit` (signed). */
export const counted = <C>(count: (c: C) => number, per: number, limit?: number): CountedChange<C> =>
  limit === undefined ? { count, per } : { count, per, limit };

/** `total` capped by the signed `limit`: at most a positive one, at least a negative one. */
export const clampToLimit = (total: number, limit: number | undefined): number =>
  limit === undefined ? total : limit >= 0 ? Math.min(total, limit) : Math.max(total, limit);

/** The value of a counted change. */
export const countedAmount = <C>(change: CountedChange<C>, c: C): number => clampToLimit(change.count(c) * change.per, change.limit);

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
export type CostChange = ((c: CostContext) => ModelCost | null) & {
  /** The counted change the function applies to the printed cost, for a reader of its limit (#1833). */
  counted?: CountedChange<CostContext>;
};

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

/**
 * The skills a row gives (#1836), added to a personnel's printed skills: "Each of your non-unique Science personnel
 * present gains Exobiology, Programming, and Transporters." `gain` spells each skill as the card data does, once
 * per level; `who` is the printed traits a target must have, and `unique` its uniqueness; `where` any other test,
 * over the target and its place.
 */
export interface SkillGain {
  gain: string[];
  who?: TraitQuery & { unique?: boolean };
  where?: (c: AmountContext) => boolean;
}

/** What a row changes: each quantity with its own change. One shared change is the same function under each. */
export interface ModifierChanges extends Partial<Record<AmountQuantity, Delta>>, Partial<Record<PermissionQuantity, Permission>> {
  span?: SpanChange;
  /** Whether a move between different quadrants adds no 2. */
  quadrantWaiver?: (m: MoveContext) => boolean;
  /** The cost of a play: a change while the source stands, or the discount of the next play (`nextPlay`). */
  cost?: CostChange | NextPlayDiscount;
  counterLimit?: LimitChange;
  /** The skills it gives (#1836). */
  skills?: SkillGain;
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
  /** The card id of a `card` target. */
  targetId?: string;
  /**
   * A permission's words when no condition gives them (#1917): "personnel aboard this ship cannot attempt missions",
   * as its warning reads them.
   */
  words?: string;
  /** The mission a `playPlace` row names (#1917), as a brace reference: "Ba'ku Planet", matched as `titleMatches` matches it. */
  playTo?: string;
  /** An `attempt` row of the core (#1917): the fewest personnel an attempt may begin with. */
  minAttempting?: number;
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

const isCounted = (d: Delta): d is CountedChange<AmountContext> => typeof d === 'object' && !Array.isArray(d);

// The limits of a delta, each part of a sum.
const deltaLimits = (d: Delta | undefined): number[] =>
  d === undefined || typeof d !== 'object' ? [] : Array.isArray(d) ? d.flatMap(deltaLimits) : isCounted(d) && d.limit !== undefined ? [d.limit] : [];

/**
 * The signed limits of a row's counted changes (#1833), each quantity's and its cost's, in quantity order: what
 * the registry test checks against the "(limit …)" its card prints.
 */
export function rowLimits(r: Pick<ModifierRow, 'changes'>): number[] {
  const amounts: readonly AmountQuantity[] = [...PERSONNEL_QUANTITIES, 'range', 'weapons', 'shields'];
  const limits = amounts.flatMap((q) => deltaLimits(r.changes[q]));
  const cost = r.changes.cost;
  if (typeof cost === 'function' && cost.counted?.limit !== undefined) limits.push(cost.counted.limit);
  return limits;
}

/**
 * A change an effect made for the rest of the attempt (#1835): "make the ship he is aboard Weapons +5 until the end
 * of this mission attempt". Plain numbers, so the save keeps it on `Attempt.timed` and `endAttempt` ends it; the
 * view carries it (`TableView.timed`), and `attributeOf` and `rangeOf` add it to the card of `targetId`.
 */
export interface TimedChange {
  /** The title of the card whose ability made it. */
  title: string;
  /** The instance id of that card. */
  sourceId: string;
  /** The instance id of the card it changes. */
  targetId: string;
  changes: Partial<Record<AmountQuantity, number>>;
}

// The table view (#1875, part 1 of #1862): one plain description of the player's table that the cost, play,
// range, attribute and bot readers will share, its selectors, and the conditions of the card texts built from
// them. It imports no React and nothing of the practice table (#1298); `tableViewOf` in
// `src/app/decks/practice/tableView.ts` builds it from a `TableState`. `costFactsOf` projects `CostFacts` from it,
// and the cost models evaluate its conditions over their `CostFacts` (#1876); parts 3 to 5 of #1862 move
// `RangeTable`, `AttributeTable`, `PileTableInput` and `BotTableFacts` onto it.
//
// "Command" keeps the two meanings the readers of today give it (`docs/ubiquitous-language.md`): the cost and
// play models count only the unstopped personnel, and the range, attribute and bot readers count the stopped
// ones too. So every selector of personnel takes `unstopped`, never a default. The brig is outside every
// selector; the view keeps it, with its ownership gap ("in play").

import { SKILL_INDEX } from './dilemmaBot/requirements';
import type { PartnerTraits } from './dilemmaBot/gains';
import type { BotPileInfo } from './dilemmaBot/botPiles';
import type { CostTurnPlay, PendingDiscount } from './costModels/model';

/** A row of the card data, lowercased by `parseCardData`, with its `originalName`. */
export type ViewRow = any;

/** Any card of the view: its instance id, its title (`cardTitleOf` of `cardDisplayName`) and its row. */
export interface ViewCard {
  id: string;
  /** The title less its version suffix, in the case of the card data's `originalName`. */
  title: string;
  /** The lowercased type, "personnel". */
  type: string;
  /** The printed cost, 0 when it has none. */
  cost: number;
  row: ViewRow;
  /** The cards placed on it. */
  placedOn: ViewCard[];
  /** The title a placed Self-Replicating Roadblock named (#1789), `CardInstance.named`. Absent: none. */
  named?: string;
}

/** A personnel or an equipment of an away team or a crew, or a ship of a ship row: its traits and its place. */
export interface ViewTableCard extends ViewCard, Omit<PartnerTraits, 'type'> {
  unique: boolean;
  stopped: boolean;
  /** The mission slot it stands at. */
  missionIndex: number;
  /** The ship whose crew it is in; absent in an away team and for a ship. */
  shipId?: string;
}

export interface ViewShip extends ViewTableCard {
  crew: ViewTableCard[];
}

/** An event the player commands (#1749): in the core, or placed on a mission card or a ship. */
export interface ViewEvent extends ViewCard {
  /** The keywords, lowercased, each once: "assault". */
  keywords: string[];
  place: 'core' | 'missionCard' | 'ship';
  /** The slot of the mission card or the ship it is placed on. */
  missionIndex?: number;
  /** The ship it is placed on. */
  shipId?: string;
}

/** A mission slot, with the fields of `CostMission` and the cards of the slot. */
export interface ViewMission {
  index: number;
  /** A slot with no mission card. */
  empty: boolean;
  completed: boolean;
  flipped: boolean;
  /** The mission card, null in an empty slot. */
  card: ViewCard | null;
  /** The display name, "Celtris III" ("" in an empty slot). */
  name: string;
  /** The requirement text, lowercased, as the cards in play change it (`requirementTextsOf`, Crescent Nebula). */
  requirements: string;
  points: number;
  /** The first letter of the `missiontype`: "p", "s", "h", or "" in an empty slot. */
  type: string;
  /** The icons of its affiliation field, "[fed]". */
  icons: string[];
  quadrant: string;
  /** Every "Region: <name>." of its keywords, lowercased. */
  regions: string[];
  underMission: ViewCard[];
  /** The cards placed on the mission card. */
  placedOn: ViewCard[];
  /** The personnel and the equipment of the away team. */
  awayTeam: ViewTableCard[];
  /** The ships of the ship row, each with its crew. */
  ships: ViewShip[];
}

export interface ViewPileCard extends ViewCard {
  /** A card of the discard pile marked removed from the game. */
  removedFromGame?: boolean;
}

export interface TableView {
  /** Every mission slot, the empty ones too, by index. */
  missions: ViewMission[];
  /** The core, each card with the cards placed on it. */
  core: ViewCard[];
  hand: ViewPileCard[];
  discard: ViewPileCard[];
  drawDeck: ViewPileCard[];
  dilemmaPile: ViewPileCard[];
  /** The dilemma pile is the bot's, the opponent's (#1738). */
  dilemmaPileIsBot: boolean;
  /** The brig, which no selector reads: the table does not know whose card it holds. */
  brig: ViewCard[];
  /** The events the player commands (#1749): never the brig, never an event placed on a core card. */
  events: ViewEvent[];
  score: number;
  turn: number;
  segment: 'playAndDraw' | 'orders' | 'discard';
  rangeUsed: Record<string, number>;
  botPile?: BotPileInfo;
  /** From the log: the plays of the turn so far (#1703), as the caller gives them. */
  plays: CostTurnPlay[];
  /** From the log: the pending discounts of the turn, as the caller gives them. */
  pending: PendingDiscount[];
}

// The sources (#1876). A selector and a condition read a table through a `TableSource`: a `TableView`, or an
// adapter over the `CostFacts` a cost model holds (`costFactsSource` in `costModels/factsSource.ts`), which
// has no place for `commanded` and no view to build. Each source gives the raw lists; the selectors below
// filter them, so the trait matching is one function for both.

/** A personnel as every source holds it: its printed traits, and what the source knows of its place. */
export interface SourcePersonnel extends Omit<PartnerTraits, 'type'> {
  type?: string;
  unique?: boolean;
  id?: string;
  title?: string;
  stopped?: boolean;
  missionIndex?: number;
  shipId?: string;
}

/** A ship of a ship row as every source holds it. */
export interface SourceShip {
  id: string;
  title: string;
  affiliation: string;
  icons: string[];
  keywords?: string[];
  missionIndex?: number;
}

/** An event the player commands as every source holds it. */
export interface SourceEvent {
  title: string;
  keywords: string[];
  id?: string;
}

/** A mission slot as every source holds it. */
export interface SourceMission {
  index: number;
  empty: boolean;
  completed: boolean;
  flipped?: boolean;
  name: string;
  requirements: string;
  points: number;
  type: string;
  icons: string[];
  quadrant: string;
  regions: string[];
}

/** A card of the core: its title, its type and keywords, lowercased (each as printed, not de-duplicated), its printed cost and the number of cards placed on it. */
export interface SourceCoreCard {
  id?: string;
  title: string;
  type: string;
  keywords: string[];
  cost: number;
  placed: number;
}

export interface TableSource {
  /**
   * The personnel of every away team and crew, by slot; with `unstopped`, the unstopped ones only. `at` is the
   * slot the query asks for, which the selector filters on; a source may read another list for it.
   */
  personnelOf: (unstopped: boolean, at?: number) => SourcePersonnel[];
  shipsOf: () => SourceShip[];
  eventsOf: () => SourceEvent[];
  /** Every mission slot, the empty ones too, by index. */
  missionsOf: () => SourceMission[];
  coreOf: () => SourceCoreCard[];
  /** The plays of the turn so far, oldest first. */
  playsOf: () => CostTurnPlay[];
}

/** What a selector or a condition reads: a table view, or another source. */
export type TableReader = TableView | TableSource;

const text = (v: unknown): string => String(v ?? '').toLowerCase();

const coreKeywordsOf = (row: ViewRow): string[] =>
  text(row?.keywords)
    .split('.')
    .map((k) => k.trim())
    .filter(Boolean);

/** The source of a table view. */
export const viewSource = (view: TableView): TableSource => ({
  personnelOf: (unstopped) =>
    view.missions.flatMap(slotTableCards).filter((p) => p.type === 'personnel' && (!unstopped || !p.stopped)),
  shipsOf: () => view.missions.flatMap((m) => m.ships),
  eventsOf: () => view.events,
  missionsOf: () => view.missions,
  coreOf: () =>
    view.core.map((c) => ({ id: c.id, title: c.title, type: c.type, keywords: coreKeywordsOf(c.row), cost: c.cost, placed: c.placedOn.length })),
  playsOf: () => view.plays,
});

const isSource = (r: TableReader): r is TableSource => typeof (r as TableSource).personnelOf === 'function';

/** The source of `r`. */
export const sourceOf = (r: TableReader): TableSource => (isSource(r) ? r : viewSource(r));

// The selectors.

/** An icon as the card data holds it, "[pa]", from "[Pa]" or "pa". */
const iconToken = (icon: string): string => {
  const i = icon.toLowerCase();
  return i.startsWith('[') ? i : `[${i}]`;
};

interface TraitQuery {
  /** The lowercased affiliation, whole: "federation". */
  affiliation?: string;
  /** A species, whole and lowercased: "borg". */
  species?: string;
  /** A skill of `BOT_SKILLS`: "treachery". */
  skill?: string;
  /** A keyword, whole and lowercased: "dissident". */
  keyword?: string;
  /** An icon: "[tng]" or "tng". */
  icon?: string;
  /** At this mission slot. */
  at?: number;
}

interface Traits {
  affiliation: string;
  species?: string[];
  skills?: number[];
  keywords?: string[];
  icons: string[];
  missionIndex?: number;
}

const passesTraits = (c: Traits, q: TraitQuery): boolean =>
  (q.affiliation === undefined || c.affiliation === q.affiliation.toLowerCase()) &&
  (q.species === undefined || (c.species ?? []).includes(q.species.toLowerCase())) &&
  (q.skill === undefined || ((c.skills ?? [])[SKILL_INDEX[q.skill.toLowerCase()]] ?? 0) > 0) &&
  (q.keyword === undefined || (c.keywords ?? []).includes(q.keyword.toLowerCase())) &&
  (q.icon === undefined || c.icons.includes(iconToken(q.icon))) &&
  (q.at === undefined || c.missionIndex === q.at);

export interface PersonnelQuery extends TraitQuery {
  /**
   * Required (#1875): `true` leaves the stopped personnel out, as the cost and play models count "you command"
   * (#1751); `false` keeps them, as the range, attribute and bot readers do.
   */
  unstopped: boolean;
  /** Aboard this ship: its crew only. A `CostFacts` source knows no crew, so it finds none. */
  aboard?: string;
  /** Any other test. */
  where?: (p: SourcePersonnel) => boolean;
}

export interface ShipQuery extends Omit<TraitQuery, 'species' | 'skill'> {
  where?: (s: SourceShip) => boolean;
}

export interface EventQuery {
  keyword?: string;
  where?: (e: SourceEvent) => boolean;
}

export interface MissionQuery {
  /** Keep the slots with no mission card; left out by default. */
  includeEmpty?: boolean;
  /** The slot of this index only. */
  index?: number;
  completed?: boolean;
  /** `true`: only headquarters; `false`: none. */
  headquarters?: boolean;
  /** The first letter of the `missiontype`: "p", "s" or "h". */
  type?: string;
  /** "a", "g", "d" or "q". */
  quadrant?: string;
  where?: (m: SourceMission) => boolean;
}

export interface CoreQuery {
  /** The title, as `cardTitleOf` gives it in the case of the card data: "Energize". */
  title?: string;
}

/** The personnel and the equipment of a slot: its away team, then each crew of its ship row. */
const slotTableCards = (m: ViewMission): ViewTableCard[] => [...m.awayTeam, ...m.ships.flatMap((s) => s.crew)];

/** The personnel of every away team and crew that pass `q`, by slot; never the brig. */
export function personnel(view: TableView, q: PersonnelQuery): ViewTableCard[];
export function personnel(reader: TableReader, q: PersonnelQuery): SourcePersonnel[];
export function personnel(reader: TableReader, q: PersonnelQuery): SourcePersonnel[] {
  return sourceOf(reader)
    .personnelOf(q.unstopped, q.at)
    .filter((p) => (q.aboard === undefined || p.shipId === q.aboard) && passesTraits(p, q) && (!q.where || q.where(p)));
}

/** The ships of every ship row that pass `q`, by slot. */
export function ships(view: TableView, q?: ShipQuery): ViewShip[];
export function ships(reader: TableReader, q?: ShipQuery): SourceShip[];
export function ships(reader: TableReader, q: ShipQuery = {}): SourceShip[] {
  return sourceOf(reader)
    .shipsOf()
    .filter((s) => passesTraits(s, q) && (!q.where || q.where(s)));
}

/** The events the player commands that pass `q`: the core's, and those placed on mission cards and ships. */
export function events(view: TableView, q?: EventQuery): ViewEvent[];
export function events(reader: TableReader, q?: EventQuery): SourceEvent[];
export function events(reader: TableReader, q: EventQuery = {}): SourceEvent[] {
  return sourceOf(reader)
    .eventsOf()
    .filter((e) => (q.keyword === undefined || e.keywords.includes(q.keyword.toLowerCase())) && (!q.where || q.where(e)));
}

/** The mission slots that pass `q`; the empty ones only with `includeEmpty`. */
export function missions(view: TableView, q?: MissionQuery): ViewMission[];
export function missions(reader: TableReader, q?: MissionQuery): SourceMission[];
export function missions(reader: TableReader, q: MissionQuery = {}): SourceMission[] {
  return sourceOf(reader)
    .missionsOf()
    .filter(
      (m) =>
        (q.includeEmpty || !m.empty) &&
        (q.index === undefined || m.index === q.index) &&
        (q.completed === undefined || m.completed === q.completed) &&
        (q.headquarters === undefined || (m.type === 'h') === q.headquarters) &&
        (q.type === undefined || m.type === q.type.toLowerCase()) &&
        (q.quadrant === undefined || m.quadrant === q.quadrant.toLowerCase()) &&
        (!q.where || q.where(m))
    );
}

/** The mission slot of index `index`, empty or not, or undefined. */
export const missionAt = (reader: TableReader, index: number | undefined): SourceMission | undefined =>
  index === undefined ? undefined : missions(reader, { includeEmpty: true, index })[0];

/** The cards of the core that pass `q`, in core order: "copies in the core" of a title (#1876). */
export function core(reader: TableReader, q: CoreQuery = {}): SourceCoreCard[] {
  return sourceOf(reader)
    .coreOf()
    .filter((c) => q.title === undefined || c.title === q.title);
}

/** The plays of the turn so far that pass `test`, oldest first (#1876). */
export const playsThisTurn = (reader: TableReader, test: (play: CostTurnPlay) => boolean = () => true): CostTurnPlay[] =>
  sourceOf(reader).playsOf().filter(test);

/** What a condition counts: one selector and its query. */
export type Selection =
  | ({ of: 'personnel' } & PersonnelQuery)
  | ({ of: 'ships' } & ShipQuery)
  | ({ of: 'events' } & EventQuery)
  | ({ of: 'missions' } & MissionQuery);

/** The entries `s` selects. */
export function select(reader: TableReader, s: Selection): (SourcePersonnel | SourceShip | SourceEvent | SourceMission)[] {
  switch (s.of) {
    case 'personnel':
      return personnel(reader, s);
    case 'ships':
      return ships(reader, s);
    case 'events':
      return events(reader, s);
    case 'missions':
      return missions(reader, s);
  }
}

/** How many entries `s` selects, or the selections of a list together. */
export const count = (reader: TableReader, s: Selection | Selection[]): number =>
  (Array.isArray(s) ? s : [s]).reduce((n, one) => n + select(reader, one).length, 0);

// The conditions.

/** Where the played card stands: its slot, the ship it boards, and its own id, which no condition counts. */
export interface ConditionAt {
  missionIndex?: number;
  shipId?: string;
  id?: string;
}

/**
 * A condition of a card text. `text` gives its words as the log and the panel's condition line print them;
 * some read the table ("you command 3 Treachery personnel"), so it takes the view.
 */
export interface Condition {
  holds: (view: TableReader, at?: ConditionAt) => boolean;
  text: (view: TableReader, at?: ConditionAt) => string;
}

/** `text` replaces the default words of a condition. */
export interface ConditionOptions {
  text?: string;
}

/** A condition whose words are `options.text`, or else `words` of the view. */
const condition = (
  holds: Condition['holds'],
  words: Condition['text'],
  options: ConditionOptions
): Condition => ({ holds, text: (view, at) => options.text ?? words(view, at) });

/**
 * "If you command <at least `min`> <what>" (`ifCommand` in `costModels/titles/commanded.ts`): "you command a
 * Borg", or with `min` above 1 the number commanded, "you command 3 [Fed] personnel".
 */
export function commands(selection: Selection | Selection[], what: string, options: ConditionOptions & { min?: number } = {}): Condition {
  const min = options.min ?? 1;
  return condition(
    (view) => count(view, selection) >= min,
    (view) => (min === 1 ? `you command ${what}` : `you command ${count(view, selection)} ${what}`),
    options
  );
}

/**
 * "For each <what> you command (limit `limit`)" (`forEach` in `commanded.ts`): holds for one or more, "you
 * command 6 Borg (limit 5)".
 */
export function commandsEach(selection: Selection, what: string, options: ConditionOptions & { limit?: number } = {}): Condition {
  const limit = options.limit ?? Infinity;
  return condition(
    (view) => count(view, selection) > 0,
    (view) => {
      const n = count(view, selection);
      return `you command ${n} ${what}${Number.isFinite(limit) && n > limit ? ` (limit ${limit})` : ''}`;
    },
    options
  );
}

/**
 * "Events you command" (#1749): at least `min` events of `keyword` (any event with none). The words of
 * `forEachEvent` and Gowron: "you command 1 Assault event", "you command 3 events".
 */
export function commandsEvents(options: ConditionOptions & { keyword?: string; what?: string; min?: number } = {}): Condition {
  const selection: Selection = { of: 'events', keyword: options.keyword };
  const min = options.min ?? 1;
  return condition(
    (view) => count(view, selection) >= min,
    (view) => {
      const n = count(view, selection);
      return `you command ${n} ${options.what ? `${options.what} ` : ''}${n === 1 ? 'event' : 'events'}`;
    },
    options
  );
}

const requirementWords = (text: string): string[] => text.toLowerCase().split(/[^a-z]+/).filter(Boolean);

/** Whether the requirement text of `mission` names `skill` as a word, either side of an "or" (`missionRequires` of `completedMission.ts`). */
export const requiresSkill = (mission: Pick<SourceMission, 'requirements'>, skill: string): boolean =>
  requirementWords(mission.requirements).includes(skill.toLowerCase());

/**
 * "A mission requiring <skill>": some mission of `query` names `skill`. `each: true` is "each of your
 * non-headquarters missions requires <skill>" (`playConditionOf`): an empty slot is no mission, and with no
 * such mission it holds.
 */
export function missionRequires(skill: string, options: ConditionOptions & { each?: boolean; query?: MissionQuery } = {}): Condition {
  if (options.each) {
    return condition(
      (view) => missions(view, { headquarters: false }).every((m) => requiresSkill(m, skill)),
      () => `each of your non-headquarters missions requires ${skill}`,
      options
    );
  }
  const query = options.query ?? {};
  return condition(
    (view) => missions(view, query).some((m) => requiresSkill(m, skill)),
    () => `a mission requires ${skill}`,
    options
  );
}

/**
 * "If you have completed <at least `min`, at most `max`> missions of `query`". No reader prints it yet, so its
 * default words are new: "you completed 2 missions".
 */
export function completedMissions(options: ConditionOptions & { min?: number; max?: number; query?: MissionQuery } = {}): Condition {
  const n = (view: TableReader) => missions(view, { ...options.query, completed: true }).length;
  const min = options.min ?? 1;
  const max = options.max ?? Infinity;
  return condition(
    (view) => n(view) >= min && n(view) <= max,
    (view) => `you completed ${n(view)} ${n(view) === 1 ? 'mission' : 'missions'}`,
    options
  );
}

/**
 * "You completed <name> (requires <skill>)" (`ifCompletedRequiring` of `completedMission.ts`): a completed
 * mission requires one of `skills`. Its words name the first such mission and skill.
 */
export function completedMissionRequiring(skills: string[], options: ConditionOptions = {}): Condition {
  const first = (view: TableReader): [SourceMission, string] | null => {
    for (const m of missions(view, { completed: true })) {
      const skill = skills.find((s) => requiresSkill(m, s));
      if (skill) return [m, skill];
    }
    return null;
  };
  return condition(
    (view) => first(view) !== null,
    (view) => {
      const hit = first(view);
      return hit ? `you completed ${hit[0].name} (requires ${hit[1]})` : `you completed a mission requiring ${skills.join(' or ')}`;
    },
    options
  );
}

/** `what` of a count: a fixed phrase, or the words of `n`, "2 Remans". */
type Counted = string | ((n: number) => string);
const phraseOf = (what: Counted, n: number): string => (typeof what === 'string' ? what : what(n));

/** The personnel of `q` at the played card's slot, less the card itself; none with no slot. */
const here = (view: TableReader, q: PersonnelQuery, at: ConditionAt | undefined): SourcePersonnel[] =>
  at?.missionIndex === undefined ? [] : personnel(view, { ...q, at: at.missionIndex }).filter((p) => p.id !== at.id);

/** The crew of `q` aboard the played card's ship, less the card itself; none with no ship. */
const aboard = (view: TableReader, q: PersonnelQuery, at: ConditionAt | undefined): SourcePersonnel[] =>
  at?.shipId === undefined ? [] : personnel(view, { ...q, aboard: at.shipId }).filter((p) => p.id !== at.id);

/**
 * "<what> at this mission": a personnel of `q` at the played card's slot, the card itself left out
 * (`forEachHere` of `ownCostPlace.ts`, `otherSpeciesHere`). "a Gul or Legate at this mission", "2 Remans at this
 * mission", "your non-Cardassian is at this mission".
 */
export function atThisMission(q: PersonnelQuery, what: Counted, options: ConditionOptions = {}): Condition {
  return condition(
    (view, at) => here(view, q, at).length > 0,
    (view, at) => `${phraseOf(what, here(view, q, at).length)} at this mission`,
    options
  );
}

/** "<what> aboard this ship": a personnel of `q` in the crew of the played card's ship, the card itself left out. */
export function aboardThisShip(q: PersonnelQuery, what: Counted, options: ConditionOptions = {}): Condition {
  return condition(
    (view, at) => aboard(view, q, at).length > 0,
    (view, at) => `${phraseOf(what, aboard(view, q, at).length)} aboard this ship`,
    options
  );
}

/**
 * "The first <what> … each turn" (#1876): no card played earlier this turn passes `test`, whatever it cost.
 * "first Android this turn".
 */
export function firstThisTurn(test: (play: CostTurnPlay) => boolean, what: string, options: ConditionOptions = {}): Condition {
  return condition(
    (view) => playsThisTurn(view, test).length === 0,
    () => `first ${what} this turn`,
    options
  );
}

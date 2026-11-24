// The triggers (#1903, part 1 of #1867): a card text that waits for an event of the game, "When you complete a
// mission, score 5 points", "When this personnel is killed, …". This file holds the game-event vocabulary and the
// kind of a trigger row, plain data like the modifier rows (`src/lib/modifiers/model.ts`), so the title lists of
// `titles/` build their rows from it with no import of `index.ts`, which imports them.
//
// A game event is read from one log entry of the practice table and the table it left (`gameEventsOf` in
// `src/app/decks/practice/gameEvents.ts`), and the offers are derived from the log, never stored
// (`pendingTriggersOf` in `src/app/decks/practice/triggers.ts`). It imports no React and no reducer.

import type { EffectStep } from '../effectSteps';
import type { CostTurnPlay } from '../costModels/model';
import type { Condition, MissionQuery, TableView, ViewCard, ViewMission } from '../tableView';
import type { UseLimit } from '../useLimit';

/** A card an event names: its display name as the log keeps it, and its instance id where the table still holds it. */
export interface GameEventCard {
  id?: string;
  name: string;
}

/** The segments of a turn, as `TurnSegment` of the practice table names them. */
export type GameEventSegment = 'playAndDraw' | 'orders' | 'discard';

/** Where a played card landed. */
export type PlayedPlace = 'awayTeam' | 'crew' | 'shipRow' | 'core' | 'missionCard' | 'placed' | 'resolving' | 'other';

/**
 * One event of the game, with its subjects:
 * - `played`: a charged play of the player's: the card, its lowercased type, the traits a standing rule tests (absent
 *   in an entry from before #1703), and where it landed;
 * - `drew`: cards into the hand, from the draw deck (`opening` for Draw 7);
 * - `attemptStarted`: the mission slot, the ship at a space mission, the attempting personnel; `bot` in a bot game;
 * - `missionCompleted`: the slot, its quadrant, its type and its requirements, and the personnel involved;
 * - `dilemmasDrawn`: dilemmas drawn for an attempt: the bot's draw at Start, or the player's draw in the choice;
 * - `dilemmaRevealed`: the top card of the facing stack turned face up, its type and the kept picks;
 * - `dilemmaResolved`: the bot's Resolve of a revealed dilemma;
 * - `stopped`, `killed`, `brigged`: the personnel, and whether a dilemma did it. Only a dilemma Resolve's `kill` is a
 *   kill: a drag to the discard pile is not;
 * - `turnStarted` (the first turn too, at Draw 7), `segmentStarted`, `segmentEnded`.
 */
export type GameEvent =
  | { kind: 'played'; card: GameEventCard; type: string; traits?: CostTurnPlay; place: PlayedPlace; missionIndex?: number; shipId?: string }
  | { kind: 'drew'; count: number; opening?: true }
  | { kind: 'attemptStarted'; missionIndex: number; shipId?: string; personnel: string[]; bot?: true }
  | { kind: 'missionCompleted'; missionIndex: number; quadrant: string; type: string; requirements: string; involved: string[] }
  | { kind: 'dilemmasDrawn'; count: number; bot?: true }
  | { kind: 'dilemmaRevealed'; dilemma: GameEventCard; dilemmaType: string; picks: string[][] }
  | { kind: 'dilemmaResolved'; dilemma: GameEventCard }
  | { kind: 'stopped' | 'killed' | 'brigged'; cards: GameEventCard[]; byDilemma: boolean }
  | { kind: 'turnStarted'; turn: number; first?: true }
  | { kind: 'segmentStarted' | 'segmentEnded'; segment: GameEventSegment };

export type GameEventKind = GameEvent['kind'];

/** The event of kind `K`. */
export type GameEventOf<K extends GameEventKind> = Extract<GameEvent, { kind: K }>;

/** The cards an event is about, for "this personnel": the played card, the stopped, killed or placed in the brig. */
export function eventSubjects(event: GameEvent): GameEventCard[] {
  switch (event.kind) {
    case 'played':
      return [event.card];
    case 'stopped':
    case 'killed':
    case 'brigged':
      return event.cards;
    case 'dilemmaRevealed':
    case 'dilemmaResolved':
      return [event.dilemma];
    default:
      return [];
  }
}

/** The mission slot an event is at, where it has one. */
export const eventMissionIndex = (event: GameEvent): number | undefined =>
  event.kind === 'missionCompleted' || event.kind === 'attemptStarted' || event.kind === 'played' ? event.missionIndex : undefined;

/**
 * Where the source card must be for its row to listen:
 * - `core`: in the core;
 * - `missionCard`: placed on a mission card of the player's;
 * - `mission`: the mission card of a slot;
 * - `table`: a personnel or an equipment of an away team or a crew, or a ship on a ship row;
 * - `hand`: in the hand, an interrupt;
 * - `self`: the event's own subject, wherever it now is ("When this personnel is killed", in the discard pile);
 * - `botDeck`: the `Deck:` section of the bot's pile, with no card on the table.
 */
export type TriggerSource = 'core' | 'missionCard' | 'mission' | 'table' | 'hand' | 'self' | 'botDeck';

/** What the source card is, for a filter: its view card, and the slot of a `missionCard` or `mission` source. */
export interface TriggerContext {
  view: TableView;
  source: ViewCard | null;
  /** The slot of a `missionCard` or `mission` source, or of a `table` source's place. */
  sourceSlot?: ViewMission;
}

/**
 * The event a row waits for: its kind and a filter on it.
 * - `self`: the source card is a subject of the event ("When this personnel is killed"); a `self` source always is;
 * - `byDilemma`: a stop, a kill or a brig of a dilemma's (true) or of the player's (false);
 * - `mission`: the event's mission slot passes the query ("When you complete a space mission");
 * - `where`: any other test, over the event and the source.
 */
export interface TriggerEvent<K extends GameEventKind = GameEventKind> {
  kind: K;
  self?: true;
  byDilemma?: boolean;
  mission?: MissionQuery;
  where?: (event: GameEventOf<K>, context: TriggerContext) => boolean;
}

/** What using the trigger costs: destroy or discard the source, discard N cards from hand, or stop the source. */
export type TriggerUseCost = { kind: 'destroySelf' } | { kind: 'discardSelf' } | { kind: 'discardFromHand'; count: number } | { kind: 'stopSelf' };

/**
 * A step only the bot takes (#1906), from a `botDeck` row: Unexpected Difficulties's "return the drawn dilemmas to
 * the bottom of the pile, face up, and draw as many". `botRedraws` in `useBotAttemptStart.ts` decides it and the
 * `redrawn` of `botAttempt` applies it; no effect subject of the player ever runs it.
 */
export interface BotRedrawDilemmasStep {
  kind: 'botRedrawDilemmas';
}

/**
 * A step that changes the kept roll of the revealed dilemma (#1905): `selectAgain` rolls the reveal snapshot's picks
 * again (Let's Try That Again, Shall We?), `replacePick` swaps one pick for an unstopped, unpicked [Stf] personnel of
 * the attempting row (Dessert Disaster). Their rows are offered on the revealed card's own buttons, never as offer
 * chips (`onRevealedCard`), and the actions `selectAgain` and `replacePick` of `tableReducer.ts` take them, with the
 * roll that `withShuffleOrders` makes.
 */
export interface RevealedCardStep {
  kind: 'selectAgain' | 'replacePick';
}

/** A step of a trigger row: an effect step, a step of the bot's own, or a step on the revealed dilemma's roll. */
export type TriggerStep = EffectStep | BotRedrawDilemmasStep | RevealedCardStep;

/** Whether a row is taken on the revealed dilemma's own buttons (#1905) rather than as an offer chip. */
export const onRevealedCard = (row: TriggerRow): boolean => row.steps.some((s) => s.kind === 'selectAgain' || s.kind === 'replacePick');

export interface TriggerRow {
  /** The title, less its version suffix, as the card data names it ("Distant Exploration"). */
  title: string;
  /** The clause, for the offer: "When you complete a mission …, score 5 points." */
  text: string;
  event: TriggerEvent;
  source: TriggerSource;
  /** The row offers only while it holds, read from the view at the event's mission. */
  condition?: Condition;
  /** "You may": the player may skip it. The table never forces an offer either way. */
  may: boolean;
  useCost?: TriggerUseCost;
  /**
   * "You may do this only once each turn" (#1834): at most `times` uses of the card's row each turn. Every row is
   * offered once per event in any case.
   */
  limit?: UseLimit;
  steps: TriggerStep[];
}

/** A row of `title` that waits for `event` of `kind` while its card is in `source`. */
export function trigger<K extends GameEventKind>(
  title: string,
  text: string,
  source: TriggerSource,
  event: TriggerEvent<K>,
  steps: TriggerStep[],
  extra: Partial<Pick<TriggerRow, 'condition' | 'may' | 'useCost' | 'limit'>> = {}
): TriggerRow {
  return { title, text, source, event: event as unknown as TriggerEvent, steps, may: false, ...extra };
}

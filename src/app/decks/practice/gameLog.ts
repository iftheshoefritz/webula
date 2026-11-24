// The game log of the practice table (#1065): a readable record of the actions that changed the
// game, grouped by turn. It lives next to the table state and not inside it. The saved game (#976)
// holds its entries (#1400), so a reload keeps the log, and a restore brings it back. A new deal
// and a reset each start an empty log.
//
// The entries are structured data. `logEntryText` and `gameLogText` turn them into text, so the
// wording can change without a change to the stored entries. An entry holds only what the text
// needs: the display names of the cards, captured when the action ran, and never a card id that
// must be looked up later, or the order a shuffle made.
//
// Beside each entry the log keeps the table from just before its action, for undo (#1194), and an
// undone entry keeps the table its action left, for redo (#1403).
// Those snapshots are the structured record of every random result: the order a shuffle replaced
// and the faces a shuffle of the dilemma pile turned down. The text never reads them, so the UI
// never shows them. In memory they are whole tables. The page saves them as the changes between
// neighbouring tables, under a key of their own (#1401, `gameHistory.ts`), so a reload keeps undo
// and redo.

import { cardDisplayName } from '../../../lib/cardCount';
import {
  applyResolveChange,
  CardInstance,
  cardsAt,
  drawReshuffles,
  shuffledIds,
  findInstanceAnywhere,
  MoveTarget,
  moveRangeCost,
  ReorderZone,
  AttemptPhase,
  TurnSegment,
  TURN_SEGMENTS,
  ResolveNote,
  ResolveOp,
  resolvableSnapshot,
  TableAction,
  TableState,
  TableZone,
  tableReducer,
  Zone,
} from './tableReducer';
import { drawSpend, drawSpendText } from './drawSpend';
import { shipRangeOnTable } from './shipRange';
import { drawWarningsOf, ruleNamedFirst, ruleWarningsIn, ruleWarningsOf, ruleWarningText, type RuleWarning } from './playRules';
import { revealPicksOf } from './attempt';
import { completionEffectOf, involvedSpecies } from './completionEffects';
import { CostDestination, CostPlace, costPlayOf, drawCharge, moveCharge, printedCost } from '../../../lib/playCost';
import { resolveModelOf, resolveStagesOf } from '../../../lib/resolveModels';
import { PlayConditionState, PlayConditionStatus, PlayModel, playConditionOf, playModelOf, playStagesOf } from '../../../lib/playModels';
import { costNeedsPick, costPickCount, OrderModel, orderModelOf, orderStagesOf } from '../../../lib/orderModels';
import { withinUseLimit, type UseLimit } from '../../../lib/useLimit';
import { orderCardOf, orderCardsOf, OrderCard, orderCostCandidates } from './orders';
import {
  downloadPlaceShips,
  downloadPlayCost,
  downloadTakes,
  DownloadTo,
  drawUpToCount,
  drawWanted,
  EffectStage,
  EffectStep,
  examineCount,
  examineTakeMax,
  examineTakeMin,
  examineTakes,
  discardableFromHand,
  handCount,
  stagesOf,
  stepOf,
} from '../../../lib/effectSteps';
import { triggerRowsOf, type TriggerRow } from '../../../lib/triggers';
import { pendingTriggersOf, sameTriggerTarget } from './triggers';
import { attemptAbilitiesOf, modifyStepOf } from './attemptAbilities';
import { changesText, killsAtEndOfTurn } from '../../../lib/attemptAbilities';
import type { AmountQuantity } from '../../../lib/modifiers/model';
import { choiceDiscardTop, isCostUse, isCountedChoice, isDownloadChoice, isPersonnelChoice } from '../../../lib/costModels/model';
import { cardHasIcon, chosenPersonnel, downloadCopyOf, exchangeCandidatesOf, exchangeMatches, personnelCandidateGroups, personnelChoiceDelta } from './personnelChoice';
import type { CostSource, CostTurnPlay, CostUse, CostUseEffect, LimitCap, LimitGrant, PendingDiscount, TurnLimitChoice } from '../../../lib/costModels/model';
import { cappedLimit, firstTurnGrantsOf, limitCapsOf, limitGrantsOf, pendingDiscountOf, turnChoicesOf } from '../../../lib/costModels/registry';
import { costFactsOf, slotQuadrantOf, turnPlayOf } from './costFacts';
import { playPasses } from '../../../lib/tableView';
import {
  EARTH_PLAY_TEST,
  EARTH_SPEND_COST,
  EARTH_SPEND_DRAW,
  EARTH_SPEND_LIMIT,
  EARTH_TITLE,
  isNimbusPersonnel,
  MissionSpendKind,
  NIMBUS_SPEND_COST,
  nimbusSpendOf,
  slotsTitled,
} from './missionSpends';

// A place a card can be, with the names the text needs captured at the time of the action, so a
// later move of a ship or a mission card does not change an old entry.
export type LogPlace =
  | { kind: Zone }
  | { kind: 'missions' }
  | { kind: 'shipRow'; mission: string }
  | { kind: 'crew'; ship: string }
  | { kind: 'awayTeam'; mission: string }
  | { kind: 'underMission'; mission: string }
  | { kind: 'on'; card: string };

// A card's display name, or null for a card the player did not see: the text says "a card".
export type LogCard = string | null;

export interface LogMove {
  cards: LogCard[];
  from: LogPlace;
  to: LogPlace;
  // Only for the draw deck and the dilemma pile, the two places whose order the player sees.
  position?: 'top' | 'bottom';
  // A move of ships from one mission's ship row to another's (#1634): the range each ship used,
  // in the order of `cards`, and its printed Range less all it has used this turn, below 0 when
  // over. Absent for every other move.
  range?: LogRange[];
  // The cost of each card played in the play and draw segment (#1606, #1698), in the
  // order of `cards`, null for a card that was not a play. Absent when no card of the move was one.
  costs?: (number | null)[];
  // The source of each cost the table suggested (#1654), in the order of `cards`, null for a printed
  // cost or a card that was not a play. Absent when no cost of the move had one, and in an entry from
  // before #1654.
  sources?: (CostSource | null)[];
  // The traits of each played card that a standing rule tests (#1703), in the order of `cards`, null
  // for a card that was not a play. Present with `costs`; absent in an entry from before #1703.
  plays?: (CostTurnPlay | null)[];
  // The uses the cards on the table offered for each played card (#1713), in the order of `cards`, null
  // for a card with none. Absent when no card of the move had one.
  uses?: (CostUse[] | null)[];
  // The cards of the move that the same action removed from the game (#1730): the resolving event that
  // Resolved → Remove from game sends to the discard pile, marked. Absent for every other move.
  removedFromGame?: true;
  // The record of each played card's "when you play" effect (#1800), in the order of `cards`, null for a card
  // with none. Each step of the effect amends the play's own entry, so the play and its effect are one entry
  // and one undo. Absent when no card of the move has a record.
  effects?: (PlayEffectRecord | null)[];
  // The card the moved card named (#1789), "Wavefront": Self-Replicating Roadblock's name, which amends
  // the move that placed it on a mission card, so the placement and its name are one entry and one undo.
  named?: string;
  // The play rules the move broke (#1821), recorded while "Check uniqueness and limits" was on: "Unique:
  // Data is already in play". Absent when it broke none, and in an entry from before #1821.
  warnings?: RuleWarning[];
}

// The names of the stages a record holds (#1863), by the kind of the stage's first step (`recordStepName`).
export type EffectRecordStepName = 'draw' | 'discard' | 'bottom' | 'examine' | 'download' | 'shuffle' | 'score' | 'exchange' | 'kill';

// What the steps of a stage did after its first (#1863): the cards an automatic draw drew, and whether the draw
// deck was shuffled. A download is read as shuffled unless `shuffled` is false, as every download before #1863 was.
interface EffectStepTail {
  drew?: number;
  shuffled?: boolean;
  /** The cards a `discardTop` step sent from the top of the draw deck to the discard pile (#1904, Quintessence). */
  discardedTop?: number;
}

// The record of one stage of an effect (#1800, #1863), the same for a "when you play" effect and a resolving
// event: the cards it drew, the names of the cards it discarded, or the stage skipped.
export type EffectStepRecord = EffectStepTail &
  (
    // A draw: the personnel whose printed cost set it (#1739), for These Are The Voyages.
    | { step: 'draw'; count: number; personnel?: string; personnelCost?: number }
    | { step: 'discard'; cards: string[] }
    // The cards of the hand that went to the bottom of the draw deck (#1739).
    | { step: 'bottom'; count: number }
    // The examine of the top of the draw deck (#1809): the names of the cards it took into hand, and how many it
    // placed on the bottom.
    | { step: 'examine'; taken: string[]; bottom: number }
    // The download (#1810): the names of the cards it took. A download to a place (#1811) names where the card
    // went, "aboard Attack Ship" or "on top of the draw deck"; a play aboard the played ship is a move of its own in
    // the same entry. A copy of a commanded personnel (#1746) names that personnel, `copyOf`.
    | { step: 'download'; cards: string[]; placed?: string; copyOf?: string }
    | { step: 'shuffle' }
    // The points a score step added (#1812), after the clamp of the score.
    | { step: 'score'; points: number }
    // An exchange (#1765): the hand's personnel and the table's; `replaced` when the table's went to the discard pile.
    | { step: 'exchange'; fromHand: string; fromTable: string; replaced?: true }
    | { step: EffectRecordStepName; skipped: true }
  );

/** The record of one stage of a "when you play" effect (#1800), the generic record of #1863. */
export type PlayEffectStepRecord = EffectStepRecord;

// What a played card's "when you play" effect did so far (#1800): whether its condition held when the first
// step ran, and its steps in order. The effect is done once every step of its model is here.
export interface PlayEffectRecord {
  condition?: PlayConditionStatus;
  steps: PlayEffectStepRecord[];
}

// What the effect of a completion did (#1757).
export interface CompletionLog {
  moves?: LogMove[];
  shuffled?: LogPlace;
  flipped?: true;
  // Cheron (#1828): the different species involved, counted at the completion, and the points it scored.
  species?: number;
  scored?: number;
  // Ba'ku Planet (#1909): the personnel the completion killed, by name, in the order picked. Its moves are kills.
  killed?: string[];
}

export interface LogRange {
  used: number;
  left: number;
}

// `segment` (#1605) is the segment of the turn after the action, as `turn` is; an entry from before
// #1605 has none and reads as play and draw.
export type LogEntry = { turn: number; segment?: TurnSegment } & (
  // A draw that reached a face-up dilemma shuffled the dilemma pile first (#1283), and `shuffled`
  // says so.
  // `cost` is the 1 counter a draw from the draw deck costs in the play and draw segment (#1606).
  | {
      kind: 'draw';
      from: 'drawDeck' | 'dilemmaPile';
      to: 'hand' | 'dilemmaHand';
      shuffled?: true;
      cost?: number;
      // The play rules a charged draw broke (#1916): Rule of Acquisition #6's "You cannot spend counters to draw cards".
      warnings?: RuleWarning[];
    }
  // One player action, so one entry, even when its cards went to more than one place (a group
  // dropped on a mission sends a ship to the ship row and a personnel to the away team). A
  // download shuffles the pile after its moves, and `shuffled` names it.
  // A play of a "when you play" effect after a correction of its charge (#1811, the Enterprise's play aboard
  // itself) records the step in `effectOf`, the play it belongs to, so the step and the second play are one
  // entry and one undo.
  | { kind: 'move'; moves: LogMove[]; shuffled?: LogPlace; effectOf?: { target: ChargeTarget; card: string; effect: PlayEffectRecord } }
  | { kind: 'flip'; cards: { name: string; face: 'up' | 'down' }[] }
  | { kind: 'flipMission'; mission: string; flipped: boolean }
  | { kind: 'shuffle'; place: LogPlace }
  | { kind: 'reorder'; zone: ReorderZone }
  | { kind: 'stopped'; cards: string[]; stopped: boolean }
  | { kind: 'removedFromGame'; cards: string[]; removedFromGame: boolean }
  // A completion with its effect on the player's cards (#1757) names what the effect did: its moves, the
  // shuffle after them, and the flip of the mission. Absent for a plain completion.
  | { kind: 'missionCompleted'; mission: string; completed: boolean; effect?: CompletionLog }
  | { kind: 'nextTurn' }
  // "Draw 7" drew the opening hand (#1736), `count` cards, at no cost.
  // `grants`: the grants of the cost models to the first turn's limit (#1755, Ledos), decided at the tap
  // and kept here, so a later change to the table leaves them, and an undo of the tap takes them back.
  | { kind: 'openingHand'; count: number; grants?: LimitGrant[] }
  // The next-turn button moved the turn to another segment of the same turn (#1605).
  | { kind: 'segment'; to: TurnSegment }
  | { kind: 'score'; delta: number; score: number }
  // A mission attempt (#1163): the ship only at a space mission.
  // The draw and the spend (#1759), the mission's changes and the cards Rigel X drew; an entry from
  // before #1759 has none of them, and reads as N.
  | {
      kind: 'attemptStarted';
      mission: string;
      ship?: string;
      personnel: number;
      subtract: number;
      draw?: number;
      spend?: number;
      changes?: string[];
      drewCards?: number;
      downloaded?: string;
    }
  // The dilemmas still in the stack that Attempt done moved under the mission (#1170), when any.
  | { kind: 'attemptEnded'; mission: string; moved?: string[] }
  // A change of the attempt's phase (#1189). Choose -> face names the dilemmas it sent from the
  // dilemma hand to the bottom of the dilemma pile, when any.
  | { kind: 'attemptPhase'; mission: string; phase: AttemptPhase; returned?: string[] }
  // Start in a bot game (#1299): the bot's draw and its stack, counted and never named, since the
  // stack is face down. `returned` counts the drawn dilemmas the bot did not choose, which went to the
  // bottom of the dilemma pile face up, and never names them: the player does not see them (#1561). A
  // log saved before #1561 holds their names, and the text gives only how many. `redrew` counts the
  // dilemmas the bot put back with Unexpected Difficulties before it drew again (#1563).
  | {
      kind: 'botAttempt';
      mission: string;
      ship?: string;
      personnel: number;
      subtract: number;
      draw?: number;
      spend?: number;
      changes?: string[];
      drewCards?: number;
      downloaded?: string;
      drew: number;
      stacked: number;
      random?: true;
      returned?: number | string[];
      redrew?: number;
    }
  // The effects of a bot game's revealed dilemma (#1587): the cards of each op the table applied, in
  // the action's order, and the notes the page gave.
  // `modifiers`: what the dilemma changed for the rest of the attempt (#1598), "abilities off for the rest of the attempt".
  // `went`: where the dilemma went (#1599), "goes under Bilana System", only when it left the stack.
  // `selected` and `checks`: the steps of a kept roll (#1629), the names of each random select and of
  // the personnel who met each check, captured at dispatch. An entry from before #1629 has neither.
  // `warnings`: the limit its placement broke (#1821), only when it left the stack.
  | {
      kind: 'dilemmaResolved';
      dilemma: string;
      warnings?: RuleWarning[];
      selected?: string[][];
      checks?: ResolveCheck[];
      ops: { op: ResolveOp; cards: string[] }[];
      notes?: ResolveNote[];
      modifiers?: string;
      went?: string;
      // What the Resolve did to the stack (#1600): the card it put on top, and how many of the rest
      // returned to the dilemma pile.
      added?: string;
      restReturned?: number;
      // The mission's cost change overcame it over the spend (#1760), "Stakoron II raised the cost past
      // the spend", and how many of the rest went beneath the mission with it.
      overcome?: string;
      restUnder?: number;
      // The card that prevented and overcame it (#1761), "Sigma Iotia II".
      prevented?: string;
      // The card whose name returned it to the dilemma pile (#1789), "Self-Replicating Roadblock".
      returned?: string;
    }
  // A correction of one charge by the player (#1607): `target` names the charge, `card` its card
  // (null for an unseen card, absent for a draw), `from` and `to` the cost before and after.
  // `source` is the title of the model whose choice the player took (#1654), "Goran". `count` is the
  // count of a counted choice (#1695), and `counted` the label of what it counts. `used` is the card on
  // the table whose use made the correction (#1713): its instance id, its name and what the use did to it.
  | {
      kind: 'chargeCorrected';
      target: ChargeTarget;
      card?: LogCard;
      draw?: true;
      from: number;
      to: number;
      source?: string;
      count?: number;
      counted?: string;
      used?: LogUsedCard;
      // The dilemma title a `nameDilemma` choice named (#1761): "Tristan Adams" names "Wavefront".
      named?: string;
      // The cards a `discardTop` choice discarded from the top of the draw deck (#1744), top first.
      discarded?: string[];
      // The top card of the draw deck a `revealTop` use revealed (#1763), and whether it is a Dissident
      // personnel, decided at the reveal, so the play from the draw deck it allows reads from the log alone.
      revealed?: { id: string; name: string; dissident: boolean };
    }
  // A change of the turn's limit of counters by the player (#1607), and the limit it left.
  // `source` names the model whose choice raised the limit (#1655), "Tricia Jenkins", and `target` the
  // charge of the play that offered it. `stopped` names the personnel a choice of personnel stopped
  // (#1712), Common Purpose's, and `affiliations` their different affiliations.
  | {
      kind: 'counterLimit';
      delta: number;
      limit: number;
      source?: string;
      target?: ChargeTarget;
      stopped?: string[];
      affiliations?: number;
    }
  // The player dismissed a pending discount (#1656): `target` names the charge of the play that made
  // it, `source` the model's name, "Sarish Rez".
  | { kind: 'discountDismissed'; target: ChargeTarget; source: string }
  | { kind: 'eventsDownloaded'; target: ChargeTarget; source: string; cards: { id: string; name: string }[] }
  // A Cancel of the resolving event (#1728): the event went back to the hand, and `target` names the
  // charge of its play, absent for a move into the resolving zone that charged nothing. The effective
  // log reads that play as no play from then on.
  // A recalled event (#1764) went back to the discard pile instead: `returnedTo` is `'discard'`.
  | { kind: 'playCancelled'; card: string; target?: ChargeTarget; returnedTo?: 'discard' }
  // The free draw of the resolving event's text (#1739): `count` cards drawn, and the personnel whose
  // printed cost set it, for These Are The Voyages. No counter is charged.
  | { kind: 'resolveDrew'; event: string; count: number; personnel?: string; personnelCost?: number }
  // The last step of the resolving event's text (#1739): `count` cards of the hand went to the bottom of
  // the draw deck, and the event to the discard pile.
  // A recalled event (#1764) was removed from the game instead (`removed`), here and in the three below.
  | { kind: 'resolveBottom'; event: string; count: number; removed?: true }
  // The one step of a "discard a card from hand to draw" event (#1745): `discarded` went from the hand to the
  // discard pile, `count` cards were drawn free, and the event went to the discard pile.
  | { kind: 'resolveDiscardDraw'; event: string; discarded: string; count: number; removed?: true }
  // The one step of Second Edition (#1746): a copy of `personnel` downloaded from the draw deck, the deck
  // shuffled, `count` cards drawn free (1 for an [AU] personnel), and the event to the discard pile.
  | { kind: 'resolveDownloaded'; event: string; personnel: string; count: number; removed?: true }
  | { kind: 'resolveExchanged'; event: string; fromHand: string; fromTable: string; removed?: true; replaced?: true }
  // One stage of the resolving event's resolve model (#1863), the generic entry that replaces the five above for a
  // new game: `step` is what the stage did, and `ended` that it was the last, so the event went to the discard
  // pile (or, recalled, was removed from the game: `removed`).
  | { kind: 'effectStep'; event: string; step: EffectStepRecord; ended?: true; removed?: true }
  // A spend of counters a mission's text allows (#1754): Earth's "spend a counter to draw two cards",
  // `drew` cards drawn, or Nimbus III's "spend three counters to download …", `downloaded` the card that
  // went into its away team. `cost` is the charge, which the chip and the list correct as any other.
  | { kind: 'missionSpend'; mission: string; spend: MissionSpendKind; cost: number; drew?: number; downloaded?: string }
  // Steps of a "when you play" effect (#1800) that could not amend the play's entry, because a correction of a
  // charge came after it: the play at `target`, its card, and the steps of this entry. Its undo takes back
  // those steps only.
  | { kind: 'playEffect'; target: ChargeTarget; card: string; effect: PlayEffectRecord }
  // A card named a card after its placement's entry (#1789): Self-Replicating Roadblock on the mission
  // card `on`, named again from the panel, or named after another action.
  | { kind: 'cardNamed'; card: string; named: string; on?: string }
  // Let's Try That Again, Shall We? (#1847): the event `card` went to the discard pile, and the revealed
  // `dilemma` selected again.
  | { kind: 'selectedAgain'; card: string; dilemma: string }
  // Dessert Disaster (#1847): the interrupt `card` went to the discard pile, and `to` took the place of
  // `from` in the selection of the revealed `dilemma`.
  | { kind: 'pickReplaced'; card: string; dilemma: string; from: string; to: string }
  // An order of a card on the table (#1866): the card's instance id and name, which of its orders, what the cost
  // did, and the record of its steps. Each stage of the order amends this entry while it is the last of the log,
  // so the cost and every step are one entry and one undo.
  | { kind: 'orderUsed'; id: string; card: string; order: number; cost?: OrderCostRecord; effect: PlayEffectRecord }
  // Stages of an order that could not amend its entry, because another entry came after it: the order's entry
  // `target`, its card, and the stages of this entry. Its undo takes back those stages only.
  | { kind: 'orderEffect'; target: number; card: string; effect: PlayEffectRecord }
  // A trigger the player took (#1903): the offer at `target`, its card's name and the record of its steps. No
  // action makes it yet; `pendingTriggersOf` reads it, so a taken offer is no offer.
  // `useTrigger` (#1904) writes it: the use cost (`cost`), then each stage amends it while it is the last entry.
  | { kind: 'triggerUsed'; target: TriggerTarget; card: string; cost?: TriggerCostRecord; effect: PlayEffectRecord }
  // Stages of a taken trigger that could not amend its entry, because another entry came after it (#1904): the
  // offer at `target`, its card, and the stages of this entry. Its undo takes back those stages only.
  | { kind: 'triggerEffect'; target: TriggerTarget; card: string; effect: PlayEffectRecord }
  // A trigger the player skipped (#1903, `skipTrigger` of #1904): the offer at `target` and its card's name, so the
  // skip is undone and survives a reload.
  | { kind: 'triggerSkipped'; target: TriggerTarget; card: string }
  // An attempt ability the player used (#1835): the card's id and name, the ability's index, the name of the card it
  // changed and the change, for the rest of the attempt, and whether it set up the kill at the end of the turn, which
  // the delayed trigger rows read (`afterAbility`).
  | {
      kind: 'attemptAbilityUsed';
      id: string;
      card: string;
      ability: number;
      target: string;
      changes: Partial<Record<AmountQuantity, number>>;
      killAtEndOfTurn?: true;
    }
);

// One trigger offer of the log (#1903), addressed as `ChargeTarget` addresses a play: the index of the action's
// entry, the instance id of the source card (`botDeck` for the bot's deck), the row among its title's rows, and the
// event among the entry's events.
export interface TriggerTarget {
  entry: number;
  source: string;
  row: number;
  event: number;
}

// What the use cost of a trigger did (#1904): its card destroyed or discarded, its card stopped, or the names of the
// cards of the hand it discarded.
export interface TriggerCostRecord {
  destroyed?: true;
  // The source was killed (#1835).
  killed?: true;
  stopped?: true;
  discarded?: string[];
}

// What the cost of an order did (#1866): the names of the cards it discarded, stopped, or placed on the bottom
// of the draw deck.
export interface OrderCostRecord {
  discarded?: string[];
  stopped?: string[];
  placed?: string[];
}

// The card on the table a use acted on (#1713).
export interface LogUsedCard {
  id: string;
  name: string;
  effect: CostUseEffect;
}

// One charge of the log (#1607): the index of its entry in the log, and for a move entry the move and
// the card within it. An index is stable: undo only drops the last entry, so the entry a correction
// names can go only after the correction has gone, redo puts the entries back in their order, and a
// reset empties the log.
export interface ChargeTarget {
  entry: number;
  move?: number;
  card?: number;
}

// One check of a resolved dilemma (#1629): the test's text and the names of the personnel who met it.
// `subject`: a test of the selected personnel together, `all` when they passed it.
export interface ResolveCheck {
  text: string;
  met: string[];
  subject?: string;
  all?: true;
}

// Several table actions that are one player action (#1065): a group drag, a selection's Discard,
// Flip or Download. They apply through `tableReducer` in order, the same as one dispatch each, and
// make one entry. `unseen` says the player did not see the cards' faces: a drag that showed the
// card back (#814).
// `undo` (#1194) takes back the player action of the last log entry, and makes no entry of its own.
// `redo` (#1403) does again the last action that undo took back.
export type GameAction =
  | TableAction
  | { type: 'batch'; actions: TableAction[]; unseen?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  // A correction of a charge, and a change of the turn's limit of counters (#1607). They read the
  // log, so `gameReducer` handles them and `tableReducer` never sees them.
  // `source` names the model whose choice sets the cost (#1654), and `count` the count of its counted
  // choice (#1695).
  // `named`: the dilemma title a `nameDilemma` choice names (#1761), Tristan Adams's.
  | { type: 'correctCharge'; target: ChargeTarget; cost: number; source?: string; count?: number; named?: string }
  // `source` and `target` name the model whose choice changes the limit and its play's charge (#1655).
  | { type: 'adjustCounterLimit'; delta: number; source?: string; target?: ChargeTarget }
  // A dismiss of the pending discount the play at `target` made (#1656), a log entry like a correction.
  | { type: 'dismissDiscount'; target: ChargeTarget }
  // A choice of personnel of the play at `target` (#1712), Common Purpose's: stop the chosen personnel
  // and raise the turn's limit by their different affiliations, in one entry that one undo takes back.
  | { type: 'choosePersonnel'; ids: string[]; source: string; target: ChargeTarget }
  | { type: 'downloadForCharge'; ids: string[]; source: string; target: ChargeTarget; order?: string[] }
  // A use of the card `id` on the table for the play at `target` (#1713), Delivery Boy's: the cost change
  // and the card's own part, a destroy or a stop, in one entry that one undo takes back.
  | { type: 'useCard'; target: ChargeTarget; id: string }
  // A `discardTop` choice of the play at `target` (#1744), Type III Galor's: the top cards of the draw deck
  // go to the discard pile and the cost changes, in one entry that one undo takes back.
  | { type: 'discardForCharge'; target: ChargeTarget; source: string }
  // A Cancel of the resolving event (#1728): it goes back to the end of the hand (a recalled event, #1764,
  // to the discard pile), and its play's charge is refunded, in one entry that one undo takes back.
  | { type: 'cancelResolving' }
  // The next stage of the effect being resolved (#1863): the resolving event's resolve model, or with nothing
  // resolving the pending "when you play" effect. One action for every stage, which carries the stage's input:
  // `count` for a draw of up to N, `personnelId` for a draw of a personnel's cost or a copy to download, `ids`
  // for cards of the hand (in order for the bottom) or of the draw deck to download, `take` and `bottom` for an
  // examine, `shipId` for a download aboard a ship, `handId` and `tableId` for an exchange; `order` for a stage
  // that shuffles the draw deck and `ruleWarnings` for a play aboard a ship, which `withShuffleOrders` fills.
  // Each stage is one entry that one undo takes back, or amends the play's own entry.
  | ({ type: 'effectStep' } & EffectStepInput)
  // Skip and Done of the pending "when you play" effect: every stage left is recorded as skipped.
  | { type: 'effectSkip' }
  // An order of the card `id` on the table (#1866), its `order`-th: the cost, with `ids` the cards its pick took,
  // and one `orderUsed` entry, whose steps then run as the pending order's stages.
  | { type: 'useOrder'; id: string; order: number; ids?: string[] }
  // A take of the trigger offer at `target` (#1904): its use cost, with `ids` the cards of the hand a discard takes,
  // then the stages that need no input, in one `triggerUsed` entry; a stage that needs input is then the pending
  // trigger's, which `effectStep` and `effectSkip` drive.
  | { type: 'useTrigger'; target: TriggerTarget; ids?: string[] }
  // A skip of the trigger offer at `target` (#1904): one `triggerSkipped` entry, undone like any other.
  | { type: 'skipTrigger'; target: TriggerTarget }
  // A use of the attempt ability `index` of the card `id` (#1835): its change for the rest of the attempt on
  // `Attempt.timed`, in one `attemptAbilityUsed` entry, which also sets up its delayed kill.
  | { type: 'useAttemptAbility'; id: string; index: number }
  // A spend of counters a mission allows (#1754), one entry that one undo takes back: Earth's draw of 2,
  // or Nimbus III's download of the card `id` into its away team, then the shuffle of the draw deck in
  // `order`, which `withShuffleOrders` chooses.
  | { type: 'missionSpend'; spend: 'earth'; slot: number }
  | { type: 'missionSpend'; spend: 'nimbus'; slot: number; id: string; order?: string[] }
  // A restore of the saved game (#1400) that brings its log back too, and its undo and redo
  // histories (#1401).
  | { type: 'restore'; state: TableState; log?: LogEntry[]; undo?: TableState[]; redo?: RedoStep[] };

export interface GameState {
  table: TableState;
  log: LogEntry[];
  // The table from just before the action of each of the last entries of `log`, in the same order.
  // A restored log (#1400) has no snapshots, so `undo` can be shorter than `log`: its last snapshot
  // belongs to the last entry, and undo goes back to it.
  undo: TableState[];
  // The steps undo took back, the last undone last: each its entry and the table its action left.
  // Redo puts that table back, and never runs the action again, so a redone shuffle keeps its order.
  redo: RedoStep[];
}

export interface RedoStep {
  entry: LogEntry;
  table: TableState;
}

// The draw and the spend an attempt started with (#1759), and the cards Rigel X drew into the hand.
// `downloadId`: the card Caldos IV downloaded as the attempt began (#1828), which is no draw.
const attemptStartFields = (
  before: TableState,
  after: TableState,
  downloadId?: string
): { draw?: number; spend?: number; drewCards?: number; downloaded?: string } => {
  const downloaded = downloadId ? before.drawDeck.find((c) => c.id === downloadId) : undefined;
  const got = downloaded && after.hand.some((c) => c.id === downloadId) ? downloaded : undefined;
  const drewCards = after.hand.length - before.hand.length - (got ? 1 : 0);
  return {
    ...(after.attempt ? { draw: after.attempt.draw, spend: after.attempt.spend } : {}),
    ...(drewCards > 0 ? { drewCards } : {}),
    ...(got ? { downloaded: cardDisplayName(got.card) } : {}),
  };
};

// "12 personnel − 3 = draw/spend 9", then the mission's changes and Rigel X's draw (#1759). An entry
// from before #1759 has no draw and spend, and reads as N.
const attemptNumbersText = (entry: {
  personnel: number;
  subtract: number;
  draw?: number;
  spend?: number;
  changes?: string[];
  drewCards?: number;
  downloaded?: string;
}): string => {
  const n = drawSpend(entry.personnel, entry.subtract);
  const draw = typeof entry.draw === 'number' ? entry.draw : n;
  const spend = typeof entry.spend === 'number' ? entry.spend : n;
  const notes = [
    ...(Array.isArray(entry.changes) ? entry.changes : []),
    ...(typeof entry.drewCards === 'number' && entry.drewCards > 0
      ? [`drew ${entry.drewCards} ${entry.drewCards === 1 ? 'card' : 'cards'}`]
      : []),
    ...(typeof entry.downloaded === 'string' ? [`downloaded ${entry.downloaded}, shuffled the draw deck`] : []),
  ];
  return `${entry.personnel} personnel − ${entry.subtract} = ${drawSpendText(draw, spend)}${notes.length ? ` (${notes.join('; ')})` : ''}`;
};

const missionName = (state: TableState, index: number): string => {
  const mission = state.missions[index]?.mission;
  return mission ? cardDisplayName(mission.card) : `Mission ${index + 1}`;
};

// Where a resolved dilemma went (#1599), for the log, from the target of its move.
function wentText(state: TableState, to: MoveTarget, position?: 'top' | 'bottom'): string {
  if (to === 'core') return 'goes to your core';
  if (to === 'dilemmaPile') return position === 'top' ? 'goes on top of the dilemma pile' : 'returns to the dilemma pile';
  if (typeof to === 'object' && to.zone === 'missionPile') {
    const mission = state.missions[to.missionIndex]?.mission;
    return `goes under ${mission ? cardDisplayName(mission.card) : 'the mission'}`;
  }
  if (typeof to === 'object' && to.zone === 'on') return `is placed on ${cardName(state, to.targetId)}`;
  return 'leaves the stack';
}

const cardName = (state: TableState, id: string): string => {
  const found = findInstanceAnywhere(state, id);
  return found ? cardDisplayName(found.instance.card) : 'a card';
};

// The place of a card or a move target, read from the table before the action.
export function logPlace(state: TableState, zone: TableZone): LogPlace {
  if (zone === 'missions') return { kind: 'missions' };
  if (typeof zone === 'string') return { kind: zone };
  switch (zone.zone) {
    case 'shipRow':
      return { kind: 'shipRow', mission: missionName(state, zone.missionIndex) };
    case 'crew':
      return { kind: 'crew', ship: cardName(state, zone.shipId) };
    case 'missionPile':
      return { kind: zone.pile, mission: missionName(state, zone.missionIndex) };
    case 'on':
      return { kind: 'on', card: cardName(state, zone.targetId) };
  }
}

// A key per place, to tell a drop back in the card's own place, and to group moves.
const tableZoneKey = (zone: TableZone): string => {
  if (typeof zone === 'string') return zone;
  switch (zone.zone) {
    case 'shipRow':
      return `shipRow-${zone.missionIndex}`;
    case 'crew':
      return `crew-${zone.shipId}`;
    case 'missionPile':
      return `missionPile-${zone.missionIndex}-${zone.pile}`;
    case 'on':
      return `on-${zone.targetId}`;
  }
};

const placeKey = (place: LogPlace): string => JSON.stringify(place);

const ORDERED_PLACES: ReadonlySet<MoveTarget> = new Set<MoveTarget>(['drawDeck', 'dilemmaPile']);

// The moves of one player action, with every move that changed nothing left out: a refused move,
// and a drop back in the card's own place (which only reorders an unordered zone).
// `removed` names the cards the same action removed from the game (#1730), each in a group of its own.
function moveEntry(
  before: TableState,
  moves: Extract<TableAction, { type: 'move' }>[],
  unseen: boolean,
  removed: ReadonlySet<string> = new Set()
): LogMove[] {
  const groups: LogMove[] = [];
  let state = before;
  for (const move of moves) {
    const found = findInstanceAnywhere(state, move.id);
    const next = tableReducer(state, move);
    if (found && next !== state && tableZoneKey(found.zone) !== tableZoneKey(move.to)) {
      const from = logPlace(state, found.zone);
      const to = logPlace(state, move.to);
      const position = ORDERED_PLACES.has(move.to) ? move.position ?? 'bottom' : undefined;
      const card = unseen ? null : cardDisplayName(found.instance.card);
      const used = moveRangeCost(state, found.zone, move.to, found.instance, !!move.cardText);
      // The Range is the ship's on the table after the move (#1635), as its card shows it.
      const range =
        used === undefined
          ? undefined
          : { used, left: shipRangeOnTable(next, found.instance, !!move.cardText) - (next.rangeUsed?.[move.id] ?? 0) };
      const cost = typeof move.cost === 'number' ? move.cost : null;
      const source = cost !== null && move.costSource ? move.costSource : null;
      const landed = cost !== null ? findInstanceAnywhere(next, move.id) : null;
      const play =
        cost !== null
          ? turnPlayOf(found.instance.card, landed ? slotQuadrantOf(next, costDestination(next, landed.zone).missionIndex) : undefined)
          : null;
      const uses = cost !== null && move.costUses?.length ? move.costUses : null;
      const removedFromGame = removed.has(move.id);
      const warnings = move.ruleWarnings?.length ? move.ruleWarnings : null;
      const group = groups.find(
        (g) =>
          placeKey(g.from) === placeKey(from) &&
          placeKey(g.to) === placeKey(to) &&
          g.position === position &&
          !!g.removedFromGame === removedFromGame
      );
      if (group) {
        if (cost !== null || group.costs) group.costs = [...(group.costs ?? group.cards.map(() => null)), cost];
        if (source || group.sources) group.sources = [...(group.sources ?? group.cards.map(() => null)), source];
        if (play || group.plays) group.plays = [...(group.plays ?? group.cards.map(() => null)), play];
        if (uses || group.uses) group.uses = [...(group.uses ?? group.cards.map(() => null)), uses];
        group.cards.push(card);
        if (range) group.range = [...(group.range ?? []), range];
        if (warnings) group.warnings = [...(group.warnings ?? []), ...warnings];
      } else
        groups.push({
          cards: [card],
          from,
          to,
          ...(position ? { position } : {}),
          ...(range ? { range: [range] } : {}),
          ...(cost !== null ? { costs: [cost] } : {}),
          ...(source ? { sources: [source] } : {}),
          ...(play ? { plays: [play] } : {}),
          ...(uses ? { uses: [uses] } : {}),
          ...(removedFromGame ? { removedFromGame: true as const } : {}),
          ...(warnings ? { warnings: [...warnings] } : {}),
        });
    }
    state = next;
  }
  // A 'top' drop dispatches its group in reverse (#677), so the cards read in the group's order.
  return groups.map((g) =>
    g.position === 'top'
      ? {
          ...g,
          cards: [...g.cards].reverse(),
          ...(g.costs ? { costs: [...g.costs].reverse() } : {}),
          ...(g.sources ? { sources: [...g.sources].reverse() } : {}),
          ...(g.plays ? { plays: [...g.plays].reverse() } : {}),
          ...(g.uses ? { uses: [...g.uses].reverse() } : {}),
        }
      : g
  );
}

function flipEntry(before: TableState, flips: Extract<TableAction, { type: 'flip' }>[]) {
  const cards: { name: string; face: 'up' | 'down' }[] = [];
  let state = before;
  for (const flip of flips) {
    const next = tableReducer(state, flip);
    const found = next !== state ? findInstanceAnywhere(next, flip.id) : null;
    if (found) cards.push({ name: cardDisplayName(found.instance.card), face: found.instance.face });
    state = next;
  }
  return cards;
}

type EntryBody = LogEntry extends infer E ? (E extends LogEntry ? Omit<E, 'turn' | 'segment'> : never) : never;

function singleEntry(before: TableState, action: TableAction, after: TableState): EntryBody | null {
  switch (action.type) {
    case 'drawCard':
      if (after === before) return null;
      return {
        kind: 'draw',
        from: action.from as 'drawDeck' | 'dilemmaPile',
        to: action.to as 'hand' | 'dilemmaHand',
        ...(drawReshuffles(before, action) ? { shuffled: true as const } : {}),
        ...(typeof action.cost === 'number' ? { cost: action.cost } : {}),
        ...(action.ruleWarnings?.length ? { warnings: [...action.ruleWarnings] } : {}),
      };
    case 'move': {
      const moves = moveEntry(before, [action], false);
      return moves.length ? { kind: 'move', moves } : null;
    }
    case 'selectAgain':
    case 'replacePick': {
      if (after === before) return null;
      const dilemma = cardName(before, before.attempt!.revealSnapshot!.dilemmaId);
      const card = cardName(before, action.type === 'selectAgain' ? action.eventId : action.cardId);
      return action.type === 'selectAgain'
        ? { kind: 'selectedAgain', card, dilemma }
        : { kind: 'pickReplaced', card, dilemma, from: cardName(before, action.from), to: cardName(before, action.to) };
    }
    case 'flip': {
      const cards = flipEntry(before, [action]);
      return cards.length ? { kind: 'flip', cards } : null;
    }
    case 'flipMission': {
      if (after === before) return null;
      const index = after.missions.findIndex((slot) => slot.mission?.id === action.id);
      return { kind: 'flipMission', mission: missionName(before, index), flipped: !!after.missions[index].mission!.flipped };
    }
    case 'shuffle':
      if (cardsAt(before, action.location).length < 2) return null;
      return { kind: 'shuffle', place: logPlace(before, action.location) };
    case 'reorder':
      return after === before ? null : { kind: 'reorder', zone: action.zone };
    case 'setStopped': {
      const cards = action.ids
        .map((id) => findInstanceAnywhere(before, id))
        .filter((found) => found && !!found.instance.stopped !== action.stopped)
        .map((found) => cardDisplayName(found!.instance.card));
      return cards.length ? { kind: 'stopped', cards, stopped: action.stopped } : null;
    }
    case 'setRemovedFromGame': {
      const cards = action.ids
        .map((id) => findInstanceAnywhere(before, id))
        .filter((found) => found && !!found.instance.removedFromGame !== action.removedFromGame)
        .map((found) => cardDisplayName(found!.instance.card));
      return cards.length ? { kind: 'removedFromGame', cards, removedFromGame: action.removedFromGame } : null;
    }
    case 'setMissionCompleted': {
      const slot = before.missions[action.missionIndex];
      if (!slot?.mission || !!slot.completed === action.completed) return null;
      const entry = { kind: 'missionCompleted' as const, mission: missionName(before, action.missionIndex), completed: action.completed };
      // A completion whose effect checks the species involved (#1828, Cheron) records the count, Skip too.
      const scoring = action.completed ? completionEffectOf(before, action.missionIndex) : undefined;
      return scoring?.kind === 'score' && scoring.condition?.kind === 'species'
        ? { ...entry, effect: { species: involvedSpecies(before, action.missionIndex).length } }
        : entry;
    }
    case 'startAttempt':
      if (after === before) return null;
      return {
        kind: 'attemptStarted',
        mission: missionName(before, action.missionIndex),
        ...(action.shipId ? { ship: cardName(before, action.shipId) } : {}),
        personnel: action.personnel,
        subtract: action.subtract,
        ...attemptStartFields(before, after, action.downloadId),
        ...(action.changes?.length ? { changes: [...action.changes] } : {}),
      };
    case 'endAttempt':
      if (after === before || !before.attempt) return null;
      // The dilemmas go under the mission face up, so the log names each one, a face-down one too.
      const moved = before.dilemmaStack.map((c) => cardDisplayName(c.card));
      return {
        kind: 'attemptEnded',
        mission: missionName(before, before.attempt.missionIndex),
        ...(moved.length ? { moved } : {}),
      };
    case 'setAttemptPhase': {
      if (after === before || !before.attempt) return null;
      const returned = action.phase === 'face' ? before.dilemmaHand.map((c) => cardDisplayName(c.card)) : [];
      return {
        kind: 'attemptPhase',
        mission: missionName(before, before.attempt.missionIndex),
        phase: action.phase,
        ...(returned.length ? { returned } : {}),
      };
    }
    case 'botAttempt': {
      if (after === before) return null;
      const stacked = new Set(after.dilemmaStack.map((c) => c.id));
      const returned = action.drawn.filter((id) => !stacked.has(id)).length;
      return {
        kind: 'botAttempt',
        mission: missionName(before, action.missionIndex),
        ...(action.shipId ? { ship: cardName(before, action.shipId) } : {}),
        personnel: action.personnel,
        subtract: action.subtract,
        ...attemptStartFields(before, after, action.downloadId),
        ...(action.changes?.length ? { changes: [...action.changes] } : {}),
        drew: action.drawn.length,
        stacked: stacked.size,
        ...(action.random ? { random: true as const } : {}),
        ...(returned ? { returned } : {}),
        ...(action.redrawn ? { redrew: action.redrawn.length } : {}),
      };
    }
    case 'resolveDilemma': {
      if (after === before || !resolvableSnapshot(before, action.dilemmaId)) return null;
      // Only the cards the table changed: a card that left the row first is skipped, and named nowhere.
      const ops: { op: ResolveOp; cards: string[] }[] = [];
      let state = before;
      for (const { op, ids } of action.changes) {
        const cards: string[] = [];
        for (const id of ids) {
          const next = applyResolveChange(state, op, id);
          if (next !== state) cards.push(cardName(state, id));
          state = next;
        }
        if (cards.length) ops.push({ op, cards });
      }
      const steps = action.steps;
      const names = (ids: string[]) => ids.map((id) => cardName(before, id));
      // As the preview, a select of personnel already selected adds no step.
      const seen = new Set<string>();
      const selects = (steps?.selects ?? []).filter((ids) => {
        const fresh = !ids.length || ids.some((id) => !seen.has(id));
        ids.forEach((id) => seen.add(id));
        return fresh;
      });
      return {
        kind: 'dilemmaResolved',
        dilemma: action.dilemma,
        ...(selects.length ? { selected: selects.map(names) } : {}),
        ...(steps?.checks.length
          ? {
              checks: steps.checks.map((c) => ({
                text: c.text,
                met: names(c.met),
                ...(c.subject ? { subject: c.subject } : {}),
                ...(c.subject && c.met.length && c.met.length === c.ids.length ? { all: true as const } : {}),
              })),
            }
          : {}),
        ops,
        ...(action.notes?.length ? { notes: action.notes } : {}),
        ...(action.modifiersClause ? { modifiers: action.modifiersClause } : {}),
        ...(() => {
          const went = action.move && !after.dilemmaStack.some((c) => c.id === action.dilemmaId) ? wentText(before, action.move.to, action.move.position) : null;
          const added = action.fetchedId && after.dilemmaStack[0]?.id === action.fetchedId ? cardName(after, action.fetchedId) : null;
          const restReturned = (action.restToPile ?? []).filter((id) => after.dilemmaPile.some((c) => c.id === id)).length;
          const restUnder = action.overcome ? (action.restUnder ?? []).filter((id) => !after.dilemmaStack.some((c) => c.id === id)).length : 0;
          return {
            ...(went ? { went } : {}),
            ...(added ? { added } : {}),
            ...(restReturned ? { restReturned } : {}),
            ...(action.overcome ? { overcome: action.overcome } : {}),
            ...(restUnder ? { restUnder } : {}),
            ...(action.prevented ? { prevented: action.prevented } : {}),
            ...(action.returned ? { returned: action.returned } : {}),
            ...(went && action.ruleWarnings?.length ? { warnings: [...action.ruleWarnings] } : {}),
          };
        })(),
      };
    }
    // The turn waits while an event resolves (#1727): a held button makes no entry.
    case 'nextTurn':
      return after === before ? null : { kind: 'nextTurn' };
    case 'drawOpeningHand': {
      if (after === before) return null;
      const grants = firstTurnGrantsOf(costFactsOf(before, []));
      return { kind: 'openingHand', count: after.hand.length - before.hand.length, ...(grants.length ? { grants } : {}) };
    }
    case 'advanceSegment':
      if (after === before) return null;
      return after.turn !== before.turn ? { kind: 'nextTurn' } : { kind: 'segment', to: after.segment };
    case 'adjustScore':
      if (after.score === before.score) return null;
      return { kind: 'score', delta: after.score - before.score, score: after.score };
    default:
      return null;
  }
}

// A batch that completes a mission and then applies its effect (#1757): its first action marks a mission
// complete, and more follow. Null for every other batch.
const completionOf = (actions: TableAction[]): Extract<TableAction, { type: 'setMissionCompleted' }> | null => {
  const first = actions[0];
  return actions.length > 1 && first?.type === 'setMissionCompleted' && first.completed ? first : null;
};

// The entry of a completion and its effect (#1757): the `missionCompleted` entry, with what the effect did
// once the completion applied. An effect that changed nothing leaves the plain entry.
function completionEntry(
  before: TableState,
  completion: Extract<TableAction, { type: 'setMissionCompleted' }>,
  rest: TableAction[],
  after: TableState
): EntryBody | null {
  const done = tableReducer(before, completion);
  const plain = singleEntry(before, completion, done);
  if (!plain || plain.kind !== 'missionCompleted') return plain;
  const moves = rest.filter((a): a is Extract<TableAction, { type: 'move' }> => a.type === 'move');
  const logMoves = moves.length ? moveEntry(done, moves, false) : [];
  const afterMoves = moves.reduce(tableReducer, done);
  const shuffle = rest.find((a): a is Extract<TableAction, { type: 'shuffle' }> => a.type === 'shuffle');
  const shuffled = shuffle && cardsAt(afterMoves, shuffle.location).length >= 2 ? logPlace(afterMoves, shuffle.location) : undefined;
  const flip = rest.find((a): a is Extract<TableAction, { type: 'flipMission' }> => a.type === 'flipMission');
  const flipped = flip ? !!after.missions[completion.missionIndex]?.mission?.flipped : false;
  const scored = after.score - done.score;
  const killed = completionEffectOf(before, completion.missionIndex)?.kind === 'kill' ? logMoves.flatMap((m) => m.cards).filter((c): c is string => typeof c === 'string') : [];
  const effect: CompletionLog = {
    ...plain.effect,
    ...(logMoves.length ? { moves: logMoves } : {}),
    ...(shuffled ? { shuffled } : {}),
    ...(flipped ? { flipped: true as const } : {}),
    ...(scored > 0 ? { scored } : {}),
    ...(killed.length ? { killed } : {}),
  };
  return Object.keys(effect).length ? { ...plain, effect } : plain;
}

// The entry one player action makes, or null when it changed nothing the log records. `after` is
// the table once every action of the batch applied. The entry belongs to the turn after the
// action, so the entry of `nextTurn` heads the group of the new turn.
export function logEntryFor(
  before: TableState,
  action: Exclude<GameAction, { type: 'undo' } | { type: 'redo' } | { type: 'correctCharge' } | { type: 'adjustCounterLimit' } | { type: 'dismissDiscount' } | { type: 'choosePersonnel' } | { type: 'downloadForCharge' } | { type: 'useCard' } | { type: 'discardForCharge' } | { type: 'cancelResolving' } | { type: 'missionSpend' } | { type: 'effectStep' } | { type: 'effectSkip' } | { type: 'useOrder' } | { type: 'useTrigger' } | { type: 'skipTrigger' } | { type: 'useAttemptAbility' }>,
  after: TableState,
): LogEntry | null {
  let body: EntryBody | null;
  const completion = action.type === 'batch' ? completionOf(action.actions) : null;
  if (completion) {
    body = completionEntry(before, completion, action.type === 'batch' ? action.actions.slice(1) : [], after);
  } else if (action.type === 'batch') {
    const moves = action.actions.filter((a): a is Extract<TableAction, { type: 'move' }> => a.type === 'move');
    const flips = action.actions.filter((a): a is Extract<TableAction, { type: 'flip' }> => a.type === 'flip');
    if (moves.length) {
      // A `setRemovedFromGame` after the moves marks the cards it removes on their move (#1730).
      const removed = new Set(
        action.actions.flatMap((a) => (a.type === 'setRemovedFromGame' && a.removedFromGame ? a.ids : []))
      );
      const logMoves = moveEntry(before, moves, !!action.unseen, removed);
      // The shuffle of a download runs after its moves, so it shuffles what the moves left.
      const afterMoves = moves.reduce(tableReducer, before);
      const shuffle = action.actions.find((a): a is Extract<TableAction, { type: 'shuffle' }> => a.type === 'shuffle');
      const shuffled =
        shuffle && cardsAt(afterMoves, shuffle.location).length >= 2 ? logPlace(afterMoves, shuffle.location) : undefined;
      body = logMoves.length || shuffled ? { kind: 'move', moves: logMoves, ...(shuffled ? { shuffled } : {}) } : null;
    } else if (flips.length) {
      const cards = flipEntry(before, flips);
      body = cards.length ? { kind: 'flip', cards } : null;
    } else if (action.actions.length === 1) {
      body = singleEntry(before, action.actions[0], after);
    } else {
      body = null;
    }
  } else {
    body = singleEntry(before, action, after);
  }
  return body ? ({ ...body, turn: after.turn, segment: after.segment } as LogEntry) : null;
}

// Resolved → Remove from game of the resolving event (#1730): the move Resolved → Discard makes, then the
// discard pile's Remove from game, in one batch and one entry. The order matters: a move out of the
// discard pile clears the flag, so the flag goes on after the card is there.
export const resolvedRemoveFromGameAction = (id: string): GameAction => ({
  type: 'batch',
  actions: [
    { type: 'move', id, to: 'discard' },
    { type: 'setRemovedFromGame', ids: [id], removedFromGame: true },
  ],
});

export const initialGameState = (table: TableState): GameState => ({ table, log: [], undo: [], redo: [] });

// The page's reducer: the table, through `tableReducer`, and the log beside it. The log is built
// here, in the reducer, and not in an effect: StrictMode runs a reducer twice, and an append in an
// effect or a handler would log twice. An action that changes nothing returns the same state.
// Each entry keeps the table from before its action, and `undo` goes back to it and drops the
// entry (#1194). An action that makes no entry keeps no snapshot, so the undo of the next entry
// takes it back too. A deal and a reset empty both, so undo never goes past a deal. A restore
// takes the saved log (#1400) and the saved undo and redo histories (#1401), which are empty when the
// save has none.
// Undo keeps the undone entry and the table it leaves, and `redo` puts both back (#1403). Any other
// action that changes the table empties the redo history, logged or not, and so do a deal and a
// reset.
export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'undo') {
    if (!state.undo.length) return state;
    const entry = state.log[state.log.length - 1];
    return {
      table: state.undo[state.undo.length - 1],
      log: state.log.slice(0, -1),
      undo: state.undo.slice(0, -1),
      redo: [...state.redo, { entry, table: state.table }],
    };
  }
  if (action.type === 'redo') {
    if (!state.redo.length) return state;
    const step = state.redo[state.redo.length - 1];
    return {
      table: step.table,
      log: [...state.log, step.entry],
      undo: [...state.undo, state.table],
      redo: state.redo.slice(0, -1),
    };
  }
  // A correction changes no card, so its undo snapshot is the table as it is (#1607).
  if (action.type === 'correctCharge' || action.type === 'adjustCounterLimit' || action.type === 'dismissDiscount') {
    const entry =
      action.type === 'correctCharge'
        ? chargeCorrectionEntry(state, action)
        : action.type === 'adjustCounterLimit'
          ? counterLimitEntry(state, action)
          : discountDismissedEntry(state, action);
    if (!entry) return state;
    return { table: state.table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
  }
  if (action.type === 'choosePersonnel') return choosePersonnelState(state, action);
  if (action.type === 'downloadForCharge') return downloadForChargeState(state, action);
  if (action.type === 'useCard') return cardUseState(state, action);
  if (action.type === 'discardForCharge') return discardForChargeState(state, action);
  if (action.type === 'cancelResolving') return cancelResolvingState(state);
  if (action.type === 'missionSpend') return missionSpendState(state, action);
  if (action.type === 'effectStep') return effectStepState(state, action);
  if (action.type === 'effectSkip') return effectSkipState(state);
  if (action.type === 'useOrder') return orderUseState(state, action);
  if (action.type === 'useTrigger') return triggerUseState(state, action);
  if (action.type === 'skipTrigger') return triggerSkipState(state, action);
  if (action.type === 'useAttemptAbility') return attemptAbilityUseState(state, action);
  if (action.type === 'setNamed') return setNamedState(state, action);
  // The turn waits while a "when you play" effect is pending (#1800), as it does for a resolving event, and while
  // an order is (#1866).
  if ((action.type === 'advanceSegment' || action.type === 'nextTurn') && (pendingPlayEffectOf(state) || pendingOrderOf(state) || pendingTriggerOf(state)))
    return state;
  if (action.type === 'restore') {
    return {
      table: tableReducer(state.table, action),
      log: 'log' in action ? action.log ?? [] : [],
      undo: 'undo' in action ? action.undo ?? [] : [],
      redo: 'redo' in action ? action.redo ?? [] : [],
    };
  }
  if (action.type === 'reset' || action.type === 'resetWithPiles') {
    return { table: tableReducer(state.table, action), log: [], undo: [], redo: [] };
  }
  const actions = action.type === 'batch' ? action.actions : [action];
  const table = actions.reduce(tableReducer, state.table);
  const entry = logEntryFor(state.table, action, table);
  if (table === state.table && !entry) return state;
  if (!entry) return { ...state, table, redo: [] };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The action with the result of each shuffle in it (#1401): a `shuffle`, the shuffle of a `batch`
// after its moves, and a `drawCard` that `drawReshuffles`. The page calls this before each dispatch,
// with the table it shows, and the reducer applies the order, so it calls no random function. An
// action that already holds its order keeps it.
function withShuffleOrder(table: TableState, action: TableAction): TableAction {
  if (action.type === 'shuffle' && !action.order) return { ...action, order: shuffledIds(cardsAt(table, action.location)) };
  if (action.type === 'drawCard' && !action.order && drawReshuffles(table, action)) {
    return { ...action, order: shuffledIds(table.dilemmaPile) };
  }
  // Let's Try That Again's fresh roll of the revealed top card (#1847), from the table as it stands.
  if (action.type === 'selectAgain' && !action.picks) {
    const picks = revealPicksOf(table, Math.random);
    return picks ? { ...action, picks } : action;
  }
  // A flip that takes a reveal snapshot of a dilemma that selects at random carries that roll (#1594,
  // #1628), so the snapshot keeps it.
  if (action.type === 'flip' && !action.picks) {
    const next = tableReducer(table, action);
    const picks = next.attempt?.revealSnapshot !== table.attempt?.revealSnapshot ? revealPicksOf(next, Math.random) : undefined;
    if (picks) return { ...action, picks };
  }
  return action;
}

// The kind of a place, for the classifier of costs.
const costPlace = (zone: TableZone): CostPlace => {
  if (typeof zone === 'string') return zone;
  return zone.zone === 'missionPile' ? zone.pile : zone.zone;
};

// Where a card landed, for the cost models (#1702): the mission slot of a ship row or an away team, and
// for a crew the slot of the ship's row and the ship. A card placed on a mission card gives that slot as
// `onMissionIndex` (#1752). The core and a card placed on another card give neither.
const costDestination = (table: TableState, zone: TableZone): CostDestination => {
  if (typeof zone === 'string') return {};
  if (zone.zone === 'on') {
    const onMissionIndex = table.missions.findIndex((slot) => slot.mission?.id === zone.targetId);
    return onMissionIndex >= 0 ? { onMissionIndex } : {};
  }
  if (zone.zone === 'shipRow' || zone.zone === 'missionPile') return { missionIndex: zone.missionIndex };
  if (zone.zone === 'crew') {
    const missionIndex = table.missions.findIndex((slot) => slot.ships.some((ship) => ship.id === zone.shipId));
    return missionIndex >= 0 ? { missionIndex, shipId: zone.shipId } : { shipId: zone.shipId };
  }
  return {};
};

// The action with its charge in it (#1606): a `move` of a card from the hand that landed on the
// table, or from the discard pile where the card's text allows it (#1698), and a `drawCard` from the draw deck, in the play and draw segment, as `moveCharge` and
// `drawCharge` give it. The place a move reads is where the card landed, so a refused move costs
// nothing. The reducer ignores the field and the log reads it. An action that already holds a cost
// keeps it. A move reads the facts of the cost models (#1654) from the table and `turnFacts`, the
// pending discounts of the turn (#1656); a play that uses a discount takes the discount off, so the
// next action of a batch sees it gone. A download makes no play free: it only takes a card into the
// hand. The plays of the turn (#1703) gain each play, so the next action of a batch sees it.
interface TurnFacts {
  pending: PendingDiscount[];
  plays: CostTurnPlay[];
}

const noTurnFacts = (): TurnFacts => ({ pending: [], plays: [] });

const turnFactsOf = (log: LogEntry[], turn: number): TurnFacts => ({
  pending: pendingDiscountsOf(log, turn),
  plays: turnPlaysOf(log, turn),
});

// A play whose charge reveals cards of the opponent's dilemma pile (#1738) comes back with a move of each
// of them to the bottom of that pile, in pile order, so the play, the reveal and the moves are one batch,
// one entry and one undo. A play whose charge discards the top of the draw deck (#1744) comes back the same
// way with a move of each of those cards to the discard pile, top first.
function withCharge(table: TableState, action: TableAction, turnFacts: TurnFacts): TableAction[] {
  const { pending, plays } = turnFacts;
  if (action.type === 'drawCard' && action.cost === undefined) {
    const charge = drawCharge(table.segment, action.from, action.to);
    if (charge && tableReducer(table, action) !== table) return [{ ...action, cost: charge.cost }];
  }
  if (action.type === 'move' && action.cost === undefined) {
    const found = findInstanceAnywhere(table, action.id);
    const next = found ? tableReducer(table, action) : table;
    const landed = next !== table ? findInstanceAnywhere(next, action.id) : null;
    // A card marked removed from the game (#1730) never plays from the discard pile (#1764).
    const removed = found?.instance.removedFromGame === true && costPlace(found.zone) === 'discard';
    const charge =
      found && landed && !removed
        ? moveCharge(
            table.segment,
            costPlace(found.zone),
            costPlace(landed.zone),
            found.instance.card,
            costFactsOf(table, pending, plays),
            action.id,
            costDestination(next, landed.zone)
          )
        : null;
    if (charge?.kind === 'play')
      plays.push(turnPlayOf(found!.instance.card, slotQuadrantOf(next, costDestination(next, landed!.zone).missionIndex)));
    const uses = charge?.kind === 'play' && charge.uses?.length ? { costUses: charge.uses } : {};
    const revealIds = charge?.kind === 'play' && charge.reveal?.ids.length ? charge.reveal.ids : [];
    const discardIds = charge?.kind === 'play' && charge.discard?.ids.length ? charge.discard.ids : [];
    const reveal = { ...(revealIds.length ? { costReveal: revealIds } : {}), ...(discardIds.length ? { costDiscard: discardIds } : {}) };
    const toBottom: TableAction[] = [
      ...revealIds.map((id): TableAction => ({ type: 'move', id, to: 'dilemmaPile', position: 'bottom' })),
      ...discardIds.map((id): TableAction => ({ type: 'move', id, to: 'discard' })),
    ];
    if (charge?.kind === 'play' && charge.source) {
      const discount = charge.source.discount;
      const usedDiscount = discount ? pending.findIndex((d) => sameTarget(d.origin, discount)) : -1;
      if (usedDiscount >= 0) pending.splice(usedDiscount, 1);
      return [{ ...action, cost: charge.cost, costSource: charge.source, ...uses, ...reveal }, ...toBottom];
    }
    if (charge) return [{ ...action, cost: charge.cost, ...uses, ...reveal }, ...toBottom];
  }
  return [action];
}

// The setting "Apply card text to attributes" (#1668) joins every move while it is on, so the reducer
// reads no storage and a redo puts back the range the move used.
const withCardText = (action: TableAction, cardText: boolean): TableAction =>
  cardText && action.type === 'move' && action.cardText === undefined ? { ...action, cardText: true } : action;

// The play rules each action of `actions` breaks (#1821), stamped on it as `ruleWarnings`, while the setting
// "Check uniqueness and limits" is on: a move that changed its place, read from the table before it, a play
// (a charged move) for uniqueness too, and the placement of a resolved dilemma. The actions run in turn, so
// the second of two copies of a batch sees the first.
function withRuleWarnings(table: TableState, actions: TableAction[]): TableAction[] {
  let state = table;
  return actions.map((a) => {
    let out = a;
    if (a.type === 'move' && a.ruleWarnings === undefined) {
      const found = findInstanceAnywhere(state, a.id);
      const next = found ? tableReducer(state, a) : state;
      const landed = next !== state ? findInstanceAnywhere(next, a.id) : null;
      if (found && landed && tableZoneKey(found.zone) !== tableZoneKey(landed.zone)) {
        const warnings = ruleWarningsOf(state, found.instance, landed.zone, typeof a.cost === 'number');
        if (warnings.length) out = { ...a, ruleWarnings: warnings };
      }
    } else if (a.type === 'drawCard' && a.from === 'drawDeck' && typeof a.cost === 'number' && a.ruleWarnings === undefined) {
      // A charged draw (#1916): a spend of counters to draw, which a card in the core may forbid.
      const warnings = drawWarningsOf(state);
      if (warnings.length) out = { ...a, ruleWarnings: warnings };
    } else if (a.type === 'resolveDilemma' && a.move && a.ruleWarnings === undefined) {
      const found = findInstanceAnywhere(state, a.dilemmaId);
      const warnings = found ? ruleWarningsOf(state, found.instance, a.move.to, false) : [];
      if (warnings.length) out = { ...a, ruleWarnings: warnings };
    }
    state = tableReducer(state, out);
    return out;
  });
}

const withOrderAndCharge = (table: TableState, action: TableAction, turnFacts: TurnFacts, cardText: boolean, checkRules: boolean): TableAction[] => {
  const chosen = withCharge(table, withShuffleOrder(table, withCardText(action, cardText)), turnFacts);
  return checkRules ? withRuleWarnings(table, chosen) : chosen;
};

// `log` is the game's log, for the pending discounts of the turn (#1656). With none, no discount waits.
// `cardText` is the setting "Apply card text to attributes" (#1668), off by default. `checkRules` is the
// setting "Check uniqueness and limits" (#1821), off by default: with it off no action carries a warning.
export function withShuffleOrders(
  table: TableState,
  action: GameAction,
  log: LogEntry[] = [],
  cardText = false,
  checkRules = false
): GameAction {
  if (
    action.type === 'undo' ||
    action.type === 'redo' ||
    action.type === 'restore' ||
    action.type === 'correctCharge' ||
    action.type === 'adjustCounterLimit' ||
    action.type === 'dismissDiscount' ||
    action.type === 'choosePersonnel' ||
    action.type === 'useCard' ||
    action.type === 'discardForCharge' ||
    action.type === 'cancelResolving' ||
    action.type === 'effectSkip' ||
    action.type === 'useOrder' ||
    action.type === 'useTrigger' ||
    action.type === 'skipTrigger' ||
    action.type === 'useAttemptAbility'
  ) {
    return action;
  }
  if (action.type === 'effectStep') {
    // A stage that shuffles the draw deck (#1863) gets the order of the cards that stay in it.
    const subject = effectSubjectOf({ table, log });
    if (!subject) return action;
    const steps = subject.stage.steps;
    const download = stepOf(steps, 'download');
    let out = action;
    if (!action.order && steps.some((s) => s.kind === 'shuffle')) {
      const leaving =
        download?.of.kind === 'copyOfCommanded' ? [downloadCopyOf(table, action.personnelId ?? '')?.id] : Array.isArray(action.ids) ? action.ids : [];
      out = { ...out, order: shuffledIds(table.drawDeck.filter((c) => !leaving.includes(c.id))) };
    }
    // A download played aboard a ship (#1811) is a play, so it checks uniqueness (#1821).
    const card = download && action.shipId && action.ids?.length === 1 ? table.drawDeck.find((c) => c.id === action.ids![0]) : undefined;
    const warnings = checkRules && card && action.shipId && !action.ruleWarnings ? ruleWarningsOf(table, card, { zone: 'crew', shipId: action.shipId }, true) : [];
    return warnings.length ? { ...out, ruleWarnings: warnings } : out;
  }
  if (action.type === 'downloadForCharge') {
    if (action.order) return action;
    return { ...action, order: shuffledIds(table.drawDeck.filter((c) => !action.ids.includes(c.id))) };
  }
  if (action.type === 'missionSpend') {
    if (action.spend !== 'nimbus' || action.order) return action;
    return { ...action, order: shuffledIds(table.drawDeck.filter((c) => c.id !== action.id)) };
  }
  if (action.type === 'batch') {
    if (!action.actions.some((a) => a.type === 'shuffle' || a.type === 'drawCard' || a.type === 'flip' || a.type === 'move')) {
      return action;
    }
    const turnFacts = turnFactsOf(log, table.turn);
    // The moves of a completion's effect (#1757) are no plays: they take no charge.
    const effect = !!completionOf(action.actions);
    let state = table;
    const actions = action.actions.flatMap((a) => {
      const chosen = effect && a.type === 'move' ? [a] : withOrderAndCharge(state, a, turnFacts, cardText, checkRules);
      state = chosen.reduce(tableReducer, state);
      return chosen;
    });
    return { ...action, actions };
  }
  if ((action.type === 'startAttempt' || action.type === 'botAttempt') && action.downloadId && !action.downloadOrder) {
    // Caldos IV's download (#1828) shuffles the draw deck in an order the page chooses.
    const { downloadId } = action;
    return { ...action, downloadOrder: shuffledIds(table.drawDeck.filter((c) => c.id !== downloadId)) };
  }
  const chosen = withOrderAndCharge(table, action, action.type === 'move' ? turnFactsOf(log, table.turn) : noTurnFacts(), cardText, checkRules);
  return chosen.length === 1 ? chosen[0] : { type: 'batch', actions: chosen };
}

// The cards of the opponent's dilemma pile a play of `action` revealed (#1738), from the `costReveal` of
// its moves, or none. The page opens the reveal panel on them.
export function actionReveal(action: GameAction): string[] {
  const actions = action.type === 'batch' ? action.actions : [action];
  return actions.flatMap((a) => (a.type === 'move' && a.costReveal?.length ? a.costReveal : []));
}

// The pending discounts of `turn` (#1656), oldest first: each play of the turn whose card's model makes
// one, less those a later charge used (its source names the play) and those a `discountDismissed`
// entry dismissed. Read from the effective log alone, so an undo, a redo and a reload agree, and the
// next turn has none. A correction of the play that used a discount leaves it used, but a Cancel of it
// (#1728) makes it no play, so the discount it used waits again. A play whose
// choice was taken makes none (#1699): McCoy played at −2 ignores his next ability, the discount, and
// an undo of the choice brings it back. A play that used the discount before the choice keeps its cost.
export function pendingDiscountsOf(log: LogEntry[], turn: number): PendingDiscount[] {
  const open: PendingDiscount[] = [];
  const close = (origin: ChargeTarget) => {
    const i = open.findIndex((d) => sameTarget(d.origin, origin));
    if (i >= 0) open.splice(i, 1);
  };
  effectiveLog(log).forEach((entry, i) => {
    if (entry.turn !== turn) return;
    if (entry.kind === 'discountDismissed') {
      if (entry.target) close(entry.target);
      return;
    }
    if (entry.kind === 'chargeCorrected' && isRevealedCard(entry.revealed)) {
      // The New Resistance (#1763): a revealed Dissident personnel plays from the draw deck at −3, once.
      const revealed = entry.revealed;
      if (revealed.dissident) {
        open.push({
          title: typeof entry.source === 'string' && entry.source ? entry.source : 'a card',
          label: `revealed ${revealed.name}`,
          amount: 3,
          origin: { entry: i },
          applies: (play) => play.id === revealed.id,
          fromDrawDeck: true,
        });
      }
      return;
    }
    if (entry.kind === 'eventsDownloaded') {
      // K'mtar (#1762): one discount per downloaded card, for the play of that card alone. Its origin is the
      // entry and the card's place in it, which no charge has, since the entry charges nothing.
      const discount = downloadDiscountOf(log, entry);
      downloadedCards(entry).forEach((card, c) =>
        open.push({
          title: entry.source,
          label: `downloaded ${card.name}`,
          amount: discount,
          origin: { entry: i, card: c },
          applies: (play) => play.id === card.id,
        })
      );
      return;
    }
    for (const charge of withChoicesTaken(log, chargesOf(entry, i))) {
      if (charge.source?.discount) close(charge.source.discount);
      const made = charge.card && !charge.choiceTaken ? pendingDiscountOf(charge.card, charge.target) : null;
      if (made) open.push(made);
    }
  });
  return open;
}

const NO_TRAITS: CostTurnPlay = { type: '', unique: false, icons: [] };

const isTurnPlay = (play: unknown): play is CostTurnPlay => {
  const p = play as CostTurnPlay | null | undefined;
  const strings = (v: unknown): boolean => v === undefined || (Array.isArray(v) && v.every((i) => typeof i === 'string'));
  return (
    !!p &&
    typeof p.type === 'string' &&
    typeof p.unique === 'boolean' &&
    Array.isArray(p.icons) &&
    p.icons.every((i) => typeof i === 'string') &&
    strings(p.species) &&
    strings(p.skills) &&
    (p.quadrant === undefined || typeof p.quadrant === 'string') &&
    (p.affiliation === undefined || typeof p.affiliation === 'string')
  );
};

// The cards played in `turn` (#1703), oldest first, by the traits a standing rule tests: every card a
// move of the effective log charged as a play, whatever its cost was corrected to. A play of an entry
// from before #1703 has no traits and passes no test. Read from the log alone, so an undo, a redo and a
// reload agree.
export function turnPlaysOf(log: LogEntry[], turn: number): CostTurnPlay[] {
  return effectiveLog(log).flatMap((entry) =>
    entry.turn === turn && entry.kind === 'move'
      ? entry.moves.flatMap((move) => {
          const plays = Array.isArray(move.plays) && move.plays.length === move.cards.length ? move.plays : [];
          return (moveCosts(move) ?? []).flatMap((cost, c) => (cost === null ? [] : [isTurnPlay(plays[c]) ? plays[c] : NO_TRAITS]));
        })
      : []
  );
}

// The text of a place, with "the", the same words as the labels of the card list panel.
export function placeText(place: LogPlace): string {
  switch (place.kind) {
    case 'drawDeck':
      return 'the draw deck';
    case 'hand':
      return 'the hand';
    case 'discard':
      return 'the discard pile';
    case 'core':
      return 'the core';
    case 'brig':
      return 'the brig';
    case 'dilemmaPile':
      return 'the dilemma pile';
    case 'dilemmaHand':
      return 'the dilemma hand';
    case 'dilemmaStack':
      return 'the dilemma stack';
    case 'botBrig':
      return "the bot's brig";
    case 'resolving':
      return 'the resolving zone';
    case 'missions':
      return 'the mission row';
    case 'shipRow':
      return place.mission;
    case 'crew':
      return `the crew of ${place.ship}`;
    case 'awayTeam':
      return `the away team at ${place.mission}`;
    case 'underMission':
      return `the pile under ${place.mission}`;
    case 'on':
      return `the cards on ${place.card}`;
  }
}

// "Data", "Data and Worf", "Data, Worf and Riker". The unseen cards come last, as "a card" or
// "2 cards".
export function cardsText(cards: LogCard[]): string {
  const names = cards.filter((c): c is string => c !== null);
  const unseen = cards.length - names.length;
  const parts = [...names, ...(unseen === 1 ? ['a card'] : unseen > 1 ? [`${unseen} cards`] : [])];
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const destinationText = (move: LogMove): string =>
  move.position ? `the ${move.position} of ${placeText(move.to)}` : placeText(move.to);

// "used range 4, 4 left" or "used range 4, over by 2" (#1634).
const rangeText = (range: LogRange): string =>
  `used range ${range.used}, ${range.left >= 0 ? `${range.left} left` : `over by ${-range.left}`}`;

// " (used range 4, 4 left)" after a ship's move between two ship rows, and for more than one ship
// each ship's own numbers: " (Enterprise used range 4, 4 left; Defiant used range 4, over by 2)".
// Nothing for any other move, an entry from before #1634 too.
// The costs of a move (#1606), each card's number or null, or null for a move from before #1606 or
// one whose costs do not match its cards.
const moveCosts = (move: LogMove): (number | null)[] | null => {
  const costs = Array.isArray(move.costs) ? move.costs.map((c) => (typeof c === 'number' ? c : null)) : null;
  return costs && costs.length === move.cards.length && costs.some((c) => c !== null) ? costs : null;
};

const isCostSource = (source: unknown): source is CostSource =>
  !!source && typeof (source as CostSource).title === 'string' && typeof (source as CostSource).reason === 'string';

// The source of each cost of a move (#1654), or null for one with none: an entry from before #1654,
// a printed cost, or sources that do not match its cards.
const moveSources = (move: LogMove): (CostSource | null)[] => {
  const sources = Array.isArray(move.sources) && move.sources.length === move.cards.length ? move.sources : [];
  return move.cards.map((_, i) => (isCostSource(sources[i]) ? sources[i] : null));
};

// The uses offered for each cost of a move (#1713), an empty list for one with none or a malformed save.
const moveUses = (move: LogMove): CostUse[][] => {
  const uses = Array.isArray(move.uses) && move.uses.length === move.cards.length ? move.uses : [];
  return move.cards.map((_, i) => (Array.isArray(uses[i]) ? uses[i]!.filter(isCostUse) : []));
};

// ", Borg Nanoprobes: you command a Borg" after a cost the table suggested.
const sourceText = (source: CostSource | null): string => (source ? `, ${source.title}: ${source.reason}` : '');

// " (cost 3)" after a play of one card, and for more than one card each played card's own cost:
// " (Data cost 3; Worf cost 2)". A cost of 0 shows too: an interrupt is printed 0.
const movedCostText = (move: LogMove): string => {
  const costs = moveCosts(move);
  if (!costs) return '';
  const sources = moveSources(move);
  if (costs.length === 1) return ` (cost ${costs[0]}${sourceText(sources[0])})`;
  const parts = costs.flatMap((c, i) => (c === null ? [] : [`${move.cards[i] ?? 'a card'} cost ${c}${sourceText(sources[i])}`]));
  return ` (${parts.join('; ')})`;
};

// Where a card was played (#1606): " at Earth" for a ship row or an away team, " on Data" for a card,
// " to" the crew or the core, and nothing for an event that resolves (#1727).
const playedPlaceText = (place: LogPlace): string => {
  if (place.kind === 'shipRow' || place.kind === 'awayTeam') return ` at ${place.mission}`;
  if (place.kind === 'on') return ` on ${place.card}`;
  if (place.kind === 'resolving') return '';
  return ` to ${placeText(place)}`;
};

// The text of one move, with its verb: "played" when every card of it was a play, and "resolved" for
// the resolving event that goes to the discard pile (#1727) or the core (#1796), or is removed from the game (#1730).
const moveText = (move: LogMove): { verb: 'played' | 'moved' | 'resolved'; text: string } => {
  const costs = moveCosts(move);
  if (costs && costs.every((c) => c !== null)) {
    return {
      verb: 'played',
      text: `${cardsText(move.cards)}${playedPlaceText(move.to)}${movedCostText(move)}${movedNamedText(move)}${movedEffectsText(move)}${warningsText(move.warnings)}`,
    };
  }
  if (move.from.kind === 'resolving' && move.to.kind === 'discard' && move.removedFromGame) {
    return { verb: 'resolved', text: `${cardsText(move.cards)}, and removed it from the game` };
  }
  // A core event with a "When you play this event" clause (#1796) goes to the core once resolved.
  if (move.from.kind === 'resolving' && (move.to.kind === 'discard' || move.to.kind === 'core')) {
    return { verb: 'resolved', text: `${cardsText(move.cards)}, and it went to ${placeText(move.to)}` };
  }
  return {
    verb: 'moved',
    text: `${cardsText(move.cards)} from ${placeText(move.from)} to ${destinationText(move)}${movedRangeText(move)}${movedCostText(move)}${move.removedFromGame ? ', and removed from the game' : ''}${movedNamedText(move)}${movedEffectsText(move)}${warningsText(move.warnings)}`,
  };
};

// The warnings of the play rules a move broke (#1821), "; unique: Data is already in play".
const warningsText = (warnings: unknown): string =>
  ruleWarningsIn(warnings)
    .map((w) => {
      const text = ruleWarningText(w);
      // "Unique: …" reads "unique: …"; a permission's warning starts with its card's title, which keeps its case.
      return `; ${ruleNamedFirst(w) ? text.charAt(0).toLowerCase() : text.charAt(0)}${text.slice(1)}`;
    })
    .join('');

const movedRangeText = (move: LogMove): string => {
  const ranges = Array.isArray(move.range) ? move.range.filter((r) => r && typeof r.used === 'number' && typeof r.left === 'number') : [];
  if (!ranges.length || ranges.length !== move.cards.length) return '';
  if (ranges.length === 1) return ` (${rangeText(ranges[0])})`;
  return ` (${ranges.map((r, i) => `${move.cards[i] ?? 'a card'} ${rangeText(r)}`).join('; ')})`;
};

// The verb of each op of a resolved dilemma (#1587), and the phrase of its "already done" note.
const RESOLVE_OP_TEXT: Record<ResolveOp, string> = {
  stop: 'stopped',
  kill: 'killed',
  remove: 'removed from the game',
  brig: "sent to the bot's brig",
  holdInCore: 'held in the core',
  returnToHand: 'returned to the hand',
  topOfDeck: 'put on top of the draw deck',
};

const resolveNoteText = (note: ResolveNote): string =>
  note.kind === 'alreadyDone'
    ? `${note.done} of ${note.of} already ${RESOLVE_OP_TEXT[note.op]} by hand`
    : `${note.text} goes by the table`;

// "Worf has Integrity, Cunning or Strength > 6", "none has …", or "the selected personnel do not have …",
// the words of the Resolve preview's check (#1628).
const resolveCheckText = (check: ResolveCheck): string => {
  if (check.subject) return `${check.subject} ${check.all ? 'have' : 'do not have'} ${check.text}`;
  if (!check.met.length) return `none has ${check.text}`;
  return `${check.met.join(', ')} ${check.met.length === 1 ? 'has' : 'have'} ${check.text}`;
};

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// The text of one entry, one sentence with no full stop.
// Every kind of entry, for the check of a saved log (#1400).
export const LOG_ENTRY_KINDS: Record<LogEntry['kind'], true> = {
  draw: true,
  move: true,
  flip: true,
  flipMission: true,
  shuffle: true,
  reorder: true,
  stopped: true,
  removedFromGame: true,
  missionCompleted: true,
  nextTurn: true,
  openingHand: true,
  segment: true,
  score: true,
  attemptStarted: true,
  attemptEnded: true,
  attemptPhase: true,
  botAttempt: true,
  dilemmaResolved: true,
  chargeCorrected: true,
  counterLimit: true,
  discountDismissed: true,
  eventsDownloaded: true,
  playCancelled: true,
  resolveDrew: true,
  resolveBottom: true,
  resolveDiscardDraw: true,
  resolveDownloaded: true,
  resolveExchanged: true,
  effectStep: true,
  missionSpend: true,
  playEffect: true,
  cardNamed: true,
  selectedAgain: true,
  pickReplaced: true,
  orderUsed: true,
  orderEffect: true,
  triggerUsed: true,
  triggerEffect: true,
  triggerSkipped: true,
  attemptAbilityUsed: true,
};

// A saved entry (#1400) loads only when it is an object with a numeric turn and a kind the log knows.
export const isLogEntry = (entry: unknown): entry is LogEntry =>
  typeof entry === 'object' &&
  entry !== null &&
  typeof (entry as LogEntry).turn === 'number' &&
  Object.hasOwn(LOG_ENTRY_KINDS, (entry as LogEntry).kind);

export function logEntryText(entry: LogEntry): string {
  switch (entry.kind) {
    case 'draw': {
      const cost = typeof entry.cost === 'number' ? ` (cost ${entry.cost})` : '';
      const drew = `drew a ${entry.from === 'drawDeck' ? 'card' : 'dilemma'} from ${placeText({ kind: entry.from })} into ${placeText({ kind: entry.to })}${cost}${warningsText(entry.warnings)}`;
      return entry.shuffled ? `Shuffled ${placeText({ kind: entry.from })}, then ${drew}` : capitalize(drew);
    }
    case 'move': {
      // Each run of moves of one verb shares it: "Moved A from …; B from …; played C at …".
      const moves = entry.moves.map(moveText).map((m, i, all) => (i > 0 && all[i - 1].verb === m.verb ? m.text : `${m.verb} ${m.text}`));
      const shuffled = entry.shuffled ? `shuffled ${placeText(entry.shuffled)}` : null;
      const effect = entry.effectOf && isPlayEffectRecord(entry.effectOf.effect) ? `${entry.effectOf.card}: ${playEffectText(entry.effectOf.effect)}; ` : '';
      const text = moves.length ? `${effect}${effect ? moves.join('; ') : capitalize(moves.join('; '))}` : '';
      if (!shuffled) return text;
      return text ? `${text}, then ${shuffled}` : capitalize(shuffled);
    }
    case 'selectedAgain':
      return `${entry.card}: ${entry.dilemma} selected again, and ${entry.card} went to the discard pile`;
    case 'pickReplaced':
      return `${entry.card}: replaced ${entry.from} with ${entry.to} in the selection of ${entry.dilemma}, and ${entry.card} went to the discard pile`;
    case 'cardNamed':
      return `${entry.card}${typeof entry.on === 'string' ? ` on ${entry.on}` : ''} named ${entry.named}`;
    case 'flip': {
      const byFace = (['up', 'down'] as const)
        .map((face) => ({ face, names: entry.cards.filter((c) => c.face === face).map((c) => c.name) }))
        .filter(({ names }) => names.length > 0)
        .map(({ face, names }) => `${cardsText(names)} face ${face}`);
      return `Turned ${byFace.join('; ')}`;
    }
    case 'flipMission':
      return `Flipped ${entry.mission} to its ${entry.flipped ? 'back' : 'front'}`;
    case 'shuffle':
      return `Shuffled ${placeText(entry.place)}`;
    case 'reorder':
      return entry.zone === 'dilemmaStack' ? 'Reordered the dilemma stack' : `Reordered the top of ${placeText({ kind: entry.zone })}`;
    case 'stopped':
      return `${entry.stopped ? 'Stopped' : 'Unstopped'} ${cardsText(entry.cards)}`;
    case 'removedFromGame':
      return `${entry.removedFromGame ? 'Removed' : 'Returned'} ${cardsText(entry.cards)} ${entry.removedFromGame ? 'from' : 'to'} the game`;
    case 'missionCompleted': {
      const marked = `Marked ${entry.mission} ${entry.completed ? 'complete' : 'not complete'}`;
      const effect = entry.effect;
      if (!effect) return marked;
      // Cheron (#1828): "Completed Cheron Aid Planetary Recovery: 4 different species involved; scored 5 points".
      if (typeof effect.species === 'number' && entry.completed) {
        const scored = typeof effect.scored === 'number' && effect.scored > 0 ? `scored ${effect.scored} ${effect.scored === 1 ? 'point' : 'points'}` : 'no points';
        return `Completed ${entry.mission}: ${effect.species} different species involved; ${scored}`;
      }
      // Ba'ku Planet (#1909): "Completed Ba'ku Planet Collect Metaphasic Particles: killed Vina, Kor; scored 10 points".
      if (Array.isArray(effect.killed) && effect.killed.length && entry.completed) {
        const scored = typeof effect.scored === 'number' && effect.scored > 0 ? `; scored ${effect.scored} ${effect.scored === 1 ? 'point' : 'points'}` : '';
        return `Completed ${entry.mission}: killed ${cardsText(effect.killed.filter((n) => typeof n === 'string'))}${scored}`;
      }
      const moves = (effect.moves ?? []).map(moveText).map((m, i, all) => (i > 0 && all[i - 1].verb === m.verb ? m.text : `${m.verb} ${m.text}`));
      const parts = [
        ...(moves.length ? [moves.join('; ')] : []),
        ...(effect.shuffled ? [`shuffled ${placeText(effect.shuffled)}`] : []),
        ...(effect.flipped ? ['flipped it to its back'] : []),
        // A score of another condition (#1908): "Marked Moab IV complete, and scored 5 points".
        ...(typeof effect.scored === 'number' && effect.scored > 0 ? [`scored ${effect.scored} ${effect.scored === 1 ? 'point' : 'points'}`] : []),
      ];
      return parts.length ? `${marked}, and ${parts.join(', then ')}` : marked;
    }
    case 'nextTurn':
      return `Started turn ${entry.turn}`;
    case 'openingHand':
      return `Drew the opening hand (${entry.count} ${entry.count === 1 ? 'card' : 'cards'})${
        Array.isArray(entry.grants) && entry.grants.length ? `; ${entry.grants.map((g) => `${g.title} +${g.amount} counters this turn`).join(', ')}` : ''
      }`;
    case 'segment':
      return `Went to ${entry.to === 'discard' ? 'discard' : 'orders'}`;
    case 'score':
      return `Score ${entry.delta > 0 ? '+' : ''}${entry.delta} (now ${entry.score})`;
    case 'attemptStarted':
      return `Attempted ${entry.mission}${entry.ship ? ` with ${entry.ship}` : ''}: ${attemptNumbersText(entry)}`;
    case 'attemptEnded':
      return entry.moved?.length
        ? `Ended the attempt at ${entry.mission}, and moved ${cardsText(entry.moved)} under ${entry.mission}`
        : `Ended the attempt at ${entry.mission}`;
    case 'botAttempt': {
      const dilemmas = (n: number) => `${n} ${n === 1 ? 'dilemma' : 'dilemmas'}`;
      const text = `Attempted ${entry.mission}${entry.ship ? ` with ${entry.ship}` : ''}: ${attemptNumbersText(entry)}; the bot drew ${dilemmas(entry.redrew ?? entry.drew)}${
        entry.redrew ? `, used Unexpected Difficulties to return them and draw ${entry.drew} more,` : ''
      } and put ${entry.stacked} in the stack${entry.random ? ' at random' : ''}`;
      const returned = Array.isArray(entry.returned) ? entry.returned.length : (entry.returned ?? 0);
      return returned ? `${text}, and moved ${dilemmas(returned)} to the bottom of the dilemma pile` : text;
    }
    case 'dilemmaResolved': {
      const ops = entry.ops.map(({ op, cards }) => `${RESOLVE_OP_TEXT[op]} ${cardsText(cards)}`).join(', ');
      const modifiers = typeof entry.modifiers === 'string' ? entry.modifiers : '';
      // An overcome over the spend (#1760): "Overcome: Stakoron II raised the cost past the spend".
      const overcome = typeof entry.overcome === 'string' ? `Overcome: ${entry.overcome}` : '';
      // Prevented and overcome (#1761): "prevented and overcome (Sigma Iotia II)".
      const prevented = typeof entry.prevented === 'string' ? `prevented and overcome (${entry.prevented})` : '';
      // Named at the mission (#1789): "named by Self-Replicating Roadblock, no effect".
      const returned = typeof entry.returned === 'string' ? `named by ${entry.returned}, no effect` : '';
      const effects = prevented || returned || overcome || [ops, modifiers].filter(Boolean).join('; ') || 'no effect';
      // The steps of a kept roll (#1629): each selection, then each check, before the effects. An old
      // entry has none.
      const steps = [
        ...(Array.isArray(entry.selected) ? entry.selected.map((names) => `selected ${names.join(', ') || 'no personnel'}`) : []),
        ...(Array.isArray(entry.checks) ? entry.checks.map(resolveCheckText) : []),
      ];
      const went = [
        typeof entry.went === 'string' ? `it ${entry.went}` : '',
        typeof entry.added === 'string' ? `adds ${entry.added} on top of the stack` : '',
        typeof entry.restReturned === 'number' ? 'the rest of the stack returns to the dilemma pile' : '',
        typeof entry.restUnder === 'number' ? `the ${entry.restUnder} after it ${entry.restUnder === 1 ? 'goes' : 'go'} under the mission` : '',
      ]
        .filter(Boolean)
        .map((part) => `; ${part}`)
        .join('');
      const notes = entry.notes?.length ? ` (${entry.notes.map(resolveNoteText).join('; ')})` : '';
      return `Resolved ${entry.dilemma}: ${[...steps, effects].join('; ')}${notes}${went}${warningsText(entry.warnings)}`;
    }
    case 'attemptPhase': {
      const text =
        entry.phase === 'face'
          ? `Started facing dilemmas at ${entry.mission}`
          : `Went back to the dilemma choice at ${entry.mission}`;
      return entry.returned?.length
        ? `${text}, and moved ${cardsText(entry.returned)} to the bottom of the dilemma pile`
        : text;
    }
    case 'chargeCorrected': {
      const source = typeof entry.source === 'string' && entry.source ? entry.source : '';
      // "Revealed Hogue (The New Resistance): a Dissident" (#1763).
      if (isRevealedCard(entry.revealed)) {
        return `Revealed ${entry.revealed.name}${source ? ` (${source})` : ''}: ${entry.revealed.dissident ? 'a Dissident' : 'not a Dissident'}`;
      }
      // "Destroyed Delivery Boy: charged Machinations 0 counters (was 2)" (#1713).
      if (isUsedCard(entry.used)) {
        return `${USED_VERBS[entry.used.effect]} ${entry.used.name}: charged ${entry.card ?? 'a card'} ${countersText(entry.to)} (was ${entry.from})`;
      }
      // " (Tacking Into the Wind, completed missions of the opponent: 2)" for a counted choice (#1695).
      const what = typeof entry.counted === 'string' && entry.counted ? `, ${entry.counted.toLowerCase()}` : '';
      const counted = source && isIndex(entry.count) ? `${what}: ${entry.count}` : '';
      // "Discarded A, B and C from the top of the draw deck: charged Type III Galor 4 counters (was 6)" (#1744).
      const discarded = Array.isArray(entry.discarded) ? entry.discarded.filter((n) => typeof n === 'string') : [];
      if (discarded.length) {
        return `Discarded ${cardsText(discarded)} from the top of the draw deck: charged ${entry.card ?? 'a card'} ${countersText(entry.to)} (was ${entry.from})${
          source ? ` (${source})` : ''
        }`;
      }
      // ", named Wavefront" for a choice that names a dilemma (#1761).
      const named = typeof entry.named === 'string' && entry.named ? `, named ${entry.named}` : '';
      return `Charged ${entry.draw ? 'a draw' : (entry.card ?? 'a card')} ${countersText(entry.to)} (was ${entry.from})${
        source ? ` (${source}${counted}${named})` : ''
      }`;
    }
    case 'counterLimit': {
      const text = `et this turn's counters to ${entry.limit}${typeof entry.source === 'string' && entry.source ? ` (${entry.source})` : ''}`;
      // "Stopped Data, Kira Nerys (2 affiliations): set this turn's counters to 9 (Common Purpose)" (#1712).
      const stopped = Array.isArray(entry.stopped) ? entry.stopped.filter((n) => typeof n === 'string') : [];
      if (!stopped.length) return `S${text}`;
      const n = isIndex(entry.affiliations) ? entry.affiliations : null;
      return `Stopped ${stopped.join(', ')}${n !== null ? ` (${n} ${n === 1 ? 'affiliation' : 'affiliations'})` : ''}: s${text}`;
    }
    case 'eventsDownloaded': {
      // "Downloaded Ferengi Tradition and At What Cost? (K'mtar), then shuffled the draw deck" (#1762).
      const names = downloadedCards(entry).map((c) => c.name);
      const source = typeof entry.source === 'string' && entry.source ? ` (${entry.source})` : '';
      return `Downloaded ${names.length ? cardsText(names) : 'no card'}${source}, then shuffled the draw deck`;
    }
    case 'discountDismissed':
      return `Dismissed the discount of ${typeof entry.source === 'string' && entry.source ? entry.source : 'a card'}`;
    case 'playCancelled':
      return `Cancelled playing ${typeof entry.card === 'string' && entry.card ? entry.card : 'a card'}${
        entry.returnedTo === 'discard' ? ', and it went back to the discard pile' : ''
      }`;
    case 'resolveDrew': {
      // "Drew 4 cards (These Are The Voyages, Data cost 4)" (#1739).
      const n = isIndex(entry.count) ? entry.count : 0;
      const event = typeof entry.event === 'string' && entry.event ? entry.event : 'an event';
      const personnel =
        typeof entry.personnel === 'string' && entry.personnel && isIndex(entry.personnelCost)
          ? `, ${entry.personnel} cost ${entry.personnelCost}`
          : '';
      return `Drew ${n} ${n === 1 ? 'card' : 'cards'} (${event}${personnel})`;
    }
    case 'resolveBottom': {
      // "Put 3 cards on the bottom of the draw deck, and These Are The Voyages went to the discard pile".
      const n = isIndex(entry.count) ? entry.count : 0;
      const event = typeof entry.event === 'string' && entry.event ? entry.event : 'the event';
      return n > 0
        ? `Put ${n} ${n === 1 ? 'card' : 'cards'} on the bottom of the draw deck, and ${event} ${eventWent(entry)}`
        : `${event} ${eventWent(entry)}`;
    }
    case 'resolveDiscardDraw': {
      // "Discarded Tricorder, drew 2 cards, and Days of Atonement went to the discard pile" (#1745).
      const n = isIndex(entry.count) ? entry.count : 0;
      const event = typeof entry.event === 'string' && entry.event ? entry.event : 'the event';
      const discarded = typeof entry.discarded === 'string' && entry.discarded ? entry.discarded : 'a card';
      return `Discarded ${discarded}, drew ${n} ${n === 1 ? 'card' : 'cards'}, and ${event} ${eventWent(entry)}`;
    }
    case 'resolveDownloaded': {
      // "Downloaded Data (Second Edition), shuffled the draw deck, drew 1 card, and Second Edition went to the
      // discard pile" (#1746), with no draw clause for a personnel that is not [AU].
      const n = isIndex(entry.count) ? entry.count : 0;
      const event = typeof entry.event === 'string' && entry.event ? entry.event : 'the event';
      const personnel = typeof entry.personnel === 'string' && entry.personnel ? entry.personnel : 'a personnel';
      const drew = n > 0 ? `, drew ${n} ${n === 1 ? 'card' : 'cards'}` : '';
      return `Downloaded ${personnel} (${event}), shuffled the draw deck${drew}, and ${event} ${eventWent(entry)}`;
    }
    case 'resolveExchanged': {
      // "Exchanged Danara Pel for Motura, and Vidiian Organ Bank went to the discard pile" (#1765): the hand's
      // personnel first, the table's second.
      const event = typeof entry.event === 'string' && entry.event ? entry.event : 'the event';
      const fromHand = typeof entry.fromHand === 'string' && entry.fromHand ? entry.fromHand : 'a personnel';
      const fromTable = typeof entry.fromTable === 'string' && entry.fromTable ? entry.fromTable : 'a personnel';
      // The Crossing (#1826): "Replaced Archer with Reed, Archer went to the discard pile, and The Crossing went
      // to the discard pile".
      if (entry.replaced === true) return `Replaced ${fromTable} with ${fromHand}, ${fromTable} went to the discard pile, and ${event} ${eventWent(entry)}`;
      return `Exchanged ${fromHand} for ${fromTable}, and ${event} ${eventWent(entry)}`;
    }
    case 'effectStep':
      return effectStepEntryText(entry);
    case 'missionSpend': {
      // "Spent 1 counter at Earth Lush and Beautiful Home, and drew 2 cards".
      const spent = `Spent ${countersText(isIndex(entry.cost) ? entry.cost : 0)} at ${entry.mission}`;
      if (entry.spend === 'earth') {
        const n = isIndex(entry.drew) ? entry.drew : 0;
        return `${spent}, and drew ${n} ${n === 1 ? 'card' : 'cards'}`;
      }
      return `${spent}, and downloaded ${entry.downloaded ?? 'a card'} into its away team`;
    }
    case 'orderUsed':
      return orderUsedText(entry);
    case 'orderEffect': {
      const card = typeof entry.card === 'string' && entry.card ? entry.card : 'a card';
      return `${card}'s order: ${isPlayEffectRecord(entry.effect) ? orderStepsText(entry.effect) : 'no effect'}`;
    }
    case 'triggerUsed':
      return triggerUsedText(entry);
    case 'triggerEffect': {
      const card = typeof entry.card === 'string' && entry.card ? entry.card : 'a card';
      return `${card}: ${isPlayEffectRecord(entry.effect) ? playEffectText(entry.effect) : 'no effect'}`;
    }
    case 'attemptAbilityUsed':
      return attemptAbilityUsedText(entry);
    case 'triggerSkipped':
      return `Skipped ${typeof entry.card === 'string' && entry.card ? entry.card : 'a card'}`;
    case 'playEffect': {
      // "Enabran Tain: discarded Tricorder and Phaser" (#1800).
      const card = typeof entry.card === 'string' && entry.card ? entry.card : 'a card';
      return `${card}: ${isPlayEffectRecord(entry.effect) ? playEffectText(entry.effect) : 'no effect'}`;
    }
  }
}

const USED_VERBS: Record<CostUseEffect, string> = { destroy: 'Destroyed', stop: 'Stopped', revealTop: 'Revealed' };

const isRevealedCard = (revealed: unknown): revealed is { id: string; name: string; dissident: boolean } => {
  const r = revealed as { id?: unknown; name?: unknown; dissident?: unknown } | null | undefined;
  return !!r && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.dissident === 'boolean';
};

const isUsedCard = (used: unknown): used is LogUsedCard => {
  const u = used as LogUsedCard | null | undefined;
  return !!u && typeof u.id === 'string' && typeof u.name === 'string' && Object.hasOwn(USED_VERBS, u.effect);
};

// "1 counter", "3 counters".
const countersText = (n: number): string => `${n} ${n === 1 ? 'counter' : 'counters'}`;

// The rulebook names of the segments of a turn (#1605), the headings of the log.
export const TURN_SEGMENT_HEADINGS: Record<TurnSegment, string> = {
  playAndDraw: 'Play and Draw Cards',
  orders: 'Execute Orders',
  discard: 'Discard Excess Cards',
};

// The segment of an entry: play and draw for an entry from before #1605, or one with a value the
// table does not know.
export const entrySegment = (entry: LogEntry): TurnSegment =>
  entry.segment && TURN_SEGMENTS.includes(entry.segment) ? entry.segment : 'playAndDraw';

export interface LogSegmentGroup {
  segment: TurnSegment;
  entries: LogEntry[];
}

// The entries of each turn, oldest first, and within a turn each run of entries of one segment
// (#1605).
export function logByTurn(log: LogEntry[]): { turn: number; entries: LogEntry[]; segments: LogSegmentGroup[] }[] {
  const groups: { turn: number; entries: LogEntry[]; segments: LogSegmentGroup[] }[] = [];
  for (const entry of log) {
    const segment = entrySegment(entry);
    let last = groups[groups.length - 1];
    if (!last || last.turn !== entry.turn) {
      last = { turn: entry.turn, entries: [], segments: [] };
      groups.push(last);
    }
    last.entries.push(entry);
    const run = last.segments[last.segments.length - 1];
    if (run && run.segment === segment) run.entries.push(entry);
    else last.segments.push({ segment, entries: [entry] });
  }
  return groups;
}

export interface SegmentCounters {
  cards: number;
  draws: number;
}

// The counters the entries of one play and draw segment charged (#1606): the printed costs of the
// cards played and the draws at 1. Null when nothing charged, so no total shows. It is derived from
// the entries alone, so an undo, which drops an entry, takes its cost off the total.
export function segmentCounters(entries: LogEntry[]): SegmentCounters | null {
  let cards = 0;
  let draws = 0;
  let charged = false;
  for (const entry of entries) {
    if (entry.kind === 'draw' && typeof entry.cost === 'number') {
      draws += entry.cost;
      charged = true;
    }
    // A mission's spend (#1754): Earth's buys draws, Nimbus III's a card.
    if (entry.kind === 'missionSpend' && typeof entry.cost === 'number') {
      if (entry.spend === 'earth') draws += entry.cost;
      else cards += entry.cost;
      charged = true;
    }
    if (entry.kind === 'move') {
      for (const move of entry.moves) {
        for (const cost of moveCosts(move) ?? []) {
          if (cost === null) continue;
          cards += cost;
          charged = true;
        }
      }
    }
  }
  return charged ? { cards, draws } : null;
}

// "7 counters: 6 on cards, 1 on draws".
export const segmentCountersText = ({ cards, draws }: SegmentCounters): string => {
  return `${countersText(cards + draws)}: ${cards} on cards, ${draws} on draws`;
};

// The total line of a segment of the log, only for a play and draw segment that charged counters.
export function segmentTotalText(segment: TurnSegment, entries: LogEntry[]): string | null {
  if (segment !== 'playAndDraw') return null;
  const counters = segmentCounters(entries);
  return counters ? segmentCountersText(counters) : null;
}

export const EMPTY_LOG_TEXT = 'Nothing has happened yet.';

// The whole log as plain text for the clipboard: a "Turn N" line, then under it each segment's
// heading and one line per entry.
export function gameLogText(log: LogEntry[]): string {
  if (log.length === 0) return EMPTY_LOG_TEXT;
  return logByTurn(effectiveLog(log))
    .map(({ turn, segments }) =>
      [
        `Turn ${turn}`,
        ...segments.flatMap(({ segment, entries }) => {
          const total = segmentTotalText(segment, entries);
          return [TURN_SEGMENT_HEADINGS[segment], ...(total ? [total] : []), ...entries.map((e) => `- ${logEntryText(e)}`)];
        }),
      ].join('\n')
    )
    .join('\n\n');
}

// The counters of a turn (#1607): 7, the grants of the cost models (#1655), and the player's changes to the limit.
export const TURN_COUNTER_LIMIT = 7;

const isIndex = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

// The entry `target` names with the charge it sets to `cost`, or null when it names no charge.
function withCorrectedCharge(entry: LogEntry, target: ChargeTarget, cost: number): LogEntry | null {
  if (entry.kind === 'draw' || entry.kind === 'missionSpend') {
    return target.move === undefined && typeof entry.cost === 'number' ? { ...entry, cost } : null;
  }
  if (entry.kind !== 'move' || !isIndex(target.move) || !isIndex(target.card)) return null;
  const move = entry.moves[target.move];
  const costs = move ? moveCosts(move) : null;
  if (!costs || costs[target.card] === null || costs[target.card] === undefined) return null;
  const moves = entry.moves.map((m, i) =>
    i === target.move ? { ...m, costs: costs.map((c, j) => (j === target.card ? cost : c)) } : m
  );
  return { ...entry, moves };
}

// The entry `target` names with that card's play taken out (#1728): its cost null, so no reader counts it
// as a play, and the move reads as a plain move. Null when it names no play.
function withCancelledPlay(entry: LogEntry, target: ChargeTarget): LogEntry | null {
  if (entry.kind !== 'move' || !isIndex(target.move) || !isIndex(target.card)) return null;
  const move = entry.moves[target.move];
  const costs = move ? moveCosts(move) : null;
  if (!costs || costs[target.card] === null || costs[target.card] === undefined) return null;
  const moves = entry.moves.map((m, i) =>
    i === target.move ? { ...m, costs: costs.map((c, j) => (j === target.card ? null : c)) } : m
  );
  return { ...entry, moves };
}

const effectiveCache = new WeakMap<LogEntry[], LogEntry[]>();

// The log with each charge at the cost of the last correction aimed at it (#1607). The play's own
// entry then reads the corrected cost, and the totals count it. A correction made in orders lands in
// the orders group, while its charge sits in play and draw, so this runs over the whole log before
// `logByTurn` groups it. A log with no correction is returned as it is.
// A Cancel of the resolving event (#1728) takes its play out: the counters it spent go back, the
// discount it used waits again, and the standing rules no longer count it.
export function effectiveLog(log: LogEntry[]): LogEntry[] {
  const cached = effectiveCache.get(log);
  if (cached) return cached;
  let result = log;
  log.forEach((entry, i) => {
    if (entry.kind === 'playCancelled') {
      if (!entry.target || !isIndex(entry.target.entry) || entry.target.entry >= i) return;
      const cancelled = withCancelledPlay(result[entry.target.entry], entry.target);
      if (!cancelled) return;
      if (result === log) result = [...log];
      result[entry.target.entry] = cancelled;
      return;
    }
    if (entry.kind !== 'chargeCorrected' || !entry.target || !isIndex(entry.target.entry) || entry.target.entry >= i) return;
    if (typeof entry.to !== 'number' || entry.to < 0) return;
    const corrected = withCorrectedCharge(result[entry.target.entry], entry.target, entry.to);
    if (!corrected) return;
    if (result === log) result = [...log];
    result[entry.target.entry] = corrected;
  });
  effectiveCache.set(log, result);
  return result;
}

// One charge, read from the effective log: its card (null for an unseen card), whether it is a draw,
// and its cost.
export interface LogCharge {
  target: ChargeTarget;
  card: LogCard;
  draw: boolean;
  cost: number;
  // Where the table's cost came from (#1654), and whether the player took its choice: a correction
  // aimed at this charge names the choice's source.
  source?: CostSource;
  choiceTaken?: boolean;
  // The count of a counted choice (#1695): the `count` of the last correction that names the source and
  // aims at this charge, 0 with none.
  choiceCount?: number;
  // The uses the cards on the table offered for this play (#1713), each `used` once a correction aimed
  // at this charge names its card. Absent with none.
  uses?: LogChargeUse[];
}

export interface LogChargeUse extends CostUse {
  used: boolean;
}

// The charges of the entry at `index` of an effective log.
function chargesOf(entry: LogEntry, index: number): LogCharge[] {
  if (entry.kind === 'draw' && typeof entry.cost === 'number') {
    return [{ target: { entry: index }, card: null, draw: true, cost: entry.cost }];
  }
  if (entry.kind === 'missionSpend' && typeof entry.cost === 'number') {
    return [{ target: { entry: index }, card: missionSpendLabel(entry), draw: false, cost: entry.cost }];
  }
  if (entry.kind !== 'move') return [];
  return entry.moves.flatMap((move, m) => {
    const sources = moveSources(move);
    const uses = moveUses(move);
    return (moveCosts(move) ?? []).flatMap((cost, c) =>
      cost === null
        ? []
        : [
            {
              target: { entry: index, move: m, card: c },
              card: move.cards[c] ?? null,
              draw: false,
              cost,
              ...(sources[c] ? { source: sources[c]! } : {}),
              ...(uses[c].length ? { uses: uses[c].map((u) => ({ ...u, used: false })) } : {}),
            },
          ]
    );
  });
}

// The charges with `choiceTaken` set where a correction in `log` took the choice of the charge's source:
// a `chargeCorrected` of its cost, or a `counterLimit` of the turn's limit (#1655), aimed at the charge.
function withChoicesTaken(log: LogEntry[], charges: LogCharge[]): LogCharge[] {
  return charges.map(withUsesTaken(log)).map((charge) => {
    if (isCountedChoice(charge.source?.choice)) return { ...charge, choiceCount: choiceCountOf(log, charge) };
    const taken =
      !!charge.source?.choice &&
      log.some(
        (e) =>
          (e.kind === 'chargeCorrected' || e.kind === 'counterLimit' || e.kind === 'eventsDownloaded') &&
          !(e.kind === 'chargeCorrected' && e.used) &&
          e.source === charge.source!.title &&
          !!e.target &&
          sameTarget(e.target, charge.target)
      );
    return taken ? { ...charge, choiceTaken: true } : charge;
  });
}

// The charge with each use marked `used` where a `chargeCorrected` aimed at it names the use's card (#1713).
const withUsesTaken =
  (log: LogEntry[]) =>
  (charge: LogCharge): LogCharge =>
    charge.uses
      ? {
          ...charge,
          uses: charge.uses.map((use) => ({
            ...use,
            used: log.some(
              (e) => e.kind === 'chargeCorrected' && isUsedCard(e.used) && e.used.id === use.id && !!e.target && sameTarget(e.target, charge.target)
            ),
          })),
        }
      : charge;

// The counters the uses taken on `charge` took off (#1713).
const usedAmount = (charge: LogCharge): number => (charge.uses ?? []).reduce((sum, u) => (u.used ? sum + u.amount : sum), 0);

// The count of a counted choice of `charge` (#1695): the `count` of the last `chargeCorrected` that names
// its source and aims at it, or 0.
function choiceCountOf(log: LogEntry[], charge: LogCharge): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (
      e.kind === 'chargeCorrected' &&
      !e.used &&
      e.source === charge.source?.title &&
      !!e.target &&
      sameTarget(e.target, charge.target) &&
      isIndex(e.count)
    ) {
      return e.count;
    }
  }
  return 0;
}

// The charges of the entry at `index` (#1607), corrected.
export const entryCharges = (log: LogEntry[], index: number): LogCharge[] => {
  const entry = effectiveLog(log)[index];
  return entry ? withChoicesTaken(log, chargesOf(entry, index)) : [];
};

// The charges of `turn`, in order: every one of its play and draw segment, corrected.
export const turnCharges = (log: LogEntry[], turn: number): LogCharge[] =>
  withChoicesTaken(
    log,
    effectiveLog(log).flatMap((entry, i) => (entry.turn === turn && entrySegment(entry) === 'playAndDraw' ? chargesOf(entry, i) : []))
  );

// The limit of counters of `turn` before any cap: 7, the `grants` of the cost models (#1655), and the
// turn's changes, never below 0. A new turn starts at 7 and its grants. The grants read the table as it
// stands now, so they belong to the current turn, the one the counter shows.
// The grants the log keeps for `turn` (#1755): those of its opening hand, decided at the Draw 7 tap. A
// malformed grant of an old save is left out.
export const loggedGrantsOf = (log: LogEntry[], turn: number): LimitGrant[] =>
  log.flatMap((e) =>
    e.kind === 'openingHand' && e.turn === turn && Array.isArray(e.grants)
      ? e.grants.filter((g) => !!g && typeof g.title === 'string' && typeof g.reason === 'string' && typeof g.amount === 'number' && Number.isFinite(g.amount))
      : []
  );

export const uncappedTurnCounterLimit = (log: LogEntry[], turn: number, grants: LimitGrant[] = []): number =>
  Math.max(
    0,
    log.reduce(
      (limit, e) => (e.kind === 'counterLimit' && e.turn === turn && typeof e.delta === 'number' ? limit + e.delta : limit),
      [...grants, ...loggedGrantsOf(log, turn)].reduce((sum, g) => sum + g.amount, TURN_COUNTER_LIMIT)
    )
  );

// The limit of counters of `turn`: the uncapped limit, never above the `caps` of the cost models (#1704).
// The changes of the turn keep their deltas against the uncapped limit, so a raise under a cap counts
// once the cap goes.
export const turnCounterLimit = (log: LogEntry[], turn: number, grants: LimitGrant[] = [], caps: LimitCap[] = []): number =>
  cappedLimit(uncappedTurnCounterLimit(log, turn, grants), caps);

// A choice of the turn (#1704) and whether the player took a choice of its model this turn.
export interface TurnChoiceState extends TurnLimitChoice {
  taken: boolean;
}

// Whether the player took a choice of the turn of the model `title` in `turn` (#1704): a `counterLimit`
// of the turn that names it and no charge.
const turnChoiceTaken = (log: LogEntry[], turn: number, title: string): boolean =>
  log.some((e) => e.kind === 'counterLimit' && e.turn === turn && e.source === title && !e.target);

export interface TurnCounters {
  spent: number;
  limit: number;
  // The grants of the cost models to the limit (#1655), "Surprise Party +1".
  grants: LimitGrant[];
  // The caps of the cost models on the limit (#1704), with the limit before them, absent with none.
  caps?: LimitCap[];
  uncapped?: number;
  // The choices of the turn of the cost models (#1704), absent with none.
  choices?: TurnChoiceState[];
}

// What the cost models make of the current turn's limit, from the table as it stands: the grants
// (#1655), the caps and the choices of the turn (#1704).
export interface TableLimits {
  grants: LimitGrant[];
  caps: LimitCap[];
  choices: TurnLimitChoice[];
}

export const tableLimits = (table: TableState): TableLimits => {
  const facts = costFactsOf(table, []);
  return { grants: limitGrantsOf(facts), caps: limitCapsOf(facts), choices: turnChoicesOf(facts) };
};

// The grants of the cost models to the current turn's limit (#1655), from the table as it stands.
export const tableLimitGrants = (table: TableState): LimitGrant[] => limitGrantsOf(costFactsOf(table, []));

// The counters `turn` spent and its limit, derived from the log and the grants, caps and choices of the
// table, so an undo, a redo and a reload agree.
export const turnCounters = (
  log: LogEntry[],
  turn: number,
  grants: LimitGrant[] = [],
  caps: LimitCap[] = [],
  choices: TurnLimitChoice[] = []
): TurnCounters => {
  const uncapped = uncappedTurnCounterLimit(log, turn, grants);
  return {
    spent: turnCharges(log, turn).reduce((sum, c) => sum + c.cost, 0),
    limit: cappedLimit(uncapped, caps),
    grants: [...grants, ...loggedGrantsOf(log, turn)],
    ...(caps.length ? { caps, uncapped } : {}),
    ...(choices.length ? { choices: choices.map((c) => ({ ...c, taken: turnChoiceTaken(log, turn, c.title) })) } : {}),
  };
};

const sameTarget = (a: ChargeTarget, b: ChargeTarget): boolean => a.entry === b.entry && a.move === b.move && a.card === b.card;

// The entry of a correction of a charge, or null when the action names no charge or changes nothing.
// A cost below 0 is 0.
// A counted choice's correction (#1695) names its count, and makes an entry when only the count changes.
function chargeCorrectionEntry(
  state: GameState,
  action: { target: ChargeTarget; cost: number; source?: string; count?: number; named?: string }
): LogEntry | null {
  const charge = entryCharges(state.log, action.target.entry).find((c) => sameTarget(c.target, action.target));
  if (!charge) return null;
  // A choice of the played card's model sets the cost it offered less the uses already taken on the play
  // (#1713), so a use and the choice sum in either order. A plain Free, minus or plus sets what it says.
  const used = action.source && action.source === charge.source?.title ? usedAmount(charge) : 0;
  const to = Math.max(0, Math.round(action.cost) - used);
  if (!Number.isFinite(to)) return null;
  const choice = charge.source?.choice;
  const counted =
    action.source &&
    action.source === charge.source?.title &&
    isCountedChoice(choice) &&
    isIndex(action.count) &&
    action.count <= choice.max
      ? { count: action.count, counted: choice.label }
      : null;
  // A choice not taken yet makes its entry even when the uses already took the cost to where it leads (#1713).
  const takesChoice = !!action.source && action.source === charge.source?.title && !!choice && !isCountedChoice(choice) && !charge.choiceTaken;
  // A choice that names a dilemma (#1761) takes a title, and makes no entry without one.
  const nameDilemma = takesChoice && !!choice && 'nameDilemma' in choice && choice.nameDilemma === true;
  const named = nameDilemma && typeof action.named === 'string' ? action.named.trim() : '';
  if (nameDilemma && !named) return null;
  if (to === charge.cost && !takesChoice && (!counted || counted.count === (charge.choiceCount ?? 0))) return null;
  return {
    kind: 'chargeCorrected',
    target: charge.target,
    ...(charge.draw ? { draw: true as const } : { card: charge.card }),
    from: charge.cost,
    to,
    ...(action.source ? { source: action.source } : {}),
    ...(counted ?? {}),
    ...(named ? { named } : {}),
    turn: state.table.turn,
    segment: state.table.segment,
  };
}

// The entry of a change of the current turn's limit, or null at 0 going down. A change by a model's
// choice names its source and the charge that offered it (#1655), or no charge for a choice of the turn
// (#1704), which a model makes once a turn. Under a cap (#1704) a raise still counts, against the uncapped
// limit, and a lowering lowers the limit shown.
function counterLimitEntry(state: GameState, action: { delta: number; source?: string; target?: ChargeTarget }): LogEntry | null {
  const { turn } = state.table;
  if (action.source && !action.target && turnChoiceTaken(state.log, turn, action.source)) return null;
  const { grants, caps } = tableLimits(state.table);
  const uncapped = uncappedTurnCounterLimit(state.log, turn, grants);
  const shown = cappedLimit(uncapped, caps);
  const delta = Math.round(action.delta);
  const from = delta < 0 ? shown : uncapped;
  const next = Math.max(0, from + delta);
  if (!Number.isFinite(next) || next === from) return null;
  return {
    kind: 'counterLimit',
    delta: next - uncapped,
    limit: cappedLimit(next, caps),
    ...(action.source ? { source: action.source } : {}),
    ...(action.source && action.target ? { target: action.target } : {}),
    turn,
    segment: state.table.segment,
  };
}

// A choice of personnel (#1712): the play's charge must offer it, under `source`, and not have taken it.
// The ids are filtered to the unstopped personnel the player commands as the table stands, so a stale,
// stopped or brig id is dropped. The chosen are stopped, and the limit rises by their different
// affiliations, in one `counterLimit` entry whose undo snapshot is the table before the stops. Nobody
// chosen changes nothing.
function choosePersonnelState(state: GameState, action: { ids: string[]; source: string; target: ChargeTarget }): GameState {
  const charge = entryCharges(state.log, action.target.entry).find((c) => sameTarget(c.target, action.target));
  if (!charge || charge.choiceTaken || charge.source?.title !== action.source || !isPersonnelChoice(charge.source.choice)) {
    return state;
  }
  const chosen = chosenPersonnel(state.table, action.ids);
  if (!chosen.length) return state;
  const affiliations = personnelChoiceDelta(chosen);
  // One personnel or more give one affiliation or more, so the limit always moves; should it not, the
  // entry still records the stops, with a delta of 0.
  const { turn, segment } = state.table;
  const { grants, caps } = tableLimits(state.table);
  const limit = counterLimitEntry(state, { delta: affiliations, source: action.source, target: charge.target }) ?? {
    kind: 'counterLimit' as const,
    delta: 0,
    limit: turnCounterLimit(state.log, turn, grants, caps),
    source: action.source,
    target: charge.target,
    turn,
    segment,
  };
  const entry = { ...limit, stopped: chosen.map((c) => c.name), affiliations } as LogEntry;
  const table = tableReducer(state.table, { type: 'setStopped', ids: chosen.map((c) => c.id), stopped: true });
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The cards of an `eventsDownloaded` entry (#1762), the malformed ones dropped.
const downloadedCards = (entry: { cards?: unknown }): { id: string; name: string }[] =>
  Array.isArray(entry.cards)
    ? entry.cards.filter((c): c is { id: string; name: string } => !!c && typeof c.id === 'string' && typeof c.name === 'string')
    : [];

// The counters each card of an `eventsDownloaded` entry takes off its own play: the discount of the choice
// of the charge it took, or 0 when that charge is gone or offers no download.
function downloadDiscountOf(log: LogEntry[], entry: { target?: ChargeTarget }): number {
  if (!entry.target || !isIndex(entry.target.entry)) return 0;
  const charge = entryCharges(log, entry.target.entry).find((c) => sameTarget(c.target, entry.target!));
  return isDownloadChoice(charge?.source?.choice) ? charge.source.choice.discount : 0;
}

// A download of the play's charge (#1762, K'mtar): the charge must offer a download choice, under `source`,
// not taken. The ids must be 1 to the choice's most different cards of its type in the draw deck. They go to
// the hand, the draw deck shuffles in the carried `order` (a missing or stale one leaves it as it is), and
// one `eventsDownloaded` entry records them by id, for the discount each leaves (`pendingDiscountsOf`).
function downloadForChargeState(state: GameState, action: { ids: string[]; source: string; target: ChargeTarget; order?: string[] }): GameState {
  const charge = entryCharges(state.log, action.target.entry).find((c) => sameTarget(c.target, action.target));
  const choice = charge?.source?.choice;
  if (!charge || charge.choiceTaken || charge.source?.title !== action.source || !isDownloadChoice(choice)) return state;
  const ids = [...new Set(action.ids)];
  if (ids.length !== action.ids.length || ids.length < 1 || ids.length > choice.max) return state;
  const cards = ids.map((id) => state.table.drawDeck.find((c) => c.id === id));
  if (!cards.every((c) => c?.card?.type === choice.download)) return state;
  let table = ids.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'hand' }), state.table);
  table = tableReducer(table, { type: 'shuffle', location: 'drawDeck', order: action.order ?? table.drawDeck.map((c) => c.id) });
  const entry: LogEntry = {
    kind: 'eventsDownloaded',
    target: charge.target,
    source: action.source,
    cards: ids.map((id) => ({ id, name: cardName(state.table, id) })),
    turn: state.table.turn,
    segment: state.table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// Whether the card of `use` still stands where its effect needs it (#1713): in the core for a destroy, and
// for a stop unstopped in an away team or a crew, never the brig. With the `log`, a use with a `limit` (#1834)
// that its card already took that many times this turn is not available either.
export function costUseAvailable(table: TableState, use: Pick<CostUse, 'id' | 'effect' | 'title' | 'limit'>, log?: LogEntry[]): boolean {
  if (log && !abilityUsable(log, table.turn, { kind: 'tableUse', id: use.id, title: use.title }, use.limit)) return false;
  if (use.effect === 'destroy') return table.core.some((c) => c.id === use.id);
  if (use.effect === 'revealTop') return table.core.some((c) => c.id === use.id) && table.drawDeck.length > 0;
  return table.missions.some((slot) =>
    [...slot.awayTeam, ...slot.ships.flatMap((ship) => ship.crew ?? [])].some((c) => c.id === use.id && c.card?.type === 'personnel' && !c.stopped)
  );
}

// A use of a card on the table (#1713): the play's charge must offer it, not have taken it, and its card
// must still stand where the effect needs it. The card is destroyed (moved to the discard pile) or
// stopped, and the charge goes down by the use's amount, never below 0, in one `chargeCorrected` entry
// whose undo snapshot is the table before the effect.
function cardUseState(state: GameState, action: { target: ChargeTarget; id: string }): GameState {
  const charge = entryCharges(state.log, action.target.entry).find((c) => sameTarget(c.target, action.target));
  const use = charge?.uses?.find((u) => u.id === action.id);
  if (!charge || !use || use.used || !costUseAvailable(state.table, use, state.log)) return state;
  if (use.effect === 'revealTop') {
    // The New Resistance (#1763): the top card of the draw deck is revealed, and no card moves; the entry
    // records it and whether it is a Dissident personnel, which lets it play from the draw deck at −3.
    const top = state.table.drawDeck[0];
    const play = costPlayOf(top.card, top.id);
    const entry: LogEntry = {
      kind: 'chargeCorrected',
      target: charge.target,
      card: charge.card,
      from: charge.cost,
      to: charge.cost,
      source: use.title,
      used: { id: use.id, name: cardName(state.table, use.id), effect: use.effect },
      revealed: { id: top.id, name: cardName(state.table, top.id), dissident: play.type === 'personnel' && (play.keywords ?? []).includes('dissident') },
      turn: state.table.turn,
      segment: state.table.segment,
    };
    return { table: state.table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
  }
  const table = tableReducer(
    state.table,
    use.effect === 'destroy' ? { type: 'move', id: use.id, to: 'discard' } : { type: 'setStopped', ids: [use.id], stopped: true }
  );
  if (table === state.table) return state;
  const entry: LogEntry = {
    kind: 'chargeCorrected',
    target: charge.target,
    card: charge.card,
    from: charge.cost,
    to: Math.max(0, charge.cost - use.amount),
    source: use.title,
    used: { id: use.id, name: cardName(state.table, use.id), effect: use.effect },
    turn: state.table.turn,
    segment: state.table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// A `discardTop` choice (#1744): the play's charge must offer it, under `source`, and not have taken it, and
// the draw deck must hold as many cards as it discards. The top cards go to the discard pile, top first, and
// the cost becomes the choice's, in one `chargeCorrected` entry that names them, whose undo snapshot is the
// table before the discard.
function discardForChargeState(state: GameState, action: { target: ChargeTarget; source: string }): GameState {
  const charge = entryCharges(state.log, action.target.entry).find((c) => sameTarget(c.target, action.target));
  const choice = charge?.source?.choice;
  const n = choiceDiscardTop(choice);
  if (!charge || charge.choiceTaken || charge.source?.title !== action.source || !n || choice?.cost === undefined) return state;
  const top = state.table.drawDeck.slice(0, n);
  if (top.length < n) return state;
  const correction = chargeCorrectionEntry(state, { target: action.target, cost: choice.cost, source: action.source });
  if (!correction) return state;
  const table = top.reduce((t, c) => tableReducer(t, { type: 'move', id: c.id, to: 'discard' }), state.table);
  const entry = { ...correction, discarded: top.map((c) => cardName(state.table, c.id)) } as LogEntry;
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The entry of a dismiss of a pending discount (#1656), or null when no pending discount of the
// current turn came from the play at `target`.
function discountDismissedEntry(state: GameState, action: { target: ChargeTarget }): LogEntry | null {
  const discount = pendingDiscountsOf(state.log, state.table.turn).find((d) => sameTarget(d.origin, action.target));
  if (!discount) return null;
  return {
    kind: 'discountDismissed',
    target: { ...discount.origin },
    source: discount.title,
    turn: state.table.turn,
    segment: state.table.segment,
  };
}

// The charge of the play that moved the resolving event in (#1728): the last move into the resolving zone
// in the effective log. The zone holds one card and a move is the one way in, and undo drops the later
// entries, so that move is this card's. Null when that move charged nothing, outside play and draw.
function resolvingPlayOf(log: LogEntry[], name: string): ChargeTarget | null {
  return resolvingMoveOf(log, name)?.target ?? null;
}

// The last move into the resolving zone in the effective log (#1764), with its charge, or null with none.
function resolvingMoveOf(log: LogEntry[], name: string): { target: ChargeTarget | null; fromDiscard: boolean } | null {
  const effective = effectiveLog(log);
  for (let i = effective.length - 1; i >= 0; i--) {
    const entry = effective[i];
    if (entry.kind !== 'move') continue;
    for (let m = entry.moves.length - 1; m >= 0; m--) {
      const move = entry.moves[m];
      if (move.to.kind !== 'resolving') continue;
      const c = move.cards.lastIndexOf(name);
      const cost = c >= 0 ? moveCosts(move)?.[c] : null;
      return { target: typeof cost === 'number' ? { entry: i, move: m, card: c } : null, fromDiscard: move.from.kind === 'discard' };
    }
  }
  return null;
}

// Whether the resolving event was recalled (#1764): the play that moved it in, the last move into the
// resolving zone in the effective log, came from the discard pile and was charged. A Recall play is the one
// charged move from the discard pile into the zone, so an undo, a redo and a reload agree.
export function resolvingRecalled(state: { table: TableState; log: LogEntry[] }): boolean {
  const event = state.table.resolving;
  if (!event) return false;
  const move = resolvingMoveOf(state.log, cardName(state.table, event.id));
  return !!move?.fromDiscard && move.target !== null;
}

// The end of a resolve model's last step: the event goes to the discard pile, and a recalled one (#1764) is
// then removed from the game there, as Resolved → Remove from game leaves it.
function finishResolving(table: TableState, id: string, recalled: boolean): TableState {
  const discarded = tableReducer(table, { type: 'move', id, to: 'discard' });
  return recalled && discarded !== table ? tableReducer(discarded, { type: 'setRemovedFromGame', ids: [id], removedFromGame: true }) : discarded;
}

const eventWent = (entry: { removed?: unknown }): string =>
  entry.removed === true ? 'was removed from the game' : 'went to the discard pile';

// A Cancel of the resolving event (#1728): it goes to the end of the hand, uncharged, and the entry names
// its play's charge, which the effective log then reads as no play. Nothing resolving changes nothing.
function cancelResolvingState(state: GameState): GameState {
  const event = state.table.resolving;
  if (!event) return state;
  // A recalled event (#1764) goes back to the end of the discard pile, not marked removed.
  const recalled = resolvingRecalled(state);
  const table = tableReducer(state.table, { type: 'move', id: event.id, to: recalled ? 'discard' : 'hand' });
  if (table === state.table) return state;
  const card = cardName(state.table, event.id);
  const target = resolvingPlayOf(state.log, card);
  const entry: LogEntry = {
    kind: 'playCancelled',
    card,
    ...(target ? { target } : {}),
    ...(recalled ? { returnedTo: 'discard' as const } : {}),
    turn: table.turn,
    segment: table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The stage of the resolving event's resolve model (#1739, #1863), derived from the log so an undo and a reload
// agree: the number of stage records of this event after the latest move of a card into the resolving zone, a
// `resolveDrew` of before #1863 counting as the first of These Are The Voyages' two. Null when nothing resolves,
// the event has no model, or every stage is done.
export function resolveStageOf(state: { table: TableState; log: LogEntry[] }): EffectStage | null {
  const event = state.table.resolving;
  if (!event) return null;
  const name = cardName(state.table, event.id);
  const model = resolveModelOf(name);
  if (!model) return null;
  let done = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (entry.kind === 'effectStep' || entry.kind === 'resolveDrew') {
      if (entry.event !== name || (entry.kind === 'effectStep' && entry.ended)) break;
      done++;
      continue;
    }
    if (
      entry.kind === 'resolveBottom' ||
      entry.kind === 'resolveDiscardDraw' ||
      entry.kind === 'resolveDownloaded' ||
      entry.kind === 'resolveExchanged' ||
      entry.kind === 'playCancelled'
    )
      break;
    if (entry.kind === 'move' && entry.moves.some((m) => m.to.kind === 'resolving')) break;
  }
  return resolveStagesOf(model)[done] ?? null;
}

// The input of a stage (#1863), the fields of the `effectStep` action.
export interface EffectStepInput {
  count?: number;
  personnelId?: string;
  ids?: string[];
  take?: string[];
  bottom?: string[];
  shipId?: string;
  handId?: string;
  tableId?: string;
  order?: string[];
  ruleWarnings?: RuleWarning[];
}

// The effect a stage applies to (#1863): the resolving event when one resolves, as the page shows it, otherwise
// a pending ability of a card, and its current stage. The pending abilities are tried in turn
// (`PENDING_ABILITIES`): the order in progress (#1866, the orders segment), then the "when you play" effect (play
// and draw). A new kind of ability, such as a trigger, joins that list with its own `pending` reader.
type EffectSubject =
  | { kind: 'resolving'; event: CardInstance; name: string; stage: EffectStage; last: boolean }
  | { kind: 'play'; pending: PendingPlayEffect; stage: EffectStage }
  | { kind: 'order'; pending: PendingOrder; stage: EffectStage }
  | { kind: 'trigger'; pending: PendingTrigger; stage: EffectStage };

type PendingSubjectReader = (state: { table: TableState; log: LogEntry[] }) => EffectSubject | null;

const PENDING_ABILITIES: PendingSubjectReader[] = [
  (state) => {
    const pending = pendingOrderOf(state);
    return pending ? { kind: 'order', pending, stage: pending.stage } : null;
  },
  (state) => {
    const pending = pendingPlayEffectOf(state);
    return pending ? { kind: 'play', pending, stage: pending.stage } : null;
  },
  (state) => {
    const pending = pendingTriggerOf(state);
    return pending ? { kind: 'trigger', pending, stage: pending.stage } : null;
  },
];

export function effectSubjectOf(state: { table: TableState; log: LogEntry[] }): EffectSubject | null {
  const event = state.table.resolving;
  if (event) {
    const stage = resolveStageOf(state);
    const model = resolveModelOf(cardName(state.table, event.id));
    if (!stage || !model) return null;
    return { kind: 'resolving', event, name: cardName(state.table, event.id), stage, last: stage.index === resolveStagesOf(model).length - 1 };
  }
  for (const read of PENDING_ABILITIES) {
    const subject = read(state);
    if (subject) return subject;
  }
  return null;
}

/** The name a record gives the stage led by `step` (#1863). */
export const recordStepName = (step: EffectStep): EffectRecordStepName =>
  step.kind === 'discardFromHand' || step.kind === 'discardTop' ? 'discard' : step.kind === 'bottomFromHand' ? 'bottom' : step.kind;

// Draws up to `wanted` cards free, as many as the draw deck holds, and gives the real count, 0 included.
function drawFree(table: TableState, wanted: number): { table: TableState; count: number } {
  let count = 0;
  while (count < wanted) {
    const next = tableReducer(table, { type: 'drawCard', from: 'drawDeck', to: 'hand' });
    if (next === table) break;
    table = next;
    count++;
  }
  return { table, count };
}

// Applies the steps of a stage in order (#1863), checked against the table as each per-kind reducer before it
// checked them: null when the input does not fit the stage, so a stale dispatch changes nothing. The first step
// reads the input; the automatic steps after it read only what came before. A download played aboard the played
// ship (#1811) gives its charged move as `played`, which joins the play's entry.
function runStage(
  state: GameState,
  subject: EffectSubject,
  input: EffectStepInput
): { table: TableState; record: EffectStepRecord; played?: Extract<TableAction, { type: 'move' }> } | null {
  const start = state.table;
  let table = start;
  let record: EffectStepRecord | null = null;
  let picked: CardInstance | undefined;
  let toTop: string | undefined;
  let played: Extract<TableAction, { type: 'move' }> | undefined;
  // The cards the stage's download took, for a `discardTop` after it (#1904).
  let downloaded: CardInstance[] = [];
  const tail: EffectStepTail = {};
  const anyCompleted = start.missions.some((s) => s.completed === true);
  for (const [i, step] of subject.stage.steps.entries()) {
    const lead = i === 0;
    if (step.kind === 'draw') {
      const count = step.count;
      let wanted: number;
      let personnel: { personnel: string; personnelCost: number } | null = null;
      if (count.kind === 'upTo') {
        if (typeof input.count !== 'number' || !Number.isFinite(input.count)) return null;
        wanted = drawUpToCount(count.count, input.count, table.drawDeck.length);
      } else if (count.kind === 'personnelCost') {
        const chosen = personnelCandidateGroups(table, { includeStopped: true })
          .flatMap((g) => g.cards)
          .find((c) => c.id === input.personnelId);
        if (!chosen) return null;
        wanted = printedCost(chosen.card.card);
        picked = chosen.card;
        personnel = { personnel: chosen.name, personnelCost: wanted };
      } else {
        wanted = drawWanted(count, { anyCompleted, pickedIcons: (icon) => cardHasIcon(picked?.card, icon) }) ?? 0;
      }
      const drawn = drawFree(table, wanted);
      table = drawn.table;
      if (lead) record = { step: 'draw', count: drawn.count, ...(personnel ?? {}) };
      // A draw after a pick of an icon (#1746) names no draw when the pick had none.
      else if (count.kind !== 'ifPickedIcon' || wanted > 0) tail.drew = drawn.count;
      continue;
    }
    if (step.kind === 'shuffle') {
      table = tableReducer(table, { type: 'shuffle', location: 'drawDeck', ...(input.order ? { order: input.order } : {}) });
      tail.shuffled = true;
      if (lead) record = { step: 'shuffle' };
      continue;
    }
    if (step.kind === 'discardTop') {
      // Quintessence (#1904): as many as the printed cost of the card the download took, as the draw deck holds.
      const wanted = downloaded.reduce((sum, c) => sum + printedCost(c.card), 0);
      const top = table.drawDeck.slice(0, wanted);
      table = top.reduce<TableState>((t, c) => tableReducer(t, { type: 'move', id: c.id, to: 'discard' }), table);
      tail.discardedTop = top.length;
      continue;
    }
    if (!lead) return null;
    if (step.kind === 'discardFromHand' || step.kind === 'bottomFromHand') {
      if (!Array.isArray(input.ids)) return null;
      const ids = [...new Set(input.ids)];
      // A discard with a test (#1904, Six of Ten) takes only the cards of the hand that pass it.
      const allowed = step.kind === 'discardFromHand' ? discardableFromHand(step, table.hand) : table.hand;
      const n = handCount(step, allowed.length);
      if (ids.length !== input.ids.length || ids.length !== n || !ids.every((id) => allowed.some((c) => c.id === id))) return null;
      // An empty hand blocks a discard the rest of its stage depends on (#1745): the discard is the cost of the draw.
      if (step.kind === 'discardFromHand' && n === 0 && subject.stage.steps.length > 1) return null;
      // A discard with a test is the cost of the stages after it (#1904, Six of Ten): with no such card, the player skips.
      if (step.kind === 'discardFromHand' && n === 0 && step.test) return null;
      if (step.kind === 'discardFromHand') {
        table = ids.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'discard' }), table);
        record = { step: 'discard', cards: ids.map((id) => cardName(start, id)) };
      } else {
        table = ids.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'drawDeck', position: 'bottom' }), table);
        record = { step: 'bottom', count: n };
      }
      continue;
    }
    if (step.kind === 'examine') {
      if (!Array.isArray(input.take) || !Array.isArray(input.bottom)) return null;
      const top = table.drawDeck.slice(0, examineCount(step, table.drawDeck.length));
      const ids = [...input.take, ...input.bottom];
      if (new Set(ids).size !== ids.length || ids.length !== top.length || !top.every((c) => ids.includes(c.id))) return null;
      const max = examineTakeMax(step, costFactsOf(table, []));
      const examined = top.map((c) => c.card);
      if (input.take.length > max || input.take.length < examineTakeMin(step, examined, max)) return null;
      const byId = new Map(top.map((c) => [c.id, c]));
      if (!input.take.every((id) => examineTakes(step, byId.get(id)!.card))) return null;
      const taken = input.take.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'hand' }), table);
      table = input.bottom.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'drawDeck', position: 'bottom' }), taken);
      record = { step: 'examine', taken: input.take.map((id) => cardName(start, id)), bottom: input.bottom.length };
      continue;
    }
    if (step.kind === 'download') {
      const shuffles = subject.stage.steps.some((s) => s.kind === 'shuffle');
      const unshuffled = shuffles ? {} : { shuffled: false };
      if (step.of.kind === 'copyOfCommanded') {
        // Second Edition (#1746): a personnel the player commands with a copy in the draw deck (`downloadCopyOf`).
        const copy = input.personnelId ? downloadCopyOf(table, input.personnelId) : null;
        if (!copy) return null;
        picked = findInstanceAnywhere(table, input.personnelId!)?.instance;
        const next = tableReducer(table, { type: 'move', id: copy.id, to: 'hand' });
        if (next === table) return null;
        table = next;
        record = { step: 'download', cards: [cardName(start, copy.id)], copyOf: cardName(start, input.personnelId!), ...unshuffled };
        continue;
      }
      if (!Array.isArray(input.ids)) return null;
      const ids = [...new Set(input.ids)];
      const most = step.to.kind === 'hand' ? step.upTo : 1;
      if (ids.length !== input.ids.length || ids.length === 0 || ids.length > most) return null;
      const byId = new Map(table.drawDeck.map((c) => [c.id, c]));
      const of = step.of;
      if (!ids.every((id) => byId.has(id) && downloadTakes(of, byId.get(id)!.card))) return null;
      const names = ids.map((id) => cardName(start, id));
      downloaded = ids.map((id) => byId.get(id)!);
      if (step.to.kind === 'hand' || step.to.kind === 'drawDeckTop') {
        table = ids.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'hand' }), table);
        // On top of the draw deck (#1811): after the shuffle of its stage.
        if (step.to.kind === 'drawDeckTop') toTop = ids[0];
        record = { step: 'download', cards: names, ...(step.to.kind === 'drawDeckTop' ? { placed: 'on top of the draw deck' } : {}), ...unshuffled };
        continue;
      }
      if (subject.kind !== 'play') return null;
      const ship = downloadPlaceShipsOf(table, subject.pending, step.to).find((sh) => sh.id === input.shipId);
      if (!ship) return null;
      const cost = downloadPlayCost(step.to, printedCost(byId.get(ids[0])!.card));
      const move: Extract<TableAction, { type: 'move' }> = {
        type: 'move',
        id: ids[0],
        to: { zone: 'crew', shipId: ship.id },
        ...(cost !== null && step.to.kind === 'playAboardThis'
          ? { cost, costSource: { title: subject.pending.model.title, reason: `played aboard this ship at cost −${step.to.discount}` } }
          : {}),
        ...(cost !== null && input.ruleWarnings?.length ? { ruleWarnings: input.ruleWarnings } : {}),
      };
      const boarded = tableReducer(table, move);
      if (boarded === table) return null;
      table = boarded;
      if (cost !== null) played = move;
      record = { step: 'download', cards: names, ...(cost === null ? { placed: `aboard ${cardName(start, ship.id)}` } : {}), ...unshuffled };
      continue;
    }
    if (step.kind === 'score') {
      const next = tableReducer(table, { type: 'adjustScore', delta: step.points });
      record = { step: 'score', points: next.score - table.score };
      table = next;
      continue;
    }
    if (step.kind === 'exchange') {
      // Vidiian Organ Bank (#1765): a personnel of the hand and one the player commands, unstopped, never the brig
      // (`exchangeCandidatesOf`). The table's goes to the hand (The Crossing's, #1826, to the discard pile), the
      // hand's to the end of the away team or crew the other left. No move is charged.
      const { hand, groups } = exchangeCandidatesOf(table, step.affiliation);
      const group = groups.find((g) => g.cards.some((c) => c.id === input.tableId));
      const fromHand = hand.find((c) => c.id === input.handId);
      const onTable = group?.cards.find((c) => c.id === input.tableId);
      if (!group || !fromHand || !onTable || !exchangeMatches(fromHand, onTable.card, step.affiliation)) return null;
      const replaced = step.replacedTo === 'discard';
      const to: MoveTarget = group.key.startsWith('crew-')
        ? { zone: 'crew', shipId: group.key.slice('crew-'.length) }
        : { zone: 'missionPile', missionIndex: Number(group.key.slice('awayTeam-'.length)), pile: 'awayTeam' };
      const left = tableReducer(table, { type: 'move', id: input.tableId!, to: replaced ? 'discard' : 'hand' });
      const joined = tableReducer(left, { type: 'move', id: input.handId!, to });
      if (left === table || joined === left) return null;
      table = joined;
      record = { step: 'exchange', fromHand: cardName(start, input.handId!), fromTable: cardName(start, input.tableId!), ...(replaced ? { replaced: true as const } : {}) };
      continue;
    }
  }
  if (toTop) table = tableReducer(table, { type: 'move', id: toTop, to: 'drawDeck', position: 'top' });
  if (!record) return null;
  const shuffledTail = record.step === 'download' ? {} : tail.shuffled ? { shuffled: true } : {};
  return { table, record: {
      ...record,
      ...(tail.drew !== undefined ? { drew: tail.drew } : {}),
      ...(tail.discardedTop !== undefined ? { discardedTop: tail.discardedTop } : {}),
      ...shuffledTail,
    }, ...(played ? { played } : {}) };
}

// The next stage of the effect being resolved (#1863). A resolving event's stage is one `effectStep` entry, and
// after its last stage the event goes to the discard pile (a recalled one, #1764, removed from the game). A
// "when you play" stage amends the play's entry (`withPlayEffectSteps`); a play aboard the played ship (#1811)
// adds its charged move to the play's entry, or after a correction of the charge is one move entry of its own
// whose `effectOf` holds the stage.
function effectStepState(state: GameState, input: EffectStepInput): GameState {
  const subject = effectSubjectOf(state);
  if (!subject) return state;
  const ran = runStage(state, subject, input);
  if (!ran) return state;
  if (subject.kind === 'resolving') {
    const recalled = subject.last && resolvingRecalled(state);
    const table = subject.last ? finishResolving(ran.table, subject.event.id, recalled) : ran.table;
    if (subject.last && table === ran.table) return state;
    const entry: LogEntry = {
      kind: 'effectStep',
      event: subject.name,
      step: ran.record,
      ...(subject.last ? { ended: true as const } : {}),
      ...(recalled ? { removed: true as const } : {}),
      turn: table.turn,
      segment: table.segment,
    };
    return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
  }
  if (subject.kind === 'order') return withOrderSteps(state, subject.pending, [ran.record], ran.table);
  if (subject.kind === 'trigger') return withTriggerSteps(state, subject.pending, [ran.record], ran.table);
  const { pending } = subject;
  if (!ran.played) return withPlayEffectSteps(state, pending, [ran.record], ran.table);
  const moves = moveEntry(state.table, [ran.played], false);
  const last = state.log[state.log.length - 1];
  // The play's own entry gains the move of the second play.
  if (pending.target.entry === state.log.length - 1 && last?.kind === 'move') {
    const amended = withPlayEffectSteps(state, pending, [ran.record], ran.table);
    const entry = amended.log[amended.log.length - 1];
    if (entry?.kind !== 'move') return state;
    return { ...amended, log: [...amended.log.slice(0, -1), { ...entry, moves: [...entry.moves, ...moves] }] };
  }
  // After a correction of the charge, one move entry of the second play holds the stage too.
  const condition = pending.steps.length === 0 && pending.condition ? { condition: pending.condition.status } : {};
  const entry: LogEntry = {
    kind: 'move',
    moves,
    effectOf: { target: { ...pending.target }, card: pending.name, effect: { ...condition, steps: [ran.record] } },
    turn: state.table.turn,
    segment: state.table.segment,
  };
  return { table: ran.table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// Whether an action carries a charge of the table (#1607), so the page shows its chip.
export function actionCharged(action: GameAction): boolean {
  if (action.type === 'missionSpend') return true;
  const actions = action.type === 'batch' ? action.actions : [action];
  return actions.some((a) => (a.type === 'move' || a.type === 'drawCard') && typeof a.cost === 'number');
}

// Whether an action carries a warning of the play rules (#1821), so the page shows its chip.
export function actionWarned(action: GameAction): boolean {
  if (action.type === 'effectStep') return !!action.ruleWarnings?.length;
  const actions = action.type === 'batch' ? action.actions : [action];
  return actions.some((a) => (a.type === 'move' || a.type === 'resolveDilemma' || a.type === 'drawCard') && !!a.ruleWarnings?.length);
}

// The warnings of the play rules an entry recorded (#1821), from its moves or its resolved dilemma's
// placement, malformed ones left out.
export function entryRuleWarnings(entry: LogEntry | undefined): RuleWarning[] {
  if (entry?.kind === 'move') return entry.moves.flatMap((m) => ruleWarningsIn(m.warnings));
  if (entry?.kind === 'dilemmaResolved') return ruleWarningsIn(entry.warnings);
  if (entry?.kind === 'draw') return ruleWarningsIn(entry.warnings);
  return [];
}

// The label of a mission's spend in the chip and the list (#1754), "Earth Lush and Beautiful Home: draw 2".
export const missionSpendLabel = (entry: Extract<LogEntry, { kind: 'missionSpend' }>): string =>
  entry.spend === 'earth' ? `${entry.mission}: draw ${entry.drew ?? 0}` : `${entry.mission}: ${entry.downloaded ?? 'download'}`;

// Earth's offer of a spend (#1754): its slot, and the entries of this turn's plays of a [TOS] card into
// its away team or onto its mission card, from the effective log, so a cancelled play offers nothing.
// Null outside play and draw, with no such play this turn, with an empty draw deck, or once the turn has
// spent at Earth as often as its `limit` allows (#1834). Earth's first slot counts.
export function earthSpendOf(state: { table: TableState; log: LogEntry[] }): { slot: number; entries: number[] } | null {
  const { table } = state;
  if (table.segment !== 'playAndDraw' || table.drawDeck.length === 0) return null;
  const slot = slotsTitled(table, EARTH_TITLE)[0];
  if (slot === undefined) return null;
  const name = missionName(table, slot);
  const log = effectiveLog(state.log);
  const turnEntries = log.flatMap((e, i) => (e.turn === table.turn && entrySegment(e) === 'playAndDraw' ? [{ e, i }] : []));
  if (!abilityUsable(log, table.turn, { kind: 'missionSpend', mission: name, spend: 'earth' }, EARTH_SPEND_LIMIT)) return null;
  const here = (to: LogPlace): boolean => (to.kind === 'awayTeam' && to.mission === name) || (to.kind === 'on' && to.card === name);
  const entries = turnEntries.flatMap(({ e, i }) =>
    e.kind === 'move' &&
    e.moves.some((m) => {
      const costs = moveCosts(m);
      return (
        here(m.to) &&
        !!costs &&
        costs.some((c, j) => typeof c === 'number' && playPasses(m.plays?.[j], EARTH_PLAY_TEST))
      );
    })
      ? [i]
      : []
  );
  return entries.length ? { slot, entries } : null;
}

// A mission's spend (#1754), checked again against the table and the log, so a stale dispatch changes
// nothing: Earth draws 2 (fewer from a short draw deck) for 1, Nimbus III moves a candidate from the draw
// deck into its away team and shuffles the draw deck in `order` for 3. One entry, the table before it its
// undo.
function missionSpendState(
  state: GameState,
  action: { spend: 'earth'; slot: number } | { spend: 'nimbus'; slot: number; id: string; order?: string[] }
): GameState {
  let table = state.table;
  let entry: LogEntry;
  if (action.spend === 'earth') {
    const offer = earthSpendOf(state);
    if (!offer || offer.slot !== action.slot) return state;
    let drew = 0;
    while (drew < EARTH_SPEND_DRAW) {
      const next = tableReducer(table, { type: 'drawCard', from: 'drawDeck', to: 'hand' });
      if (next === table) break;
      table = next;
      drew++;
    }
    entry = {
      kind: 'missionSpend',
      mission: missionName(state.table, action.slot),
      spend: 'earth',
      cost: EARTH_SPEND_COST,
      drew,
      turn: table.turn,
      segment: table.segment,
    };
  } else {
    const offer = nimbusSpendOf(table);
    const card = table.drawDeck.find((c) => c.id === action.id);
    if (!offer || offer.slot !== action.slot || !card || !isNimbusPersonnel(card)) return state;
    table = tableReducer(table, { type: 'move', id: card.id, to: { zone: 'missionPile', missionIndex: action.slot, pile: 'awayTeam' } });
    if (table === state.table) return state;
    table = tableReducer(table, { type: 'shuffle', location: 'drawDeck', ...(action.order ? { order: action.order } : {}) });
    entry = {
      kind: 'missionSpend',
      mission: missionName(state.table, action.slot),
      spend: 'nimbus',
      cost: NIMBUS_SPEND_COST,
      downloaded: cardDisplayName(card.card!),
      turn: table.turn,
      segment: table.segment,
    };
  }
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

const EFFECT_RECORD_STEP_NAMES: ReadonlySet<string> = new Set<EffectRecordStepName>(['draw', 'discard', 'bottom', 'examine', 'download', 'shuffle', 'score', 'exchange']);

const isNames = (value: unknown): value is string[] => Array.isArray(value) && value.every((c) => typeof c === 'string');

const isEffectStepRecord = (step: unknown): step is EffectStepRecord => {
  const s = step as Record<string, unknown> | null | undefined;
  if (!s || typeof s.step !== 'string' || !EFFECT_RECORD_STEP_NAMES.has(s.step)) return false;
  if (s.skipped === true) return true;
  if (s.drew !== undefined && !isIndex(s.drew)) return false;
  if (s.discardedTop !== undefined && !isIndex(s.discardedTop)) return false;
  if (s.step === 'draw' || s.step === 'bottom') return isIndex(s.count);
  if (s.step === 'score') return isIndex(s.points);
  if (s.step === 'shuffle') return true;
  if (s.step === 'examine') return isIndex(s.bottom) && isNames(s.taken);
  if (s.step === 'exchange') return typeof s.fromHand === 'string' && typeof s.fromTable === 'string';
  return isNames(s.cards);
};

// A record of a "when you play" effect (#1800) is read only when it is well formed: a malformed one of a saved
// log is dropped, and its move kept.
export const isPlayEffectRecord = (record: unknown): record is PlayEffectRecord => {
  const r = record as { condition?: unknown; steps?: unknown } | null | undefined;
  return (
    !!r &&
    Array.isArray(r.steps) &&
    r.steps.every(isEffectStepRecord) &&
    (r.condition === undefined || r.condition === 'met' || r.condition === 'notMet' || r.condition === 'unchecked')
  );
};

// The record of each card of a move (#1800), null for a card with none or a malformed one.
const moveEffects = (move: LogMove): (PlayEffectRecord | null)[] => {
  const effects = Array.isArray(move.effects) && move.effects.length === move.cards.length ? move.effects : [];
  return move.cards.map((_, i) => (isPlayEffectRecord(effects[i]) ? effects[i]! : null));
};

const cardsCountText = (n: number): string => `${n} ${n === 1 ? 'card' : 'cards'}`;

// The text of one stage of an effect (#1863), its clauses in order: the stage's own, then its tail. `event` names
// the resolving event whose stage it is, for the words of its entries, "Drew 4 cards (Miracle Working)".
function effectStageClauses(s: EffectStepRecord, event?: string): string[] {
  if ('skipped' in s) return [`skipped the ${s.step}`];
  const shuffled = s.step === 'download' ? s.shuffled !== false : s.shuffled === true;
  const own: string[] = (() => {
    switch (s.step) {
      case 'draw': {
        const personnel = typeof s.personnel === 'string' && s.personnel && isIndex(s.personnelCost) ? `${s.personnel} cost ${s.personnelCost}` : '';
        const why = event ? ` (${event}${personnel ? `, ${personnel}` : ''})` : personnel ? ` (${personnel})` : '';
        return [`drew ${cardsCountText(s.count)}${why}`];
      }
      case 'discard':
        return [`discarded ${s.cards.length ? cardsText(s.cards) : 'no card'}`];
      case 'bottom':
        return s.count > 0 ? [`put ${cardsCountText(s.count)} on the bottom of the draw deck`] : [];
      case 'examine':
        return [`took ${s.taken.length ? cardsText(s.taken) : 'no card'}, placed ${s.bottom} on the bottom`];
      case 'download': {
        const what = typeof s.copyOf === 'string' && s.copyOf ? s.copyOf : s.cards.length ? cardsText(s.cards) : 'no card';
        const placed = typeof s.placed === 'string' && s.placed ? `placed it ${s.placed}` : '';
        return [`downloaded ${what}${event ? ` (${event})` : ''}`, ...(shuffled ? ['shuffled the draw deck'] : []), ...(placed ? [placed] : [])];
      }
      case 'shuffle':
        return [];
      case 'score':
        return [`scored ${s.points} ${s.points === 1 ? 'point' : 'points'}`];
      case 'exchange':
        // The Crossing (#1826): "Replaced Archer with Reed, Archer went to the discard pile".
        return s.replaced === true
          ? [`replaced ${s.fromTable} with ${s.fromHand}`, `${s.fromTable} went to the discard pile`]
          : [`exchanged ${s.fromHand} for ${s.fromTable}`];
    }
  })();
  return [
    ...own,
    ...(isIndex(s.discardedTop) ? [`discarded ${cardsCountText(s.discardedTop)} from the top of the draw deck`] : []),
    ...(s.step !== 'download' && shuffled ? ['shuffled the draw deck'] : []),
    ...(isIndex(s.drew) ? [`drew ${cardsCountText(s.drew)}`] : []),
  ];
}

// "drew 7 cards, then discarded Tricorder and Phaser", "skipped its play text", "drew 3 cards, then skipped the
// discard", with " (condition not met)" when its condition did not hold (#1800).
export function playEffectText(record: PlayEffectRecord): string {
  const taken = record.steps.filter((s) => !('skipped' in s));
  const skipped = record.steps.filter((s) => 'skipped' in s);
  const parts = record.steps.map((s) => effectStageClauses(s).join(', '));
  const text = !taken.length && skipped.length ? 'skipped its play text' : parts.join(', then ');
  return `${text}${record.condition === 'notMet' ? ' (condition not met)' : record.condition === 'unchecked' ? ' (condition not checked)' : ''}`;
}

// The text of a stage of a resolving event (#1863), in the words of the entries before it: "Discarded Tricorder,
// drew 2 cards, and Days of Atonement went to the discard pile", "Drew 4 cards (These Are The Voyages, Data cost 4)".
function effectStepEntryText(entry: Extract<LogEntry, { kind: 'effectStep' }>): string {
  const event = typeof entry.event === 'string' && entry.event ? entry.event : 'the event';
  const clauses = isEffectStepRecord(entry.step) ? effectStageClauses(entry.step, event) : [];
  const text = entry.ended === true ? (clauses.length ? `${clauses.join(', ')}, and ${event} ${eventWent(entry)}` : `${event} ${eventWent(entry)}`) : clauses.join(', ');
  return capitalize(text);
}

// "; drew 7 cards, then discarded Tricorder and Phaser" after a play whose effect has a record (#1800), each
// card's own for a move of more than one card.
// ", naming Wavefront" after the placement of a card that named a card (#1789).
const movedNamedText = (move: LogMove): string => (typeof move.named === 'string' && move.named ? `, naming ${move.named}` : '');

const movedEffectsText = (move: LogMove): string =>
  moveEffects(move)
    .map((record, i) =>
      record && record.steps.length ? `; ${move.cards.length > 1 ? `${move.cards[i] ?? 'a card'}: ` : ''}${playEffectText(record)}` : ''
    )
    .join('');

// A "when you play" effect waiting for the player (#1800): the play at `target`, its card `id` where it stands
// on the table, its model, its condition, the steps the record holds and the step that comes next.
export interface PendingPlayEffect {
  target: ChargeTarget;
  id: string;
  instance: CardInstance;
  name: string;
  model: PlayModel;
  condition: PlayConditionState | null;
  steps: PlayEffectStepRecord[];
  /** The stage that comes next (#1863). */
  stage: EffectStage;
}

// The steps the log holds for the play at `target` (#1800): its move's record, then each `playEffect` entry
// that names it, in order; the condition of the first that has one.
function playEffectRecordOf(log: LogEntry[], target: ChargeTarget): PlayEffectRecord {
  const entry = log[target.entry];
  const move = entry?.kind === 'move' && isIndex(target.move) ? entry.moves[target.move] : undefined;
  const own = move && isIndex(target.card) ? moveEffects(move)[target.card] : null;
  const later = log
    .slice(target.entry + 1)
    .flatMap((e) =>
      e.kind === 'playEffect' && !!e.target && sameTarget(e.target, target) && isPlayEffectRecord(e.effect)
        ? [e.effect]
        : e.kind === 'move' && e.effectOf?.target && sameTarget(e.effectOf.target, target) && isPlayEffectRecord(e.effectOf.effect)
          ? [e.effectOf.effect]
          : []
    );
  const records = [...(own ? [own] : []), ...later];
  const condition = records.find((r) => r.condition !== undefined)?.condition;
  return { ...(condition ? { condition } : {}), steps: records.flatMap((r) => r.steps) };
}

// The played card on the table (#1800): in an away team, a crew or a ship row, by its name, the one at the
// place the play logged first.
function playedCardOnTable(table: TableState, name: string, to: LogPlace): CardInstance | null {
  const found: { instance: CardInstance; here: boolean }[] = [];
  table.missions.forEach((slot, i) => {
    const mission = missionName(table, i);
    const named = (c: CardInstance) => !!c.card && cardDisplayName(c.card) === name;
    slot.awayTeam.filter(named).forEach((instance) => found.push({ instance, here: to.kind === 'awayTeam' && to.mission === mission }));
    slot.ships.forEach((ship) => {
      if (named(ship)) found.push({ instance: ship, here: to.kind === 'shipRow' && to.mission === mission });
      const shipName = ship.card ? cardDisplayName(ship.card) : '';
      (ship.crew ?? []).filter(named).forEach((instance) => found.push({ instance, here: to.kind === 'crew' && to.ship === shipName }));
    });
  });
  return (found.find((f) => f.here) ?? found[0])?.instance ?? null;
}

// The pending "when you play" effect (#1800), derived from the effective log so an undo, a redo and a reload
// agree: the latest play of the current turn's play and draw, when its card has a model, its record does not
// hold every step yet, and the card still stands in an away team, a crew or a ship row. A later play, the end
// of the segment, the card leaving the table and a Cancel of the play (`effectiveLog`) end it. Null otherwise.
export function pendingPlayEffectOf(state: { table: TableState; log: LogEntry[] }): PendingPlayEffect | null {
  const { table } = state;
  if (table.segment !== 'playAndDraw') return null;
  const log = effectiveLog(state.log);
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.turn !== table.turn) return null;
    if (entrySegment(entry) !== 'playAndDraw') return null;
    if (entry.kind !== 'move') continue;
    for (let m = entry.moves.length - 1; m >= 0; m--) {
      const move = entry.moves[m];
      const costs = moveCosts(move);
      if (!costs) continue;
      for (let c = costs.length - 1; c >= 0; c--) {
        if (costs[c] === null) continue;
        const name = move.cards[c];
        const model = name ? playModelOf(name) : undefined;
        if (!name || !model) return null;
        const target = { entry: i, move: m, card: c };
        // The Enterprise's "play at cost -4 to ignore its next ability" (#1811): the choice taken ignores the effect.
        if (
          model.ignoredByCostChoice &&
          entryCharges(state.log, i).some((ch) => ch.target.move === m && ch.target.card === c && ch.choiceTaken)
        )
          return null;
        const record = playEffectRecordOf(log, target);
        const stage = playStagesOf(model)[record.steps.length];
        if (!stage) return null;
        const instance = playedCardOnTable(table, name, move.to);
        if (!instance) return null;
        const missionIndex = table.missions.findIndex(
          (slot) => slot.awayTeam.includes(instance) || slot.ships.some((ship) => ship === instance || (ship.crew ?? []).includes(instance))
        );
        const live = playConditionOf(model, costFactsOf(table, []), { id: instance.id, ...(missionIndex >= 0 ? { missionIndex } : {}) });
        const condition = live && record.condition ? { ...live, status: record.condition } : live;
        return { target, id: instance.id, instance, name, model, condition, steps: record.steps, stage };
      }
    }
  }
  return null;
}

// Adds `steps` to the record of the pending effect (#1800), with the table they left. While the play's entry is
// the last of the log, the steps amend its move and the undo snapshot stays the table from before the play, so
// one undo takes back the play and every step. After a correction of a charge the steps go into one
// `playEffect` entry of their own, which later steps amend, and whose undo takes back the effect only.
function withPlayEffectSteps(state: GameState, pending: PendingPlayEffect, steps: PlayEffectStepRecord[], table: TableState): GameState {
  const last = state.log.length - 1;
  const condition = pending.steps.length === 0 && pending.condition ? { condition: pending.condition.status } : {};
  const entry = state.log[last];
  const { target } = pending;
  if (target.entry === last && entry?.kind === 'move' && isIndex(target.move) && isIndex(target.card)) {
    const moves = entry.moves.map((move, m) => {
      if (m !== target.move) return move;
      const effects = moveEffects(move);
      const own = effects[target.card!];
      effects[target.card!] = { ...(own?.condition ? { condition: own.condition } : condition), steps: [...(own?.steps ?? []), ...steps] };
      return { ...move, effects };
    });
    return { table, log: [...state.log.slice(0, -1), { ...entry, moves }], undo: state.undo, redo: [] };
  }
  if (entry?.kind === 'playEffect' && entry.target && sameTarget(entry.target, target) && isPlayEffectRecord(entry.effect)) {
    const amended: LogEntry = { ...entry, effect: { ...entry.effect, steps: [...entry.effect.steps, ...steps] } };
    return { table, log: [...state.log.slice(0, -1), amended], undo: state.undo, redo: [] };
  }
  const added: LogEntry = {
    kind: 'playEffect',
    target: { ...target },
    card: pending.name,
    effect: { ...condition, steps },
    turn: state.table.turn,
    segment: state.table.segment,
  };
  return { table, log: [...state.log, added], undo: [...state.undo, state.table], redo: [] };
}

// The ships of the player as destinations of a download to a place (#1811), in slot order.
const downloadShipsOf = (table: TableState) =>
  table.missions.flatMap((slot, missionIndex) =>
    slot.ships.map((ship) => ({ id: ship.id, affiliation: String(ship.card?.affiliation ?? ''), missionIndex, instance: ship }))
  );

/** The ships a pending download to a place `to` may put its card aboard (#1811), the played card's mission first. */
export function downloadPlaceShipsOf(table: TableState, pending: PendingPlayEffect, to: DownloadTo): CardInstance[] {
  const missionIndex = table.missions.findIndex(
    (slot) => slot.awayTeam.includes(pending.instance) || slot.ships.some((ship) => ship === pending.instance || (ship.crew ?? []).includes(pending.instance))
  );
  return downloadPlaceShips(to, downloadShipsOf(table), { id: pending.id, ...(missionIndex >= 0 ? { missionIndex } : {}) }).map((s) => s.instance);
}

// Skip and Done of the pending effect (#1800): every stage left is recorded as skipped, so the panel does not
// open again on a reload. The table does not change. A first stage that is no "may" (#1808, a discard from hand)
// is not skipped while the hand holds a card; with an empty hand, Done records that it discarded no card.
function effectSkipState(state: GameState): GameState {
  if (state.table.resolving) return state;
  // An order (#1866): every stage left is recorded as skipped. The player chose to use it, so no stage holds it.
  const order = pendingOrderOf(state);
  if (order) {
    const left = orderStagesOf(order.model).slice(order.steps.length);
    return withOrderSteps(state, order, left.map((s): EffectStepRecord => ({ step: recordStepName(s.lead), skipped: true })), state.table);
  }
  // A taken trigger (#1904): as a "when you play" effect, a first stage that is no "may" (Li Nalas's discard) is not
  // skipped while the hand holds a card; with an empty hand Done records that it discarded no card.
  const trigger = pendingTriggerOf(state);
  if (trigger) {
    const handEmpty = state.table.hand.length === 0;
    if (trigger.steps.length === 0 && !trigger.stage.may && !handEmpty) return state;
    const left = stagesOf(triggerPlayerSteps(trigger.row)).slice(trigger.steps.length);
    const steps = left.map((s, i): EffectStepRecord =>
      i === 0 && !s.may && s.lead.kind === 'discardFromHand' && handEmpty && trigger.steps.length === 0
        ? { step: 'discard', cards: [] }
        : { step: recordStepName(s.lead), skipped: true }
    );
    return withTriggerSteps(state, trigger, steps, state.table);
  }
  const pending = pendingPlayEffectOf(state);
  if (!pending) return state;
  const handEmpty = state.table.hand.length === 0;
  if (pending.steps.length === 0 && !pending.stage.may && !handEmpty) return state;
  const left = playStagesOf(pending.model).slice(pending.steps.length);
  const steps = left.map((s, i): EffectStepRecord =>
    i === 0 && !s.may && s.lead.kind === 'discardFromHand' && handEmpty && pending.steps.length === 0
      ? { step: 'discard', cards: [] }
      : { step: recordStepName(s.lead), skipped: true }
  );
  return withPlayEffectSteps(state, pending, steps, state.table);
}

// A card names a card (#1789). When the last entry is the move that placed the card on a card and named
// nothing yet, the name amends that move, and the undo snapshot stays the table from before the move, so
// one undo takes back the placement and the name. Otherwise it is a `cardNamed` entry of its own.
function setNamedState(state: GameState, action: { id: string; named?: string }): GameState {
  const table = tableReducer(state.table, { type: 'setNamed', id: action.id, ...(action.named ? { named: action.named } : {}) });
  if (table === state.table || !action.named) return table === state.table ? state : { ...state, table, redo: [] };
  const found = findInstanceAnywhere(table, action.id);
  if (!found) return state;
  const name = cardName(table, action.id);
  const on = typeof found.zone === 'object' && found.zone.zone === 'on' ? cardName(table, found.zone.targetId) : undefined;
  const last = state.log[state.log.length - 1];
  const move = last?.kind === 'move' ? last.moves[last.moves.length - 1] : undefined;
  if (
    last?.kind === 'move' &&
    move &&
    move.named === undefined &&
    move.cards.length === 1 &&
    move.cards[0] === name &&
    move.to.kind === 'on' &&
    move.to.card === on &&
    !findInstanceAnywhere(state.table, action.id)?.instance.named
  ) {
    const amended: LogEntry = { ...last, moves: [...last.moves.slice(0, -1), { ...move, named: action.named }] };
    return { table, log: [...state.log.slice(0, -1), amended], undo: state.undo, redo: [] };
  }
  const entry: LogEntry = {
    kind: 'cardNamed',
    card: name,
    named: action.named,
    ...(on ? { on } : {}),
    turn: state.table.turn,
    segment: state.table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// An order in progress (#1866): the `orderUsed` entry at `entry`, its card where it is now (on the table, or
// wherever its cost sent it), the order, its condition, the stages the record holds and the stage that comes next.
export interface PendingOrder {
  entry: number;
  id: string;
  instance: CardInstance;
  name: string;
  model: OrderModel;
  condition: PlayConditionState | null;
  steps: EffectStepRecord[];
  stage: EffectStage;
}

const isOrderUsed = (entry: LogEntry): entry is Extract<LogEntry, { kind: 'orderUsed' }> =>
  entry.kind === 'orderUsed' && typeof entry.id === 'string' && typeof entry.card === 'string' && isIndex(entry.order) && isPlayEffectRecord(entry.effect);

// The stages the log holds for the order at `entry`: its own record, then each `orderEffect` entry that names it.
function orderRecordOf(log: LogEntry[], entry: number): EffectStepRecord[] {
  const own = log[entry];
  if (!own || !isOrderUsed(own)) return [];
  const later = log
    .slice(entry + 1)
    .flatMap((e) => (e.kind === 'orderEffect' && e.target === entry && isPlayEffectRecord(e.effect) ? e.effect.steps : []));
  return [...own.effect.steps, ...later];
}

// The order in progress (#1866), derived from the log so an undo, a redo and a reload agree: the latest
// `orderUsed` of the current turn's orders segment, while its record lacks a stage. Its card need not be on the
// table: a cost may have sent it to the bottom of the draw deck (Four of Nine). The end of the segment ends it, and
// an unknown or malformed entry is no order. Null otherwise.
export function pendingOrderOf(state: { table: TableState; log: LogEntry[] }): PendingOrder | null {
  const { table, log } = state;
  if (table.segment !== 'orders') return null;
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.turn !== table.turn || entrySegment(entry) !== 'orders') return null;
    if (entry.kind !== 'orderUsed') continue;
    if (!isOrderUsed(entry)) return null;
    const model = orderModelOf(entry.card, entry.order);
    if (!model) return null;
    const steps = orderRecordOf(log, i);
    const stage = orderStagesOf(model)[steps.length];
    const instance = stage ? findInstanceAnywhere(table, entry.id)?.instance : undefined;
    if (!stage || !instance) return null;
    const live = playConditionOf(model, costFactsOf(table, []), { id: instance.id });
    const condition = live && entry.effect.condition ? { ...live, status: entry.effect.condition } : live;
    return { entry: i, id: entry.id, instance, name: entry.card, model, condition, steps, stage };
  }
  return null;
}

/**
 * An ability whose uses `abilityUsesThisTurn` counts (#1834): by card instance and ability index for an order
 * (`orderUsed`), a trigger row (`triggerUsed`) and a table use of a play cost (a `chargeCorrected` with `used`, by
 * the use's model `title`); by mission name and kind for a mission spend (`missionSpend`) and by mission name and
 * preventing card for a reveal's prevention (`dilemmaResolved` with `prevented`), since those entries name no instance.
 */
export type AbilityKey =
  | { kind: 'order'; id: string; index: number }
  | { kind: 'trigger'; id: string; index: number }
  | { kind: 'tableUse'; id: string; title: string }
  | { kind: 'missionSpend'; mission: string; spend: MissionSpendKind }
  | { kind: 'prevent'; mission: string; prevented: string }
  | { kind: 'attemptAbility'; id: string; index: number };

// Whether `entry` is one use of the ability `key`.
function isUseOf(entry: LogEntry, key: AbilityKey): boolean {
  switch (key.kind) {
    case 'order':
      return entry.kind === 'orderUsed' && entry.id === key.id && entry.order === key.index;
    case 'trigger':
      return entry.kind === 'triggerUsed' && !!entry.target && entry.target.source === key.id && entry.target.row === key.index;
    case 'tableUse':
      return entry.kind === 'chargeCorrected' && isUsedCard(entry.used) && entry.used.id === key.id && entry.source === key.title;
    case 'missionSpend':
      return entry.kind === 'missionSpend' && entry.spend === key.spend && entry.mission === key.mission;
    case 'attemptAbility':
      return entry.kind === 'attemptAbilityUsed' && entry.id === key.id && entry.ability === key.index;
    case 'prevent':
      return entry.kind === 'dilemmaResolved' && entry.prevented === key.prevented && typeof entry.went === 'string' && entry.went.includes(key.mission);
  }
}

/**
 * The uses of the ability `key` in the turn `turn` (#1834), from the effective log: an undo, which takes the entry
 * out, gives the use back, a cancelled play's corrections no longer count, and the next turn starts at 0.
 */
export function abilityUsesThisTurn(log: LogEntry[], turn: number, key: AbilityKey): number {
  return effectiveLog(log).filter((e) => e.turn === turn && isUseOf(e, key)).length;
}

/** Whether the ability `key`, with `limit`, may be used again this turn (#1834): always with no limit. */
export const abilityUsable = (log: LogEntry[], turn: number, key: AbilityKey, limit: UseLimit | undefined): boolean =>
  !limit || withinUseLimit(limit, abilityUsesThisTurn(log, turn, key));

/**
 * The orders the table offers (#1866): in the orders segment, with no attempt in progress, nothing resolving and
 * no effect or order pending, each order of a card in its own place, less an order used this turn as often as its
 * `limit` allows (#1834).
 */
export function availableOrdersOf(state: { table: TableState; log: LogEntry[] }): OrderCard[] {
  const { table, log } = state;
  if (table.segment !== 'orders' || table.attempt || table.resolving || pendingOrderOf(state) || pendingPlayEffectOf(state)) return [];
  return orderCardsOf(table).filter((o) => abilityUsable(log, table.turn, { kind: 'order', id: o.instance.id, index: o.model.index }, o.model.limit));
}

// The use of an order (#1866): the order must be one the table offers, and the pick must fit its cost, or nothing
// changes. The cost is paid at once, and the order's one `orderUsed` entry is written, with no step yet. It is no
// charge: it spends no counter.
function orderUseState(state: GameState, action: { id: string; order: number; ids?: string[] }): GameState {
  const order = availableOrdersOf(state).find((o) => o.instance.id === action.id && o.model.index === action.order);
  if (!order || orderCardOf(state.table, action.id, action.order) === null) return state;
  const { cost } = order.model;
  const start = state.table;
  let table = start;
  let record: OrderCostRecord | undefined;
  if (costNeedsPick(cost)) {
    const ids = Array.isArray(action.ids) ? [...new Set(action.ids)] : [];
    const allowed = new Set(orderCostCandidates(start, order).map((c) => c.id));
    if (ids.length !== costPickCount(cost) || ids.length !== (action.ids?.length ?? 0) || !ids.every((id) => allowed.has(id))) return state;
    const names = ids.map((id) => cardName(start, id));
    if (cost.kind === 'discardFromHand') {
      table = ids.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'discard' }), table);
      record = { discarded: names };
    } else if (cost.kind === 'stopPersonnel') {
      table = tableReducer(table, { type: 'setStopped', ids, stopped: true });
      record = { stopped: names };
    } else {
      table = ids.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'drawDeck', position: 'bottom' }), table);
      record = { placed: names };
    }
    if (table === start) return state;
  } else if (cost.kind === 'placeThisOnBottom') {
    table = tableReducer(table, { type: 'move', id: action.id, to: 'drawDeck', position: 'bottom' });
    if (table === start) return state;
    record = { placed: [order.name] };
  }
  const condition = playConditionOf(order.model, costFactsOf(start, []), { id: action.id });
  const entry: LogEntry = {
    kind: 'orderUsed',
    id: action.id,
    card: order.name,
    order: action.order,
    ...(record ? { cost: record } : {}),
    effect: { ...(condition ? { condition: condition.status } : {}), steps: [] },
    turn: table.turn,
    segment: table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// Adds `steps` to the record of the order in progress (#1866), with the table they left. While its entry is the
// last of the log, the steps amend it and the undo snapshot stays the table from before the use, so one undo takes
// back the cost and every step. Otherwise they go into one `orderEffect` entry, which later steps amend.
function withOrderSteps(state: GameState, pending: PendingOrder, steps: EffectStepRecord[], table: TableState): GameState {
  const last = state.log.length - 1;
  const entry = state.log[last];
  if (pending.entry === last && entry && isOrderUsed(entry)) {
    const amended: LogEntry = { ...entry, effect: { ...entry.effect, steps: [...entry.effect.steps, ...steps] } };
    return { table, log: [...state.log.slice(0, -1), amended], undo: state.undo, redo: [] };
  }
  if (entry?.kind === 'orderEffect' && entry.target === pending.entry && isPlayEffectRecord(entry.effect)) {
    const amended: LogEntry = { ...entry, effect: { ...entry.effect, steps: [...entry.effect.steps, ...steps] } };
    return { table, log: [...state.log.slice(0, -1), amended], undo: state.undo, redo: [] };
  }
  const added: LogEntry = {
    kind: 'orderEffect',
    target: pending.entry,
    card: pending.name,
    effect: { steps },
    turn: state.table.turn,
    segment: state.table.segment,
  };
  return { table, log: [...state.log, added], undo: [...state.undo, state.table], redo: [] };
}

// "drew 3 cards", "drew 1 card, then discarded Tricorder", "skipped the draw".
function orderStepsText(record: PlayEffectRecord): string {
  return record.steps.map((s) => effectStageClauses(s).join(', ')).join(', then ');
}

// "Used Damar Ambitious Glinn's order: discarded Hideki Class, drew 3 cards" (#1866).
function orderUsedText(entry: Extract<LogEntry, { kind: 'orderUsed' }>): string {
  const card = typeof entry.card === 'string' && entry.card ? entry.card : 'a card';
  const cost = entry.cost ?? {};
  const costParts = [
    ...(isNames(cost.discarded) && cost.discarded.length ? [`discarded ${cardsText(cost.discarded)}`] : []),
    ...(isNames(cost.stopped) && cost.stopped.length ? [`stopped ${cardsText(cost.stopped)}`] : []),
    ...(isNames(cost.placed) && cost.placed.length ? [`placed ${cardsText(cost.placed)} on the bottom of the draw deck`] : []),
  ];
  const steps = isPlayEffectRecord(entry.effect) ? orderStepsText(entry.effect) : '';
  const parts = [...costParts, ...(steps ? [steps] : [])];
  const condition = isPlayEffectRecord(entry.effect)
    ? entry.effect.condition === 'notMet'
      ? ' (condition not met)'
      : entry.effect.condition === 'unchecked'
        ? ' (condition not checked)'
        : ''
    : '';
  return `Used ${card}'s order${parts.length ? `: ${parts.join(', ')}` : ''}${condition}`;
}

// A trigger taken (#1904): the `triggerUsed` entry at `entry`, its offer's address, its row, its card's name and
// instance (null for the bot's deck, or a card no longer anywhere), the stages the log holds and the stage that
// comes next.
export interface PendingTrigger {
  entry: number;
  target: TriggerTarget;
  row: TriggerRow;
  name: string;
  instance: CardInstance | null;
  steps: EffectStepRecord[];
  stage: EffectStage;
}

const isTriggerTarget = (t: unknown): t is TriggerTarget => {
  const x = t as Partial<TriggerTarget> | null | undefined;
  return !!x && isIndex(x.entry) && typeof x.source === 'string' && isIndex(x.row) && isIndex(x.event);
};

const isTriggerUsed = (entry: LogEntry): entry is Extract<LogEntry, { kind: 'triggerUsed' }> =>
  entry.kind === 'triggerUsed' && isTriggerTarget(entry.target) && typeof entry.card === 'string' && isPlayEffectRecord(entry.effect);

// The stages the log holds for the trigger taken at `entry`: its own record, then each `triggerEffect` entry that names
// its offer.
function triggerRecordOf(log: LogEntry[], entry: number): EffectStepRecord[] {
  const own = log[entry];
  if (!own || !isTriggerUsed(own)) return [];
  const later = log
    .slice(entry + 1)
    .flatMap((e) => (e.kind === 'triggerEffect' && isTriggerTarget(e.target) && sameTriggerTarget(e.target, own.target) && isPlayEffectRecord(e.effect) ? e.effect.steps : []));
  return [...own.effect.steps, ...later];
}

/** The steps of a trigger row the player runs: a `botDeck` row's bot-only step (#1906) is never one. */
const triggerPlayerSteps = (row: TriggerRow): EffectStep[] =>
  row.steps.filter((s): s is EffectStep => s.kind !== 'botRedrawDilemmas' && s.kind !== 'selectAgain' && s.kind !== 'replacePick');

/**
 * The trigger in progress (#1904), derived from the log so an undo, a redo and a reload agree: the latest
 * `triggerUsed` of the current turn while its record lacks a stage of its row. Its card need not be on the table: a
 * use cost may have destroyed it, and "this personnel is killed" left it in the discard pile. Null otherwise.
 */
export function pendingTriggerOf(state: { table: TableState; log: LogEntry[] }): PendingTrigger | null {
  const { table, log } = state;
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.turn !== table.turn) return null;
    if (entry.kind !== 'triggerUsed') continue;
    if (!isTriggerUsed(entry)) return null;
    const row = triggerRowsOf(entry.card)[entry.target.row];
    if (!row) return null;
    const steps = triggerRecordOf(log, i);
    const stage = stagesOf(triggerPlayerSteps(row))[steps.length];
    if (!stage) return null;
    const instance = entry.target.source === 'botDeck' ? null : (findInstanceAnywhere(table, entry.target.source)?.instance ?? null);
    return { entry: i, target: entry.target, row, name: entry.card, instance, steps, stage };
  }
  return null;
}

// Whether a stage runs with no input of the player (#1904): a score, or a fixed draw. A take runs these at once.
const stageNeedsNoInput = (stage: EffectStage): boolean =>
  stage.lead.kind === 'score' || (stage.lead.kind === 'draw' && stage.lead.count.kind === 'fixed');

// The take of a trigger offer (#1904): the offer must be one the table lists, and the pick must fit its use cost, or
// nothing changes. The cost is paid, the `triggerUsed` entry is written, and each stage that needs no input runs at
// once into that entry, so one undo takes back the cost and those stages.
function triggerUseState(state: GameState, action: { target: TriggerTarget; ids?: string[] }): GameState {
  const offer = pendingTriggersOf(state).find((o) => sameTriggerTarget(o.target, action.target));
  if (!offer) return state;
  const start = state.table;
  let table = start;
  let cost: TriggerCostRecord | undefined;
  const useCost = offer.row.useCost;
  if (useCost) {
    const source = offer.source;
    if (useCost.kind === 'discardFromHand') {
      const ids = Array.isArray(action.ids) ? [...new Set(action.ids)] : [];
      if (ids.length !== useCost.count || ids.length !== (action.ids?.length ?? 0) || !ids.every((id) => start.hand.some((c) => c.id === id))) return state;
      table = ids.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'discard' }), table);
      cost = { discarded: ids.map((id) => cardName(start, id)) };
    } else {
      if (!source) return state;
      table =
        useCost.kind === 'stopSelf'
          ? tableReducer(table, { type: 'setStopped', ids: [source.id], stopped: true })
          : tableReducer(table, { type: 'move', id: source.id, to: 'discard' });
      cost = useCost.kind === 'stopSelf' ? { stopped: true } : useCost.kind === 'killSelf' ? { killed: true } : { destroyed: true };
    }
    if (table === start) return state;
  }
  const entry: Extract<LogEntry, { kind: 'triggerUsed' }> = {
    kind: 'triggerUsed',
    target: { ...action.target },
    card: offer.name,
    ...(cost ? { cost } : {}),
    effect: { steps: [] },
    turn: table.turn,
    segment: table.segment,
  };
  let next: GameState = { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
  // The stages that need no input, in order, each amending the entry.
  for (;;) {
    const pending = pendingTriggerOf(next);
    if (!pending || pending.entry !== next.log.length - 1 || !stageNeedsNoInput(pending.stage)) break;
    const ran = runStage(next, { kind: 'trigger', pending, stage: pending.stage }, {});
    if (!ran) break;
    next = withTriggerSteps(next, pending, [ran.record], ran.table);
  }
  return next;
}

// The skip of a trigger offer (#1904): one `triggerSkipped` entry, which changes no card.
function triggerSkipState(state: GameState, action: { target: TriggerTarget }): GameState {
  const offer = pendingTriggersOf(state).find((o) => sameTriggerTarget(o.target, action.target));
  if (!offer) return state;
  const entry: LogEntry = { kind: 'triggerSkipped', target: { ...action.target }, card: offer.name, turn: state.table.turn, segment: state.table.segment };
  return { table: state.table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The use of an attempt ability (#1835): its change goes on `Attempt.timed`, for the rest of the attempt, in one
// `attemptAbilityUsed` entry, which one undo takes back. Refused unless the table offers it.
function attemptAbilityUseState(state: GameState, action: { id: string; index: number }): GameState {
  const offer = attemptAbilitiesOf(state).find((o) => o.id === action.id && o.ability.index === action.index);
  const attempt = state.table.attempt;
  if (!offer || !attempt) return state;
  const changes = modifyStepOf(offer.ability)?.changes ?? {};
  const timed = Object.keys(changes).length
    ? [...(attempt.timed ?? []), { title: offer.ability.title, sourceId: offer.id, targetId: offer.targetId, changes: { ...changes } }]
    : attempt.timed;
  const table: TableState = { ...state.table, attempt: { ...attempt, ...(timed ? { timed } : {}) } };
  const entry: LogEntry = {
    kind: 'attemptAbilityUsed',
    id: offer.id,
    card: offer.name,
    ability: offer.ability.index,
    target: offer.targetName,
    changes: { ...changes },
    ...(killsAtEndOfTurn(offer.ability) ? { killAtEndOfTurn: true as const } : {}),
    turn: table.turn,
    segment: table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// "Storil Courageous Captain: made U.S.S. Saratoga Weapons +5 until the end of this mission attempt; it is killed at
// the end of this turn" (#1835).
function attemptAbilityUsedText(entry: Extract<LogEntry, { kind: 'attemptAbilityUsed' }>): string {
  const card = typeof entry.card === 'string' && entry.card ? entry.card : 'a card';
  const target = typeof entry.target === 'string' && entry.target ? entry.target : 'a card';
  const changes = entry.changes && typeof entry.changes === 'object' ? changesText(entry.changes) : '';
  const made = changes ? `made ${target === card ? 'itself' : target} ${changes} until the end of this mission attempt` : 'used';
  return `${card}: ${made}${entry.killAtEndOfTurn === true ? '; it is killed at the end of this turn' : ''}`;
}

// Adds `steps` to the record of the trigger in progress (#1904), with the table they left. While its entry is the last
// of the log, the steps amend it and the undo snapshot stays the table from before the take, so one undo takes back
// the cost and every step. Otherwise they go into one `triggerEffect` entry, which later steps amend.
function withTriggerSteps(state: GameState, pending: PendingTrigger, steps: EffectStepRecord[], table: TableState): GameState {
  const last = state.log.length - 1;
  const entry = state.log[last];
  if (pending.entry === last && entry && isTriggerUsed(entry)) {
    const amended: LogEntry = { ...entry, effect: { ...entry.effect, steps: [...entry.effect.steps, ...steps] } };
    return { table, log: [...state.log.slice(0, -1), amended], undo: state.undo, redo: [] };
  }
  if (entry?.kind === 'triggerEffect' && isTriggerTarget(entry.target) && sameTriggerTarget(entry.target, pending.target) && isPlayEffectRecord(entry.effect)) {
    const amended: LogEntry = { ...entry, effect: { ...entry.effect, steps: [...entry.effect.steps, ...steps] } };
    return { table, log: [...state.log.slice(0, -1), amended], undo: state.undo, redo: [] };
  }
  const added: LogEntry = {
    kind: 'triggerEffect',
    target: { ...pending.target },
    card: pending.name,
    effect: { steps },
    turn: state.table.turn,
    segment: state.table.segment,
  };
  return { table, log: [...state.log, added], undo: [...state.undo, state.table], redo: [] };
}

// "Distant Exploration: scored 5 points", "Hurried Departure: destroyed it, then scored 10 points" (#1904).
function triggerUsedText(entry: Extract<LogEntry, { kind: 'triggerUsed' }>): string {
  const card = typeof entry.card === 'string' && entry.card ? entry.card : 'a card';
  const cost = entry.cost ?? {};
  const costParts = [
    ...(cost.destroyed === true ? ['destroyed it'] : []),
    ...(cost.killed === true ? ['killed it'] : []),
    ...(cost.stopped === true ? ['stopped it'] : []),
    ...(isNames(cost.discarded) && cost.discarded.length ? [`discarded ${cardsText(cost.discarded)}`] : []),
  ];
  const steps = isPlayEffectRecord(entry.effect) && entry.effect.steps.length ? playEffectText(entry.effect) : '';
  const parts = [...costParts, ...(steps ? [steps] : [])];
  return `${card}: ${parts.length ? parts.join(', then ') : 'used'}`;
}

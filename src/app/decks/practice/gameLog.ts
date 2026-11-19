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
import { revealPicksOf } from './attempt';
import { CostDestination, CostPlace, costPlayOf, drawCharge, moveCharge, printedCost } from '../../../lib/playCost';
import { discardDrawCount, resolveModelOf } from '../../../lib/resolveModels';
import { choiceDiscardTop, isCostUse, isCountedChoice, isDownloadChoice, isPersonnelChoice } from '../../../lib/costModels/model';
import { cardHasIcon, chosenPersonnel, downloadCopyOf, exchangeCandidatesOf, personnelCandidateGroups, personnelChoiceDelta } from './personnelChoice';
import type { CostSource, CostTurnPlay, CostUse, CostUseEffect, LimitCap, LimitGrant, PendingDiscount, TurnLimitChoice } from '../../../lib/costModels/model';
import { cappedLimit, firstTurnGrantsOf, limitCapsOf, limitGrantsOf, pendingDiscountOf, turnChoicesOf } from '../../../lib/costModels/registry';
import { costFactsOf, slotQuadrantOf, turnPlayOf } from './costFacts';
import {
  EARTH_SPEND_COST,
  EARTH_SPEND_DRAW,
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
}

// What the effect of a completion did (#1757).
export interface CompletionLog {
  moves?: LogMove[];
  shuffled?: LogPlace;
  flipped?: true;
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
  | { kind: 'draw'; from: 'drawDeck' | 'dilemmaPile'; to: 'hand' | 'dilemmaHand'; shuffled?: true; cost?: number }
  // One player action, so one entry, even when its cards went to more than one place (a group
  // dropped on a mission sends a ship to the ship row and a personnel to the away team). A
  // download shuffles the pile after its moves, and `shuffled` names it.
  | { kind: 'move'; moves: LogMove[]; shuffled?: LogPlace }
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
  | {
      kind: 'dilemmaResolved';
      dilemma: string;
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
  | { kind: 'resolveExchanged'; event: string; fromHand: string; fromTable: string; removed?: true }
  // A spend of counters a mission's text allows (#1754): Earth's "spend a counter to draw two cards",
  // `drew` cards drawn, or Nimbus III's "spend three counters to download …", `downloaded` the card that
  // went into its away team. `cost` is the charge, which the chip and the list correct as any other.
  | { kind: 'missionSpend'; mission: string; spend: MissionSpendKind; cost: number; drew?: number; downloaded?: string }
);

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
  // The steps of the resolving event's resolve model (#1739), each one entry that one undo takes back:
  // the free draw, by the printed cost of the personnel `personnelId` or by the model's fixed number, and
  // then the hand cards `ids` to the bottom of the draw deck, in that order, and the event to the discard pile.
  | { type: 'resolveDraw'; personnelId?: string }
  | { type: 'resolveBottom'; ids: string[] }
  // The one step of a "discard a card from hand to draw" event (#1745): the hand card `id` is discarded, the
  // model's cards are drawn free, and the event goes to the discard pile, in one entry.
  | { type: 'resolveDiscardDraw'; id: string }
  // The one step of Second Edition (#1746): a copy of the personnel `personnelId` from the draw deck to the
  // hand, the shuffle of the draw deck in `order`, which `withShuffleOrders` chooses, the draw, and the event
  // to the discard pile, in one entry.
  | { type: 'resolveDownload'; personnelId: string; order?: string[] }
  | { type: 'resolveExchange'; handId: string; tableId: string }
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
const attemptStartFields = (before: TableState, after: TableState): { draw?: number; spend?: number; drewCards?: number } => {
  const drewCards = after.hand.length - before.hand.length;
  return {
    ...(after.attempt ? { draw: after.attempt.draw, spend: after.attempt.spend } : {}),
    ...(drewCards > 0 ? { drewCards } : {}),
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
}): string => {
  const n = drawSpend(entry.personnel, entry.subtract);
  const draw = typeof entry.draw === 'number' ? entry.draw : n;
  const spend = typeof entry.spend === 'number' ? entry.spend : n;
  const notes = [
    ...(Array.isArray(entry.changes) ? entry.changes : []),
    ...(typeof entry.drewCards === 'number' && entry.drewCards > 0
      ? [`drew ${entry.drewCards} ${entry.drewCards === 1 ? 'card' : 'cards'}`]
      : []),
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
      };
    case 'move': {
      const moves = moveEntry(before, [action], false);
      return moves.length ? { kind: 'move', moves } : null;
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
      return { kind: 'missionCompleted', mission: missionName(before, action.missionIndex), completed: action.completed };
    }
    case 'startAttempt':
      if (after === before) return null;
      return {
        kind: 'attemptStarted',
        mission: missionName(before, action.missionIndex),
        ...(action.shipId ? { ship: cardName(before, action.shipId) } : {}),
        personnel: action.personnel,
        subtract: action.subtract,
        ...attemptStartFields(before, after),
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
        ...attemptStartFields(before, after),
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
  const effect: CompletionLog = {
    ...(logMoves.length ? { moves: logMoves } : {}),
    ...(shuffled ? { shuffled } : {}),
    ...(flipped ? { flipped: true as const } : {}),
  };
  return Object.keys(effect).length ? { ...plain, effect } : plain;
}

// The entry one player action makes, or null when it changed nothing the log records. `after` is
// the table once every action of the batch applied. The entry belongs to the turn after the
// action, so the entry of `nextTurn` heads the group of the new turn.
export function logEntryFor(
  before: TableState,
  action: Exclude<GameAction, { type: 'undo' } | { type: 'redo' } | { type: 'correctCharge' } | { type: 'adjustCounterLimit' } | { type: 'dismissDiscount' } | { type: 'choosePersonnel' } | { type: 'downloadForCharge' } | { type: 'useCard' } | { type: 'discardForCharge' } | { type: 'cancelResolving' } | { type: 'resolveDraw' } | { type: 'resolveBottom' } | { type: 'resolveDiscardDraw' } | { type: 'resolveDownload' } | { type: 'resolveExchange' } | { type: 'missionSpend' }>,
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
  if (action.type === 'resolveDraw') return resolveDrawState(state, action);
  if (action.type === 'resolveBottom') return resolveBottomState(state, action);
  if (action.type === 'resolveDiscardDraw') return resolveDiscardDrawState(state, action);
  if (action.type === 'resolveDownload') return resolveDownloadState(state, action);
  if (action.type === 'resolveExchange') return resolveExchangeState(state, action);
  if (action.type === 'missionSpend') return missionSpendState(state, action);
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

const withOrderAndCharge = (table: TableState, action: TableAction, turnFacts: TurnFacts, cardText: boolean): TableAction[] =>
  withCharge(table, withShuffleOrder(table, withCardText(action, cardText)), turnFacts);

// `log` is the game's log, for the pending discounts of the turn (#1656). With none, no discount waits.
// `cardText` is the setting "Apply card text to attributes" (#1668), off by default.
export function withShuffleOrders(table: TableState, action: GameAction, log: LogEntry[] = [], cardText = false): GameAction {
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
    action.type === 'resolveDraw' ||
    action.type === 'resolveBottom' ||
    action.type === 'resolveDiscardDraw' ||
    action.type === 'resolveExchange'
  ) {
    return action;
  }
  if (action.type === 'downloadForCharge') {
    if (action.order) return action;
    return { ...action, order: shuffledIds(table.drawDeck.filter((c) => !action.ids.includes(c.id))) };
  }
  if (action.type === 'resolveDownload') {
    if (action.order) return action;
    const copy = downloadCopyOf(table, action.personnelId);
    return copy ? { ...action, order: shuffledIds(table.drawDeck.filter((c) => c.id !== copy.id)) } : action;
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
      const chosen = effect && a.type === 'move' ? [a] : withOrderAndCharge(state, a, turnFacts, cardText);
      state = chosen.reduce(tableReducer, state);
      return chosen;
    });
    return { ...action, actions };
  }
  const chosen = withOrderAndCharge(table, action, action.type === 'move' ? turnFactsOf(log, table.turn) : noTurnFacts(), cardText);
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
// the resolving event that goes to the discard pile (#1727), or is removed from the game (#1730).
const moveText = (move: LogMove): { verb: 'played' | 'moved' | 'resolved'; text: string } => {
  const costs = moveCosts(move);
  if (costs && costs.every((c) => c !== null)) {
    return { verb: 'played', text: `${cardsText(move.cards)}${playedPlaceText(move.to)}${movedCostText(move)}` };
  }
  if (move.from.kind === 'resolving' && move.to.kind === 'discard' && move.removedFromGame) {
    return { verb: 'resolved', text: `${cardsText(move.cards)}, and removed it from the game` };
  }
  if (move.from.kind === 'resolving' && move.to.kind === 'discard') {
    return { verb: 'resolved', text: `${cardsText(move.cards)}, and it went to ${placeText(move.to)}` };
  }
  return {
    verb: 'moved',
    text: `${cardsText(move.cards)} from ${placeText(move.from)} to ${destinationText(move)}${movedRangeText(move)}${movedCostText(move)}${move.removedFromGame ? ', and removed from the game' : ''}`,
  };
};

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
  missionSpend: true,
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
      const drew = `drew a ${entry.from === 'drawDeck' ? 'card' : 'dilemma'} from ${placeText({ kind: entry.from })} into ${placeText({ kind: entry.to })}${cost}`;
      return entry.shuffled ? `Shuffled ${placeText({ kind: entry.from })}, then ${drew}` : capitalize(drew);
    }
    case 'move': {
      // Each run of moves of one verb shares it: "Moved A from …; B from …; played C at …".
      const moves = entry.moves.map(moveText).map((m, i, all) => (i > 0 && all[i - 1].verb === m.verb ? m.text : `${m.verb} ${m.text}`));
      const shuffled = entry.shuffled ? `shuffled ${placeText(entry.shuffled)}` : null;
      const text = moves.length ? capitalize(moves.join('; ')) : '';
      if (!shuffled) return text;
      return text ? `${text}, then ${shuffled}` : capitalize(shuffled);
    }
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
      const moves = (effect.moves ?? []).map(moveText).map((m, i, all) => (i > 0 && all[i - 1].verb === m.verb ? m.text : `${m.verb} ${m.text}`));
      const parts = [
        ...(moves.length ? [moves.join('; ')] : []),
        ...(effect.shuffled ? [`shuffled ${placeText(effect.shuffled)}`] : []),
        ...(effect.flipped ? ['flipped it to its back'] : []),
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
      const effects = prevented || overcome || [ops, modifiers].filter(Boolean).join('; ') || 'no effect';
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
      return `Resolved ${entry.dilemma}: ${[...steps, effects].join('; ')}${notes}${went}`;
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
      return `Exchanged ${fromHand} for ${fromTable}, and ${event} ${eventWent(entry)}`;
    }
    case 'missionSpend': {
      // "Spent 1 counter at Earth Lush and Beautiful Home, and drew 2 cards".
      const spent = `Spent ${countersText(isIndex(entry.cost) ? entry.cost : 0)} at ${entry.mission}`;
      if (entry.spend === 'earth') {
        const n = isIndex(entry.drew) ? entry.drew : 0;
        return `${spent}, and drew ${n} ${n === 1 ? 'card' : 'cards'}`;
      }
      return `${spent}, and downloaded ${entry.downloaded ?? 'a card'} into its away team`;
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
// for a stop unstopped in an away team or a crew, never the brig.
export function costUseAvailable(table: TableState, use: Pick<CostUse, 'id' | 'effect'>): boolean {
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
  if (!charge || !use || use.used || !costUseAvailable(state.table, use)) return state;
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

// The step of the resolving event's resolve model (#1739), derived from the log so an undo and a reload
// agree: `'bottom'` once a `resolveDrew` entry of this event follows the latest move of a card into the
// resolving zone, `'draw'` before it. A "discard a card from hand to draw" event (#1745) has one step,
// `'discardDraw'`, whose action ends the resolution. Null when nothing resolves or the event has no model.
export function resolveStepOf(state: { table: TableState; log: LogEntry[] }): 'draw' | 'bottom' | 'discardDraw' | 'download' | 'exchange' | null {
  const event = state.table.resolving;
  if (!event) return null;
  const name = cardName(state.table, event.id);
  const model = resolveModelOf(name);
  if (!model) return null;
  if (model.kind === 'discardDraw') return 'discardDraw';
  if (model.kind === 'downloadCopy') return 'download';
  if (model.kind === 'exchange') return 'exchange';
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (entry.kind === 'resolveDrew') return entry.event === name ? 'bottom' : 'draw';
    if (entry.kind === 'resolveBottom' || entry.kind === 'playCancelled') return 'draw';
    if (entry.kind === 'move' && entry.moves.some((m) => m.to.kind === 'resolving')) return 'draw';
  }
  return 'draw';
}

// The free draw of the resolving event (#1739): only at the draw step of its model. These Are The Voyages
// draws the printed cost of `personnelId`, one of the player's personnel in an away team or a crew,
// stopped or not, never the brig; Miracle Working its fixed number. The draws stop when the draw deck
// runs out, and the entry gives the real count, 0 included, so the step still moves on. No draw is charged.
function resolveDrawState(state: GameState, action: { personnelId?: string }): GameState {
  const event = state.table.resolving;
  if (!event || resolveStepOf(state) !== 'draw') return state;
  const name = cardName(state.table, event.id);
  const model = resolveModelOf(name);
  if (!model || model.kind !== 'drawThenBottom') return state;
  let wanted: number;
  let personnel: { personnel: string; personnelCost: number } | null = null;
  if (model.draw.kind === 'fixed') {
    wanted = model.draw.count;
  } else {
    const chosen = personnelCandidateGroups(state.table, { includeStopped: true })
      .flatMap((g) => g.cards)
      .find((c) => c.id === action.personnelId);
    if (!chosen) return state;
    wanted = printedCost(chosen.card.card);
    personnel = { personnel: chosen.name, personnelCost: wanted };
  }
  let table = state.table;
  let count = 0;
  while (count < wanted) {
    const next = tableReducer(table, { type: 'drawCard', from: 'drawDeck', to: 'hand' });
    if (next === table) break;
    table = next;
    count++;
  }
  const entry: LogEntry = {
    kind: 'resolveDrew',
    event: name,
    count,
    ...(personnel ?? {}),
    turn: table.turn,
    segment: table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The last step of the resolving event (#1739): exactly `min(bottomFromHand, hand)` different cards of
// the hand go to the bottom of the draw deck in `ids` order, the last at the very bottom, and the event to
// the discard pile ("Destroy this event"), in one entry. Anything else changes nothing.
function resolveBottomState(state: GameState, action: { ids: string[] }): GameState {
  const event = state.table.resolving;
  if (!event || resolveStepOf(state) !== 'bottom') return state;
  const name = cardName(state.table, event.id);
  const model = resolveModelOf(name);
  if (!model || model.kind !== 'drawThenBottom') return state;
  const ids = [...new Set(action.ids)];
  const n = Math.min(model.bottomFromHand, state.table.hand.length);
  if (ids.length !== n || !ids.every((id) => state.table.hand.some((c) => c.id === id))) return state;
  const placed = ids.reduce<TableState>((t, id) => tableReducer(t, { type: 'move', id, to: 'drawDeck', position: 'bottom' }), state.table);
  const recalled = resolvingRecalled(state);
  const table = finishResolving(placed, event.id, recalled);
  if (table === placed) return state;
  const entry: LogEntry = { kind: 'resolveBottom', event: name, count: n, ...(recalled ? { removed: true as const } : {}), turn: table.turn, segment: table.segment };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The one step of a "discard a card from hand to draw" event (#1745): `id` must be a card of the hand, so an
// empty hand never passes (the discard is the cost of the draw). The card goes to the discard pile, the
// model's cards are drawn free (Downfallen Civilization's 3 while no mission slot is completed), as many as
// the draw deck holds, and the event goes to the discard pile ("Destroy this event"), in one entry.
function resolveDiscardDrawState(state: GameState, action: { id: string }): GameState {
  const event = state.table.resolving;
  if (!event || resolveStepOf(state) !== 'discardDraw') return state;
  const name = cardName(state.table, event.id);
  const model = resolveModelOf(name);
  if (!model || model.kind !== 'discardDraw' || !state.table.hand.some((c) => c.id === action.id)) return state;
  const wanted = discardDrawCount(model, state.table.missions.some((s) => s.completed === true));
  let table = tableReducer(state.table, { type: 'move', id: action.id, to: 'discard' });
  if (table === state.table) return state;
  let count = 0;
  while (count < wanted) {
    const next = tableReducer(table, { type: 'drawCard', from: 'drawDeck', to: 'hand' });
    if (next === table) break;
    table = next;
    count++;
  }
  const recalled = resolvingRecalled(state);
  table = finishResolving(table, event.id, recalled);
  const entry: LogEntry = {
    kind: 'resolveDiscardDraw',
    event: name,
    discarded: cardName(state.table, action.id),
    count,
    ...(recalled ? { removed: true as const } : {}),
    turn: table.turn,
    segment: table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The one step of Second Edition (#1746): the personnel must be one the player commands with a copy in the
// draw deck (`downloadCopyOf`). The copy goes to the hand, the draw deck shuffles in the carried `order` (a
// missing or stale order leaves it as it is, so the reducer calls no random function), an [AU] personnel
// draws its card free, as many as the deck holds, and the event goes to the discard pile, in one entry.
function resolveDownloadState(state: GameState, action: { personnelId: string; order?: string[] }): GameState {
  const event = state.table.resolving;
  if (!event || resolveStepOf(state) !== 'download') return state;
  const name = cardName(state.table, event.id);
  const model = resolveModelOf(name);
  const copy = downloadCopyOf(state.table, action.personnelId);
  if (!model || model.kind !== 'downloadCopy' || !copy) return state;
  const personnel = findInstanceAnywhere(state.table, action.personnelId)?.instance;
  let table = tableReducer(state.table, { type: 'move', id: copy.id, to: 'hand' });
  if (table === state.table) return state;
  table = tableReducer(table, { type: 'shuffle', location: 'drawDeck', ...(action.order ? { order: action.order } : { order: table.drawDeck.map((c) => c.id) }) });
  const wanted = cardHasIcon(personnel?.card, model.drawIfIcon) ? model.draw : 0;
  let count = 0;
  while (count < wanted) {
    const next = tableReducer(table, { type: 'drawCard', from: 'drawDeck', to: 'hand' });
    if (next === table) break;
    table = next;
    count++;
  }
  const recalled = resolvingRecalled(state);
  table = finishResolving(table, event.id, recalled);
  const entry: LogEntry = {
    kind: 'resolveDownloaded',
    event: name,
    personnel: cardName(state.table, action.personnelId),
    count,
    ...(recalled ? { removed: true as const } : {}),
    turn: table.turn,
    segment: table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// The one step of Vidiian Organ Bank (#1765): `handId` must be a personnel of the model's affiliation in the
// hand and `tableId` one the player commands, unstopped, never the brig (`exchangeCandidatesOf`). The table's
// goes to the hand, the hand's to the end of the away team or crew the other left (a card from the hand is
// never stopped), and the event to the discard pile, in one entry. No move is charged.
function resolveExchangeState(state: GameState, action: { handId: string; tableId: string }): GameState {
  const event = state.table.resolving;
  if (!event || resolveStepOf(state) !== 'exchange') return state;
  const name = cardName(state.table, event.id);
  const model = resolveModelOf(name);
  if (!model || model.kind !== 'exchange') return state;
  const { hand, groups } = exchangeCandidatesOf(state.table, model.affiliation);
  const group = groups.find((g) => g.cards.some((c) => c.id === action.tableId));
  if (!group || !hand.some((c) => c.id === action.handId)) return state;
  const to: MoveTarget = group.key.startsWith('crew-')
    ? { zone: 'crew', shipId: group.key.slice('crew-'.length) }
    : { zone: 'missionPile', missionIndex: Number(group.key.slice('awayTeam-'.length)), pile: 'awayTeam' };
  const left = tableReducer(state.table, { type: 'move', id: action.tableId, to: 'hand' });
  const joined = tableReducer(left, { type: 'move', id: action.handId, to });
  const recalled = resolvingRecalled(state);
  const table = finishResolving(joined, event.id, recalled);
  if (left === state.table || joined === left || table === joined) return state;
  const entry: LogEntry = {
    kind: 'resolveExchanged',
    event: name,
    fromHand: cardName(state.table, action.handId),
    fromTable: cardName(state.table, action.tableId),
    ...(recalled ? { removed: true as const } : {}),
    turn: table.turn,
    segment: table.segment,
  };
  return { table, log: [...state.log, entry], undo: [...state.undo, state.table], redo: [] };
}

// Whether an action carries a charge of the table (#1607), so the page shows its chip.
export function actionCharged(action: GameAction): boolean {
  if (action.type === 'missionSpend') return true;
  const actions = action.type === 'batch' ? action.actions : [action];
  return actions.some((a) => (a.type === 'move' || a.type === 'drawCard') && typeof a.cost === 'number');
}

// The label of a mission's spend in the chip and the list (#1754), "Earth Lush and Beautiful Home: draw 2".
export const missionSpendLabel = (entry: Extract<LogEntry, { kind: 'missionSpend' }>): string =>
  entry.spend === 'earth' ? `${entry.mission}: draw ${entry.drew ?? 0}` : `${entry.mission}: ${entry.downloaded ?? 'download'}`;

// Earth's offer of a spend (#1754): its slot, and the entries of this turn's plays of a [TOS] card into
// its away team or onto its mission card, from the effective log, so a cancelled play offers nothing.
// Null outside play and draw, with no such play this turn, with an empty draw deck, or once the turn has
// spent at Earth. Earth's first slot counts.
export function earthSpendOf(state: { table: TableState; log: LogEntry[] }): { slot: number; entries: number[] } | null {
  const { table } = state;
  if (table.segment !== 'playAndDraw' || table.drawDeck.length === 0) return null;
  const slot = slotsTitled(table, EARTH_TITLE)[0];
  if (slot === undefined) return null;
  const name = missionName(table, slot);
  const log = effectiveLog(state.log);
  const turnEntries = log.flatMap((e, i) => (e.turn === table.turn && entrySegment(e) === 'playAndDraw' ? [{ e, i }] : []));
  if (turnEntries.some(({ e }) => e.kind === 'missionSpend' && e.spend === 'earth')) return null;
  const here = (to: LogPlace): boolean => (to.kind === 'awayTeam' && to.mission === name) || (to.kind === 'on' && to.card === name);
  const entries = turnEntries.flatMap(({ e, i }) =>
    e.kind === 'move' &&
    e.moves.some((m) => {
      const costs = moveCosts(m);
      return (
        here(m.to) &&
        !!costs &&
        costs.some((c, j) => typeof c === 'number' && (m.plays?.[j]?.icons ?? []).includes('[tos]'))
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

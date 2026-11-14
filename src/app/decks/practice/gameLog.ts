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
import { drawSpend } from './drawSpend';
import { shipRangeOnTable } from './shipRange';
import { revealPicksOf } from './attempt';
import { CostPlace, drawCharge, moveCharge } from '../../../lib/playCost';
import type { CostSource, LimitGrant, PendingDiscount } from '../../../lib/costModels/model';
import { limitGrantsOf, pendingDiscountOf } from '../../../lib/costModels/registry';
import { costFactsOf } from './costFacts';

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
  // The printed cost of each card played from the hand in the play and draw segment (#1606), in the
  // order of `cards`, null for a card that was not a play. Absent when no card of the move was one.
  costs?: (number | null)[];
  // The source of each cost the table suggested (#1654), in the order of `cards`, null for a printed
  // cost or a card that was not a play. Absent when no cost of the move had one, and in an entry from
  // before #1654.
  sources?: (CostSource | null)[];
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
  | { kind: 'missionCompleted'; mission: string; completed: boolean }
  | { kind: 'nextTurn' }
  // The next-turn button moved the turn to another segment of the same turn (#1605).
  | { kind: 'segment'; to: TurnSegment }
  | { kind: 'score'; delta: number; score: number }
  // A mission attempt (#1163): the ship only at a space mission.
  | { kind: 'attemptStarted'; mission: string; ship?: string; personnel: number; subtract: number }
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
    }
  // A correction of one charge by the player (#1607): `target` names the charge, `card` its card
  // (null for an unseen card, absent for a draw), `from` and `to` the cost before and after.
  // `source` is the title of the model whose choice the player took (#1654), "Goran".
  | { kind: 'chargeCorrected'; target: ChargeTarget; card?: LogCard; draw?: true; from: number; to: number; source?: string }
  // A change of the turn's limit of counters by the player (#1607), and the limit it left.
  // `source` names the model whose choice raised the limit (#1655), "Tricia Jenkins", and `target` the
  // charge of the play that offered it.
  | { kind: 'counterLimit'; delta: number; limit: number; source?: string; target?: ChargeTarget }
  // The player dismissed a pending discount (#1656): `target` names the charge of the play that made
  // it, `source` the model's name, "Sarish Rez".
  | { kind: 'discountDismissed'; target: ChargeTarget; source: string }
);

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
  // `source` names the model whose choice sets the cost (#1654).
  | { type: 'correctCharge'; target: ChargeTarget; cost: number; source?: string }
  // `source` and `target` name the model whose choice changes the limit and its play's charge (#1655).
  | { type: 'adjustCounterLimit'; delta: number; source?: string; target?: ChargeTarget }
  // A dismiss of the pending discount the play at `target` made (#1656), a log entry like a correction.
  | { type: 'dismissDiscount'; target: ChargeTarget }
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
function moveEntry(
  before: TableState,
  moves: Extract<TableAction, { type: 'move' }>[],
  unseen: boolean
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
      const group = groups.find(
        (g) => placeKey(g.from) === placeKey(from) && placeKey(g.to) === placeKey(to) && g.position === position
      );
      if (group) {
        if (cost !== null || group.costs) group.costs = [...(group.costs ?? group.cards.map(() => null)), cost];
        if (source || group.sources) group.sources = [...(group.sources ?? group.cards.map(() => null)), source];
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
          return {
            ...(went ? { went } : {}),
            ...(added ? { added } : {}),
            ...(restReturned ? { restReturned } : {}),
          };
        })(),
      };
    }
    case 'nextTurn':
      return { kind: 'nextTurn' };
    case 'advanceSegment':
      return after.turn !== before.turn ? { kind: 'nextTurn' } : { kind: 'segment', to: after.segment };
    case 'adjustScore':
      if (after.score === before.score) return null;
      return { kind: 'score', delta: after.score - before.score, score: after.score };
    default:
      return null;
  }
}

// The entry one player action makes, or null when it changed nothing the log records. `after` is
// the table once every action of the batch applied. The entry belongs to the turn after the
// action, so the entry of `nextTurn` heads the group of the new turn.
export function logEntryFor(
  before: TableState,
  action: Exclude<GameAction, { type: 'undo' } | { type: 'redo' } | { type: 'correctCharge' } | { type: 'adjustCounterLimit' } | { type: 'dismissDiscount' }>,
  after: TableState,
): LogEntry | null {
  let body: EntryBody | null;
  if (action.type === 'batch') {
    const moves = action.actions.filter((a): a is Extract<TableAction, { type: 'move' }> => a.type === 'move');
    const flips = action.actions.filter((a): a is Extract<TableAction, { type: 'flip' }> => a.type === 'flip');
    if (moves.length) {
      const logMoves = moveEntry(before, moves, !!action.unseen);
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

// The action with its charge in it (#1606): a `move` of a card from the hand that landed on the
// table, and a `drawCard` from the draw deck, in the play and draw segment, as `moveCharge` and
// `drawCharge` give it. The place a move reads is where the card landed, so a refused move costs
// nothing. The reducer ignores the field and the log reads it. An action that already holds a cost
// keeps it. A move reads the facts of the cost models (#1654) from the table and `turnFacts`, the
// pending discounts of the turn (#1656); a play that uses a discount takes the discount off, so the
// next action of a batch sees it gone. A download makes no play free: it only takes a card into the
// hand.
interface TurnFacts {
  pending: PendingDiscount[];
}

const noTurnFacts = (): TurnFacts => ({ pending: [] });

const turnFactsOf = (log: LogEntry[], turn: number): TurnFacts => ({
  pending: pendingDiscountsOf(log, turn),
});

function withCharge(table: TableState, action: TableAction, turnFacts: TurnFacts): TableAction {
  const { pending } = turnFacts;
  if (action.type === 'drawCard' && action.cost === undefined) {
    const charge = drawCharge(table.segment, action.from, action.to);
    if (charge && tableReducer(table, action) !== table) return { ...action, cost: charge.cost };
  }
  if (action.type === 'move' && action.cost === undefined) {
    const found = findInstanceAnywhere(table, action.id);
    const next = found ? tableReducer(table, action) : table;
    const landed = next !== table ? findInstanceAnywhere(next, action.id) : null;
    const charge =
      found && landed
        ? moveCharge(
            table.segment,
            costPlace(found.zone),
            costPlace(landed.zone),
            found.instance.card,
            costFactsOf(table, pending),
            action.id
          )
        : null;
    if (charge?.kind === 'play' && charge.source) {
      const discount = charge.source.discount;
      const usedDiscount = discount ? pending.findIndex((d) => sameTarget(d.origin, discount)) : -1;
      if (usedDiscount >= 0) pending.splice(usedDiscount, 1);
      return { ...action, cost: charge.cost, costSource: charge.source };
    }
    if (charge) return { ...action, cost: charge.cost };
  }
  return action;
}

// The setting "Apply card text to attributes" (#1668) joins every move while it is on, so the reducer
// reads no storage and a redo puts back the range the move used.
const withCardText = (action: TableAction, cardText: boolean): TableAction =>
  cardText && action.type === 'move' && action.cardText === undefined ? { ...action, cardText: true } : action;

const withOrderAndCharge = (table: TableState, action: TableAction, turnFacts: TurnFacts, cardText: boolean): TableAction =>
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
    action.type === 'dismissDiscount'
  ) {
    return action;
  }
  if (action.type === 'batch') {
    if (!action.actions.some((a) => a.type === 'shuffle' || a.type === 'drawCard' || a.type === 'flip' || a.type === 'move')) {
      return action;
    }
    const turnFacts = turnFactsOf(log, table.turn);
    let state = table;
    const actions = action.actions.map((a) => {
      const chosen = withOrderAndCharge(state, a, turnFacts, cardText);
      state = tableReducer(state, chosen);
      return chosen;
    });
    return { ...action, actions };
  }
  return withOrderAndCharge(table, action, action.type === 'move' ? turnFactsOf(log, table.turn) : noTurnFacts(), cardText);
}

// The pending discounts of `turn` (#1656), oldest first: each play of the turn whose card's model makes
// one, less those a later charge used (its source names the play) and those a `discountDismissed`
// entry dismissed. Read from the effective log alone, so an undo, a redo and a reload agree, and the
// next turn has none. A correction of the play that used a discount leaves it used.
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
    for (const charge of chargesOf(entry, i)) {
      if (charge.source?.discount) close(charge.source.discount);
      const made = charge.card ? pendingDiscountOf(charge.card, charge.target) : null;
      if (made) open.push(made);
    }
  });
  return open;
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

// Where a card was played (#1606): "at Earth" for a ship row or an away team, "on Data" for a card,
// and "to" the crew or the core.
const playedPlaceText = (place: LogPlace): string => {
  if (place.kind === 'shipRow' || place.kind === 'awayTeam') return `at ${place.mission}`;
  if (place.kind === 'on') return `on ${place.card}`;
  return `to ${placeText(place)}`;
};

// The text of one move, with its verb: "played" when every card of it was a play.
const moveText = (move: LogMove): { verb: 'played' | 'moved'; text: string } => {
  const costs = moveCosts(move);
  if (costs && costs.every((c) => c !== null)) {
    return { verb: 'played', text: `${cardsText(move.cards)} ${playedPlaceText(move.to)}${movedCostText(move)}` };
  }
  return {
    verb: 'moved',
    text: `${cardsText(move.cards)} from ${placeText(move.from)} to ${destinationText(move)}${movedRangeText(move)}${movedCostText(move)}`,
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
    case 'missionCompleted':
      return `Marked ${entry.mission} ${entry.completed ? 'complete' : 'not complete'}`;
    case 'nextTurn':
      return `Started turn ${entry.turn}`;
    case 'segment':
      return `Went to ${entry.to === 'discard' ? 'discard' : 'orders'}`;
    case 'score':
      return `Score ${entry.delta > 0 ? '+' : ''}${entry.delta} (now ${entry.score})`;
    case 'attemptStarted':
      return `Attempted ${entry.mission}${entry.ship ? ` with ${entry.ship}` : ''}: ${entry.personnel} personnel − ${
        entry.subtract
      } = draw/spend ${drawSpend(entry.personnel, entry.subtract)}`;
    case 'attemptEnded':
      return entry.moved?.length
        ? `Ended the attempt at ${entry.mission}, and moved ${cardsText(entry.moved)} under ${entry.mission}`
        : `Ended the attempt at ${entry.mission}`;
    case 'botAttempt': {
      const dilemmas = (n: number) => `${n} ${n === 1 ? 'dilemma' : 'dilemmas'}`;
      const text = `Attempted ${entry.mission}${entry.ship ? ` with ${entry.ship}` : ''}: ${entry.personnel} personnel − ${
        entry.subtract
      }; the bot drew ${dilemmas(entry.redrew ?? entry.drew)}${
        entry.redrew ? `, used Unexpected Difficulties to return them and draw ${entry.drew} more,` : ''
      } and put ${entry.stacked} in the stack${entry.random ? ' at random' : ''}`;
      const returned = Array.isArray(entry.returned) ? entry.returned.length : (entry.returned ?? 0);
      return returned ? `${text}, and moved ${dilemmas(returned)} to the bottom of the dilemma pile` : text;
    }
    case 'dilemmaResolved': {
      const ops = entry.ops.map(({ op, cards }) => `${RESOLVE_OP_TEXT[op]} ${cardsText(cards)}`).join(', ');
      const modifiers = typeof entry.modifiers === 'string' ? entry.modifiers : '';
      const effects = [ops, modifiers].filter(Boolean).join('; ') || 'no effect';
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
    case 'chargeCorrected':
      return `Charged ${entry.draw ? 'a draw' : (entry.card ?? 'a card')} ${countersText(entry.to)} (was ${entry.from})${
        typeof entry.source === 'string' && entry.source ? ` (${entry.source})` : ''
      }`;
    case 'counterLimit':
      return `Set this turn's counters to ${entry.limit}${typeof entry.source === 'string' && entry.source ? ` (${entry.source})` : ''}`;
    case 'discountDismissed':
      return `Dismissed the discount of ${typeof entry.source === 'string' && entry.source ? entry.source : 'a card'}`;
  }
}

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
  if (entry.kind === 'draw') {
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

const effectiveCache = new WeakMap<LogEntry[], LogEntry[]>();

// The log with each charge at the cost of the last correction aimed at it (#1607). The play's own
// entry then reads the corrected cost, and the totals count it. A correction made in orders lands in
// the orders group, while its charge sits in play and draw, so this runs over the whole log before
// `logByTurn` groups it. A log with no correction is returned as it is.
export function effectiveLog(log: LogEntry[]): LogEntry[] {
  const cached = effectiveCache.get(log);
  if (cached) return cached;
  let result = log;
  log.forEach((entry, i) => {
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
}

// The charges of the entry at `index` of an effective log.
function chargesOf(entry: LogEntry, index: number): LogCharge[] {
  if (entry.kind === 'draw' && typeof entry.cost === 'number') {
    return [{ target: { entry: index }, card: null, draw: true, cost: entry.cost }];
  }
  if (entry.kind !== 'move') return [];
  return entry.moves.flatMap((move, m) => {
    const sources = moveSources(move);
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
            },
          ]
    );
  });
}

// The charges with `choiceTaken` set where a correction in `log` took the choice of the charge's source:
// a `chargeCorrected` of its cost, or a `counterLimit` of the turn's limit (#1655), aimed at the charge.
function withChoicesTaken(log: LogEntry[], charges: LogCharge[]): LogCharge[] {
  return charges.map((charge) =>
    charge.source?.choice &&
    log.some(
      (e) =>
        (e.kind === 'chargeCorrected' || e.kind === 'counterLimit') &&
        e.source === charge.source!.title &&
        !!e.target &&
        sameTarget(e.target, charge.target)
    )
      ? { ...charge, choiceTaken: true }
      : charge
  );
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

// The limit of counters of `turn`: 7, the `grants` of the cost models (#1655), and the turn's changes,
// never below 0. A new turn starts at 7 and its grants. The grants read the table as it stands now, so
// they belong to the current turn, the one the counter shows.
export const turnCounterLimit = (log: LogEntry[], turn: number, grants: LimitGrant[] = []): number =>
  Math.max(
    0,
    log.reduce(
      (limit, e) => (e.kind === 'counterLimit' && e.turn === turn && typeof e.delta === 'number' ? limit + e.delta : limit),
      grants.reduce((sum, g) => sum + g.amount, TURN_COUNTER_LIMIT)
    )
  );

export interface TurnCounters {
  spent: number;
  limit: number;
  // The grants of the cost models to the limit (#1655), "Surprise Party +1".
  grants: LimitGrant[];
}

// The grants of the cost models to the current turn's limit (#1655), from the table as it stands.
export const tableLimitGrants = (table: TableState): LimitGrant[] => limitGrantsOf(costFactsOf(table, []));

// The counters `turn` spent and its limit, derived from the log and the grants of the table, so an
// undo, a redo and a reload agree.
export const turnCounters = (log: LogEntry[], turn: number, grants: LimitGrant[] = []): TurnCounters => ({
  spent: turnCharges(log, turn).reduce((sum, c) => sum + c.cost, 0),
  limit: turnCounterLimit(log, turn, grants),
  grants,
});

const sameTarget = (a: ChargeTarget, b: ChargeTarget): boolean => a.entry === b.entry && a.move === b.move && a.card === b.card;

// The entry of a correction of a charge, or null when the action names no charge or changes nothing.
// A cost below 0 is 0.
function chargeCorrectionEntry(state: GameState, action: { target: ChargeTarget; cost: number; source?: string }): LogEntry | null {
  const charge = entryCharges(state.log, action.target.entry).find((c) => sameTarget(c.target, action.target));
  const to = Math.max(0, Math.round(action.cost));
  if (!charge || !Number.isFinite(to) || to === charge.cost) return null;
  return {
    kind: 'chargeCorrected',
    target: charge.target,
    ...(charge.draw ? { draw: true as const } : { card: charge.card }),
    from: charge.cost,
    to,
    ...(action.source ? { source: action.source } : {}),
    turn: state.table.turn,
    segment: state.table.segment,
  };
}

// The entry of a change of the current turn's limit, or null at 0 going down. A change by a model's
// choice names its source and the charge that offered it (#1655).
function counterLimitEntry(state: GameState, action: { delta: number; source?: string; target?: ChargeTarget }): LogEntry | null {
  const limit = turnCounterLimit(state.log, state.table.turn, tableLimitGrants(state.table));
  const next = Math.max(0, limit + Math.round(action.delta));
  if (!Number.isFinite(next) || next === limit) return null;
  return {
    kind: 'counterLimit',
    delta: next - limit,
    limit: next,
    ...(action.source ? { source: action.source } : {}),
    ...(action.source && action.target ? { target: action.target } : {}),
    turn: state.table.turn,
    segment: state.table.segment,
  };
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

// Whether an action carries a charge of the table (#1607), so the page shows its chip.
export function actionCharged(action: GameAction): boolean {
  const actions = action.type === 'batch' ? action.actions : [action];
  return actions.some((a) => (a.type === 'move' || a.type === 'drawCard') && typeof a.cost === 'number');
}

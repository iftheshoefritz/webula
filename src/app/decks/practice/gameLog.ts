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
  cardsAt,
  drawReshuffles,
  shuffledIds,
  findInstanceAnywhere,
  MoveTarget,
  ReorderZone,
  AttemptPhase,
  TableAction,
  TableState,
  TableZone,
  tableReducer,
  Zone,
} from './tableReducer';
import { drawSpend } from './drawSpend';

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
}

export type LogEntry = { turn: number } & (
  // A draw that reached a face-up dilemma shuffled the dilemma pile first (#1283), and `shuffled`
  // says so.
  | { kind: 'draw'; from: 'drawDeck' | 'dilemmaPile'; to: 'hand' | 'dilemmaHand'; shuffled?: true }
  // One player action, so one entry, even when its cards went to more than one place (a group
  // dropped on a mission sends a ship to the ship row and a personnel to the away team). A
  // download shuffles the pile after its moves, and `shuffled` names it.
  | { kind: 'move'; moves: LogMove[]; shuffled?: LogPlace }
  | { kind: 'flip'; cards: { name: string; face: 'up' | 'down' }[] }
  | { kind: 'flipMission'; mission: string; flipped: boolean }
  | { kind: 'shuffle'; place: LogPlace }
  | { kind: 'reorder'; zone: ReorderZone }
  | { kind: 'stopped'; cards: string[]; stopped: boolean }
  | { kind: 'missionCompleted'; mission: string; completed: boolean }
  | { kind: 'nextTurn' }
  | { kind: 'score'; delta: number; score: number }
  // A mission attempt (#1163): the ship only at a space mission.
  | { kind: 'attemptStarted'; mission: string; ship?: string; personnel: number; subtract: number }
  // The dilemmas still in the stack that Attempt done moved under the mission (#1170), when any.
  | { kind: 'attemptEnded'; mission: string; moved?: string[] }
  // A change of the attempt's phase (#1189). Choose -> face names the dilemmas it sent from the
  // dilemma hand to the bottom of the dilemma pile, when any.
  | { kind: 'attemptPhase'; mission: string; phase: AttemptPhase; returned?: string[] }
  // Start in a bot game (#1299): the bot's draw and its stack, counted and never named, since the
  // stack is face down. `returned` names the drawn dilemmas the bot did not choose, which went to the
  // bottom of the dilemma pile face up.
  | {
      kind: 'botAttempt';
      mission: string;
      ship?: string;
      personnel: number;
      subtract: number;
      drew: number;
      stacked: number;
      random?: true;
      returned?: string[];
    }
);

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
      const group = groups.find(
        (g) => placeKey(g.from) === placeKey(from) && placeKey(g.to) === placeKey(to) && g.position === position
      );
      if (group) group.cards.push(card);
      else groups.push({ cards: [card], from, to, ...(position ? { position } : {}) });
    }
    state = next;
  }
  // A 'top' drop dispatches its group in reverse (#677), so the cards read in the group's order.
  return groups.map((g) => (g.position === 'top' ? { ...g, cards: [...g.cards].reverse() } : g));
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

type EntryBody = LogEntry extends infer E ? (E extends LogEntry ? Omit<E, 'turn'> : never) : never;

function singleEntry(before: TableState, action: TableAction, after: TableState): EntryBody | null {
  switch (action.type) {
    case 'drawCard':
      if (after === before) return null;
      return {
        kind: 'draw',
        from: action.from as 'drawDeck' | 'dilemmaPile',
        to: action.to as 'hand' | 'dilemmaHand',
        ...(drawReshuffles(before, action) ? { shuffled: true as const } : {}),
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
      const returned = action.drawn.filter((id) => !stacked.has(id)).map((id) => cardName(before, id));
      return {
        kind: 'botAttempt',
        mission: missionName(before, action.missionIndex),
        ...(action.shipId ? { ship: cardName(before, action.shipId) } : {}),
        personnel: action.personnel,
        subtract: action.subtract,
        drew: action.drawn.length,
        stacked: stacked.size,
        ...(action.random ? { random: true as const } : {}),
        ...(returned.length ? { returned } : {}),
      };
    }
    case 'nextTurn':
      return { kind: 'nextTurn' };
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
  action: Exclude<GameAction, { type: 'undo' } | { type: 'redo' }>,
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
  return body ? ({ ...body, turn: after.turn } as LogEntry) : null;
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
  return action;
}

export function withShuffleOrders(table: TableState, action: GameAction): GameAction {
  if (action.type === 'batch') {
    if (!action.actions.some((a) => a.type === 'shuffle' || a.type === 'drawCard')) return action;
    let state = table;
    const actions = action.actions.map((a) => {
      const chosen = withShuffleOrder(state, a);
      state = tableReducer(state, chosen);
      return chosen;
    });
    return { ...action, actions };
  }
  if (action.type === 'undo' || action.type === 'redo' || action.type === 'restore') return action;
  return withShuffleOrder(table, action);
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
    case 'missions':
      return 'the mission row';
    case 'shipRow':
      return `the ships at ${place.mission}`;
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
  missionCompleted: true,
  nextTurn: true,
  score: true,
  attemptStarted: true,
  attemptEnded: true,
  attemptPhase: true,
  botAttempt: true,
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
      const drew = `drew a ${entry.from === 'drawDeck' ? 'card' : 'dilemma'} from ${placeText({ kind: entry.from })} into ${placeText({ kind: entry.to })}`;
      return entry.shuffled ? `Shuffled ${placeText({ kind: entry.from })}, then ${drew}` : capitalize(drew);
    }
    case 'move': {
      const moves = entry.moves.map(
        (m) => `${cardsText(m.cards)} from ${placeText(m.from)} to ${destinationText(m)}`
      );
      const shuffled = entry.shuffled ? `shuffled ${placeText(entry.shuffled)}` : null;
      const text = moves.length ? `Moved ${moves.join('; ')}` : '';
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
    case 'missionCompleted':
      return `Marked ${entry.mission} ${entry.completed ? 'complete' : 'not complete'}`;
    case 'nextTurn':
      return `Started turn ${entry.turn}`;
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
      }; the bot drew ${dilemmas(entry.drew)} and put ${entry.stacked} in the stack${entry.random ? ' at random' : ''}`;
      return entry.returned?.length
        ? `${text}, and moved ${cardsText(entry.returned)} to the bottom of the dilemma pile`
        : text;
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
  }
}

// The entries of each turn, oldest first.
export function logByTurn(log: LogEntry[]): { turn: number; entries: LogEntry[] }[] {
  const groups: { turn: number; entries: LogEntry[] }[] = [];
  for (const entry of log) {
    const last = groups[groups.length - 1];
    if (last && last.turn === entry.turn) last.entries.push(entry);
    else groups.push({ turn: entry.turn, entries: [entry] });
  }
  return groups;
}

export const EMPTY_LOG_TEXT = 'Nothing has happened yet.';

// The whole log as plain text for the clipboard: a "Turn N" line, then one line per entry.
export function gameLogText(log: LogEntry[]): string {
  if (log.length === 0) return EMPTY_LOG_TEXT;
  return logByTurn(log)
    .map(({ turn, entries }) => [`Turn ${turn}`, ...entries.map((e) => `- ${logEntryText(e)}`)].join('\n'))
    .join('\n\n');
}

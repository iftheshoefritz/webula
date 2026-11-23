// The game events of a log entry (#1903, part 1 of #1867): what one entry of the effective log did, in the
// vocabulary of the trigger rows (`GameEvent` in `src/lib/triggers/model.ts`). The events derive from the entry
// alone, and the table it left supplies the card instances, so an undo, a redo and a reload agree, as with
// `pendingPlayEffectOf`. Most entries name cards by display name; the table finds the instance again where it
// still holds it, and an event keeps the name alone where it does not.

import { cardDisplayName } from '../../../lib/cardCount';
import type { CostTurnPlay } from '../../../lib/costModels/model';
import { missionAt } from '../../../lib/tableView';
import type { GameEvent, GameEventCard, GameEventSegment, PlayedPlace } from '../../../lib/triggers/model';
import { involvedPersonnel } from './completionEffects';
import { entrySegment, type LogEntry, type LogMove, type LogPlace } from './gameLog';
import { attemptingCards, type CardInstance, type TableState } from './tableReducer';
import { tableViewOf } from './tableView';

const nameOf = (c: CardInstance): string => (c.card ? cardDisplayName(c.card) : '');

// Every card of the table with its place: the away teams, the ship rows, the crews, the cards placed on the
// mission cards, the ships and the core cards, the core, the resolving zone, and the piles.
interface Located {
  instance: CardInstance;
  place: PlayedPlace | 'hand' | 'discard' | 'brig' | 'pile';
  missionIndex?: number;
  shipId?: string;
  // The name of the card it is placed on, or of the ship whose crew it is in.
  on?: string;
}

function locatedCards(table: TableState): Located[] {
  const out: Located[] = [];
  const placed = (holder: CardInstance, missionIndex: number | undefined, place: PlayedPlace) =>
    (holder.placedOn ?? []).forEach((instance) => out.push({ instance, place, missionIndex, on: nameOf(holder) }));
  table.missions.forEach((slot, missionIndex) => {
    if (slot.mission) placed(slot.mission, missionIndex, 'missionCard');
    slot.awayTeam.forEach((instance) => out.push({ instance, place: 'awayTeam', missionIndex }));
    slot.ships.forEach((ship) => {
      out.push({ instance: ship, place: 'shipRow', missionIndex });
      placed(ship, missionIndex, 'placed');
      (ship.crew ?? []).forEach((instance) => out.push({ instance, place: 'crew', missionIndex, shipId: ship.id, on: nameOf(ship) }));
    });
  });
  table.core.forEach((instance) => {
    out.push({ instance, place: 'core' });
    placed(instance, undefined, 'placed');
  });
  if (table.resolving) out.push({ instance: table.resolving, place: 'resolving' });
  table.hand.forEach((instance) => out.push({ instance, place: 'hand' }));
  table.discard.forEach((instance) => out.push({ instance, place: 'discard' }));
  (table.botBrig ?? []).forEach((instance) => out.push({ instance, place: 'brig' }));
  table.brig.forEach((instance) => out.push({ instance, place: 'brig' }));
  return out;
}

const missionName = (table: TableState, index: number | undefined): string => {
  const mission = index === undefined ? undefined : table.missions[index]?.mission;
  return mission ? nameOf(mission) : '';
};

// Whether a located card stands at the place a move logged.
function atPlace(table: TableState, found: Located, to: LogPlace): boolean {
  switch (to.kind) {
    case 'awayTeam':
      return found.place === 'awayTeam' && missionName(table, found.missionIndex) === to.mission;
    case 'shipRow':
      return found.place === 'shipRow' && missionName(table, found.missionIndex) === to.mission;
    case 'crew':
      return found.place === 'crew' && found.on === to.ship;
    case 'on':
      return (found.place === 'missionCard' || found.place === 'placed') && found.on === to.card;
    case 'core':
    case 'resolving':
      return found.place === to.kind;
    default:
      return false;
  }
}

// The instance a move logged at `to` by `name`: the one at that place, else none.
function playedInstance(table: TableState, name: string, to: LogPlace): Located | null {
  return locatedCards(table).find((f) => nameOf(f.instance) === name && atPlace(table, f, to)) ?? null;
}

// A card the log named, with its instance id where `pick` finds it, the last such card of the place.
function namedCard(table: TableState, name: string, pick: (f: Located) => boolean): GameEventCard {
  const found = locatedCards(table).filter((f) => nameOf(f.instance) === name && pick(f));
  const last = found[found.length - 1];
  return last ? { id: last.instance.id, name } : { name };
}

const onTable = (f: Located): boolean => f.place === 'awayTeam' || f.place === 'crew' || f.place === 'shipRow';

const names = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

const isTurnPlay = (play: unknown): play is CostTurnPlay => typeof play === 'object' && play !== null && typeof (play as CostTurnPlay).type === 'string';

// The plays of a move: each card whose cost is a number. A move of an entry from before #1703 has no `plays`.
function playedEvents(table: TableState, move: LogMove): GameEvent[] {
  if (!Array.isArray(move.costs)) return [];
  return move.costs.flatMap((cost, c) => {
    const name = move.cards[c];
    if (typeof cost !== 'number' || !name) return [];
    const found = playedInstance(table, name, move.to);
    const traits = move.plays?.[c];
    const place: PlayedPlace = found ? (found.place as PlayedPlace) : move.to.kind === 'core' || move.to.kind === 'resolving' ? move.to.kind : 'other';
    return [
      {
        kind: 'played' as const,
        card: found ? { id: found.instance.id, name } : { name },
        type: String(found?.instance.card?.type ?? (isTurnPlay(traits) ? traits.type : '')).toLowerCase(),
        ...(isTurnPlay(traits) ? { traits } : {}),
        place,
        ...(found?.missionIndex !== undefined ? { missionIndex: found.missionIndex } : {}),
        ...(found?.shipId !== undefined ? { shipId: found.shipId } : {}),
      },
    ];
  });
}

// The start of an attempt: the slot and the ship from the attempt in progress, or, after it ended, the slot of the
// mission's name with no ship; the attempting personnel only while it is in progress.
function attemptEvent(table: TableState, mission: string, bot: boolean): GameEvent {
  const { attempt } = table;
  const missionIndex = attempt ? attempt.missionIndex : table.missions.findIndex((s) => s.mission && nameOf(s.mission) === mission);
  const row = attempt ? attemptingCards(table, attempt.missionIndex, attempt.shipId) ?? [] : [];
  const shipId = attempt?.shipId;
  return {
    kind: 'attemptStarted',
    missionIndex,
    ...(shipId !== undefined ? { shipId } : {}),
    personnel: row.filter((c) => c.card?.type === 'personnel' && !c.stopped).map((c) => c.id),
    ...(bot ? { bot: true as const } : {}),
  };
}

function completedEvent(table: TableState, mission: string): GameEvent | null {
  const missionIndex = table.missions.findIndex((s) => s.mission && nameOf(s.mission) === mission);
  if (missionIndex < 0) return null;
  const slot = missionAt(tableViewOf(table), missionIndex);
  return {
    kind: 'missionCompleted',
    missionIndex,
    quadrant: slot?.quadrant ?? '',
    type: slot?.type ?? '',
    requirements: slot?.requirements ?? '',
    involved: involvedPersonnel(table, missionIndex).map((c) => c.id),
  };
}

// The top card of the facing stack, revealed by this flip: face up, named by the entry, in `'face'`.
function revealedEvent(table: TableState, entry: Extract<LogEntry, { kind: 'flip' }>): GameEvent | null {
  const top = table.dilemmaStack[0];
  if (table.attempt?.phase !== 'face' || !top || top.face !== 'up') return null;
  const name = nameOf(top);
  if (!Array.isArray(entry.cards) || !entry.cards.some((c) => c?.face === 'up' && c.name === name)) return null;
  const snapshot = table.attempt.revealSnapshot;
  const picks = snapshot && snapshot.dilemmaId === top.id && Array.isArray(snapshot.picks) ? snapshot.picks.map(names) : [];
  return { kind: 'dilemmaRevealed', dilemma: { id: top.id, name }, dilemmaType: String(top.card?.dilemmatype ?? '').toLowerCase(), picks };
}

// The events of a dilemma's Resolve: the Resolve, then each stop, kill and brig of its ops.
function resolvedEvents(table: TableState, entry: Extract<LogEntry, { kind: 'dilemmaResolved' }>): GameEvent[] {
  const events: GameEvent[] = [{ kind: 'dilemmaResolved', dilemma: { name: String(entry.dilemma ?? '') } }];
  for (const op of Array.isArray(entry.ops) ? entry.ops : []) {
    const cards = names(op?.cards);
    if (!cards.length) continue;
    if (op.op === 'stop') events.push({ kind: 'stopped', cards: cards.map((n) => namedCard(table, n, onTable)), byDilemma: true });
    if (op.op === 'kill') events.push({ kind: 'killed', cards: cards.map((n) => namedCard(table, n, (f) => f.place === 'discard')), byDilemma: true });
    if (op.op === 'brig') events.push({ kind: 'brigged', cards: cards.map((n) => namedCard(table, n, (f) => f.place === 'brig')), byDilemma: true });
  }
  return events;
}

const stoppedByPlayer = (table: TableState, cards: string[]): GameEvent[] =>
  cards.length ? [{ kind: 'stopped', cards: cards.map((n) => namedCard(table, n, onTable)), byDilemma: false }] : [];

// The events of the entry itself, before those of a change of segment.
function entryEvents(entry: LogEntry, table: TableState): GameEvent[] {
  switch (entry.kind) {
    case 'move':
      return (Array.isArray(entry.moves) ? entry.moves : []).flatMap((m) => playedEvents(table, m));
    case 'draw':
      if (entry.from === 'dilemmaPile') return [{ kind: 'dilemmasDrawn', count: 1 }];
      return entry.to === 'hand' ? [{ kind: 'drew', count: 1 }] : [];
    case 'openingHand':
      return [{ kind: 'drew', count: typeof entry.count === 'number' ? entry.count : 0, opening: true }];
    case 'attemptStarted':
      return [attemptEvent(table, entry.mission, false)];
    case 'botAttempt':
      return [attemptEvent(table, entry.mission, true), { kind: 'dilemmasDrawn', count: typeof entry.drew === 'number' ? entry.drew : 0, bot: true }];
    case 'missionCompleted': {
      const event = entry.completed === true ? completedEvent(table, entry.mission) : null;
      // Ba'ku Planet (#1909): the personnel its completion killed, after the completion.
      const killed = entry.completed === true ? names(entry.effect?.killed) : [];
      const kills: GameEvent[] = killed.length
        ? [{ kind: 'killed', cards: killed.map((n) => namedCard(table, n, (f) => f.place === 'discard')), byDilemma: false }]
        : [];
      return [...(event ? [event] : []), ...kills];
    }
    case 'flip': {
      const event = revealedEvent(table, entry);
      return event ? [event] : [];
    }
    case 'dilemmaResolved':
      return resolvedEvents(table, entry);
    case 'stopped':
      return entry.stopped === true ? stoppedByPlayer(table, names(entry.cards)) : [];
    case 'counterLimit':
      return stoppedByPlayer(table, names(entry.stopped));
    case 'chargeCorrected':
      return entry.used?.effect === 'stop' && typeof entry.used.name === 'string'
        ? [{ kind: 'stopped', cards: [{ id: entry.used.id, name: entry.used.name }], byDilemma: false }]
        : [];
    case 'orderUsed':
      return stoppedByPlayer(table, names(entry.cost?.stopped));
    default:
      return [];
  }
}

/**
 * The game events of `entry`, an entry of the effective log, read with `table`, the table it left (or one later,
 * whose instances it still finds), and `previous`, the entry before it, for the segment the turn left. A `move`
 * gives a `played` for each card it charged; a Draw 7 starts the first turn. A change of segment, by the next-turn
 * button or by an attempt started in play and draw, ends the segment before it and starts the new one; the next
 * turn ends the last segment, starts the turn and its play and draw. An entry from before a field existed gives
 * the events it can: a move with no `plays` its plays with no traits, an entry with no `segment` play and draw.
 */
export function gameEventsOf(entry: LogEntry, table: TableState, previous?: LogEntry): GameEvent[] {
  const before: GameEventSegment = previous ? entrySegment(previous) : 'playAndDraw';
  if (entry.kind === 'nextTurn') {
    return [
      { kind: 'segmentEnded', segment: before },
      { kind: 'turnStarted', turn: entry.turn },
      { kind: 'segmentStarted', segment: 'playAndDraw' },
    ];
  }
  const events: GameEvent[] = [];
  if (entry.kind === 'openingHand') {
    events.push({ kind: 'turnStarted', turn: entry.turn, first: true }, { kind: 'segmentStarted', segment: 'playAndDraw' });
  }
  events.push(...entryEvents(entry, table));
  const after = entrySegment(entry);
  if (after !== before) events.push({ kind: 'segmentEnded', segment: before }, { kind: 'segmentStarted', segment: after });
  return events;
}

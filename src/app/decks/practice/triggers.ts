// The trigger offers of the practice table (#1903, part 1 of #1867), derived from the effective log and never
// stored: no `TableState` field holds an offer, and a save needs no migration. `TriggerOffers` shows them (#1904).

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import { missions, type TableView, type ViewCard } from '../../../lib/tableView';
import { eventMissionIndex, eventSubjects, onRevealedCard, triggerRowsFor, triggerRowsOf } from '../../../lib/triggers';
import type { GameEvent, TriggerContext, TriggerRow } from '../../../lib/triggers';
import { gameEventsOf } from './gameEvents';
import { abilityUsable, effectiveLog, effectSubjectOf, entrySegment, type LogEntry, type TriggerTarget } from './gameLog';
import { findInstanceAnywhere, type CardInstance, type TableState } from './tableReducer';
import { tableViewOf, viewCardOf } from './tableView';

/** One offer: its address, its row, the event that fired it, and its source card (null for the bot's deck). */
export interface TriggerOffer {
  target: TriggerTarget;
  row: TriggerRow;
  event: GameEvent;
  source: CardInstance | null;
  /** The source card's display name, or the row's title for the bot's deck. */
  name: string;
}

// The entries that follow an action and belong to it, so they end none of its offers: a trigger taken or skipped,
// and the steps of an effect or a correction addressed to the action's entry, or a stage of the resolving event.
function followsEntry(entry: LogEntry): { entry?: number } | null {
  switch (entry.kind) {
    case 'triggerUsed':
    case 'triggerEffect':
    case 'triggerSkipped':
    case 'playEffect':
    case 'chargeCorrected':
      return { entry: entry.target?.entry };
    case 'orderEffect':
      return { entry: entry.target };
    case 'effectStep':
      return {};
    default:
      return null;
  }
}

/** The index of the last action entry of `log`, the one whose offers stand, or -1 when a later action ended them. */
export function lastActionEntry(log: LogEntry[]): number {
  const addressed: (number | undefined)[] = [];
  for (let i = log.length - 1; i >= 0; i--) {
    const follows = followsEntry(log[i]);
    if (!follows) return addressed.every((e) => e === undefined || e === i) ? i : -1;
    addressed.push(follows.entry);
  }
  return -1;
}

const titleKey = (c: CardInstance): string => (c.card ? cardTitleOf(cardDisplayName(c.card)).toLowerCase() : '');

// The cards of `row`'s title in its source place, each with the slot it stands at, for the event `event`.
function sourcesOf(row: TriggerRow, event: GameEvent, table: TableState): { instance: CardInstance | null; slot?: number }[] {
  const key = row.title.toLowerCase();
  const titled = (c: CardInstance) => titleKey(c) === key;
  switch (row.source) {
    case 'core':
      return table.core.filter(titled).map((instance) => ({ instance }));
    case 'hand':
      return table.hand.filter(titled).map((instance) => ({ instance }));
    case 'missionCard':
      return table.missions.flatMap((slot, i) => (slot.mission?.placedOn ?? []).filter(titled).map((instance) => ({ instance, slot: i })));
    case 'mission':
      return table.missions.flatMap((slot, i) => (slot.mission && titled(slot.mission) ? [{ instance: slot.mission, slot: i }] : []));
    case 'table':
      return table.missions.flatMap((slot, i) =>
        [...slot.awayTeam, ...slot.ships.flatMap((ship) => [ship, ...(ship.crew ?? [])])].filter(titled).map((instance) => ({ instance, slot: i }))
      );
    case 'self':
      return eventSubjects(event).flatMap((card) => {
        const instance = card.id ? findInstanceAnywhere(table, card.id)?.instance : undefined;
        return instance && titled(instance) ? [{ instance }] : [];
      });
    case 'botDeck':
      // The bot decides its own rows where it acts (Unexpected Difficulties: `botRedraws`, #1906), so they are never
      // the player's offers, and a game by hand has no bot deck.
      return [];
  }
}

// Whether the event passes the row's filter, read with the source card.
function eventPasses(row: TriggerRow, event: GameEvent, context: TriggerContext, sourceId: string | undefined): boolean {
  const filter = row.event;
  if (filter.self && !eventSubjects(event).some((c) => c.id !== undefined && c.id === sourceId)) return false;
  if (filter.byDilemma !== undefined && 'byDilemma' in event && event.byDilemma !== filter.byDilemma) return false;
  if (filter.mission) {
    const index = eventMissionIndex(event);
    if (index === undefined || !missions(context.view, { ...filter.mission, index }).length) return false;
  }
  return !filter.where || filter.where(event as never, context);
}

// Whether the card `id` used its attempt ability `ability` with a kill at the end of the turn (#1835) in the turn
// `turn`, in an entry before `index`.
const setUpBefore = (log: LogEntry[], index: number, id: string, ability: number, turn: number): boolean =>
  setUpIndex(log, index, id, ability, turn) >= 0;

const setUpIndex = (log: LogEntry[], index: number, id: string, ability: number, turn: number): number =>
  log
    .slice(0, index)
    .findIndex((e) => e.kind === 'attemptAbilityUsed' && e.id === id && e.ability === ability && e.killAtEndOfTurn === true && e.turn === turn);

// Whether a delayed row (#1835) is offered at `event` of the entry `index`: at the end of the turn the ability was used
// in (#1946); or, for a save from before #1946 whose turn ended with no discard segment after the use, at the start
// of the next turn.
function delayedOffered(log: LogEntry[], index: number, id: string, ability: number, event: GameEvent): boolean {
  if (event.kind === 'turnEnding') return setUpBefore(log, index, id, ability, event.turn);
  if (event.kind !== 'turnStarted') return false;
  const used = setUpIndex(log, index, id, ability, event.turn - 1);
  return used >= 0 && !log.slice(used + 1, index).some((e) => e.turn === event.turn - 1 && entrySegment(e) === 'discard');
}

// The rows that wait for `event`: a `turnStarted` also offers the delayed rows of an old save's turn (#1946).
const rowsAt = (event: GameEvent): readonly TriggerRow[] =>
  event.kind === 'turnStarted'
    ? [...triggerRowsFor('turnStarted'), ...triggerRowsFor('turnEnding').filter((r) => r.afterAbility !== undefined)]
    : triggerRowsFor(event.kind);

// The index of the entry that opened the discard segment of the table's turn (#1946), whose end-of-turn offers stand
// through that segment, or -1 while the table is in another segment.
function discardEntryOf(log: LogEntry[], table: TableState): number {
  if (table.segment !== 'discard') return -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].turn !== table.turn) return -1;
    if (entrySegment(log[i]) === 'discard' && (i === 0 || entrySegment(log[i - 1]) !== 'discard')) return i;
  }
  return -1;
}

/**
 * Whether a delayed kill (#1835) is set up this turn and its card still stands in its row's source place (#1946):
 * the next-turn button then goes from orders to the discard segment, where the kill is offered, whatever the hand.
 */
export function endOfTurnTriggerSetUp(state: { table: TableState; log: LogEntry[] }): boolean {
  const { table } = state;
  const event: GameEvent = { kind: 'turnEnding', turn: table.turn };
  return effectiveLog(state.log).some(
    (e) =>
      e.kind === 'attemptAbilityUsed' &&
      e.killAtEndOfTurn === true &&
      e.turn === table.turn &&
      triggerRowsOf(e.card).some((row) => row.afterAbility === e.ability && sourcesOf(row, event, table).some((s) => s.instance?.id === e.id))
  );
}

/** Whether two offers' addresses are the same offer. */
export const sameTriggerTarget = (a: TriggerTarget, b: TriggerTarget): boolean =>
  a.entry === b.entry && a.source === b.source && a.row === b.row && a.event === b.event;
const sameTarget = sameTriggerTarget;

/**
 * The trigger offers of the table (#1903): the rows whose event the last action entry of the effective log
 * produced (`gameEventsOf`), whose source card stands in its place, whose filter and condition hold, and which have
 * no `triggerUsed` or `triggerSkipped` record for that event and source (nor, for a row with a `limit`, as many uses of
 * that card's row this turn, #1834). Any other action ends the offers of the entry before it; a trigger taken or skipped,
 * and the steps and corrections addressed to the action, do not. The end-of-turn offers (`turnEnding`, #1946) of the
 * entry that opened the discard segment stand through that segment, after them, until the turn ends. The offers wait,
 * and list none, while an event resolves or a "when you play" effect or an order is pending (`effectSubjectOf`). In
 * the order of the events, then of the registry, then of the cards.
 */
export function pendingTriggersOf(state: { table: TableState; log: LogEntry[] }): TriggerOffer[] {
  const { table } = state;
  if (table.resolving || effectSubjectOf(state)) return [];
  const log = effectiveLog(state.log);
  const index = lastActionEntry(log);
  const discard = discardEntryOf(log, table);
  let view: TableView | null = null;
  const viewOf = () => (view ??= tableViewOf(table));
  const offers: TriggerOffer[] = [];
  const offersAt = (at: number, only?: GameEvent['kind']) => {
    const events = gameEventsOf(log[at], table, log[at - 1]);
    const records = log.slice(at + 1).flatMap((e) => (e.kind === 'triggerUsed' || e.kind === 'triggerSkipped' ? [e.target] : []));
    events.forEach((event, k) => {
      if (only && event.kind !== only) return;
      for (const row of rowsAt(event)) {
        // Select again and Dessert Disaster (#1905) are taken on the revealed dilemma's own buttons, never as chips.
        if (onRevealedCard(row)) continue;
        const rowIndex = triggerRowsOf(row.title).indexOf(row);
        for (const { instance, slot } of sourcesOf(row, event, table)) {
          const source = instance ? instance.id : 'botDeck';
          const target: TriggerTarget = { entry: at, source, row: rowIndex, event: k };
          if (records.some((r) => r && sameTarget(r, target))) continue;
          if (!abilityUsable(log, table.turn, { kind: 'trigger', id: source, index: rowIndex }, row.limit)) continue;
          const sourceCard: ViewCard | null = instance ? viewCardOf(instance) : null;
          const context: TriggerContext = { view: viewOf(), source: sourceCard, ...(slot !== undefined ? { sourceSlot: viewOf().missions[slot] } : {}) };
          if (!eventPasses(row, event, context, instance?.id)) continue;
          if (row.afterAbility !== undefined && !(instance && delayedOffered(log, at, instance.id, row.afterAbility, event))) continue;
          const missionIndex = eventMissionIndex(event);
          if (row.condition && !row.condition.holds(viewOf(), { ...(missionIndex !== undefined ? { missionIndex } : {}), ...(instance ? { id: instance.id } : {}) }))
            continue;
          offers.push({ target, row, event, source: instance, name: instance?.card ? cardDisplayName(instance.card) : row.title });
        }
      }
    });
  };
  if (discard >= 0 && discard !== index) offersAt(discard, 'turnEnding');
  if (index >= 0) offersAt(index);
  return offers;
}

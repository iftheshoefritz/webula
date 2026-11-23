// The trigger offers of the practice table (#1903, part 1 of #1867), derived from the effective log and never
// stored: no `TableState` field holds an offer, and a save needs no migration. Nothing shows them yet.

import { cardDisplayName } from '../../../lib/cardCount';
import { cardTitleOf } from '../../../lib/cardTitle';
import { UNEXPECTED_DIFFICULTIES } from '../../../lib/dilemmaBot/botPiles';
import { missions, type TableView, type ViewCard } from '../../../lib/tableView';
import { eventMissionIndex, eventSubjects, triggerRowsFor, triggerRowsOf } from '../../../lib/triggers';
import type { GameEvent, TriggerContext, TriggerRow } from '../../../lib/triggers';
import { gameEventsOf } from './gameEvents';
import { effectiveLog, effectSubjectOf, type LogEntry, type TriggerTarget } from './gameLog';
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
    case 'botDeck': {
      const pile = table.botPile;
      const holds = table.opponent === 'bot' && !!pile && key === UNEXPECTED_DIFFICULTIES.toLowerCase() && !!pile.unexpectedDifficulties;
      return holds ? [{ instance: null }] : [];
    }
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

const sameTarget = (a: TriggerTarget, b: TriggerTarget): boolean =>
  a.entry === b.entry && a.source === b.source && a.row === b.row && a.event === b.event;

/**
 * The trigger offers of the table (#1903): the rows whose event the last action entry of the effective log
 * produced (`gameEventsOf`), whose source card stands in its place, whose filter and condition hold, and which have
 * no `triggerUsed` or `triggerSkipped` record for that event and source (nor, for a once-each-turn row, a use of
 * that card's row this turn). Any other action ends the offers of the entry before it; a trigger taken or skipped,
 * and the steps and corrections addressed to the action, do not. The offers wait, and list none, while an event
 * resolves or a "when you play" effect or an order is pending (`effectSubjectOf`). In the order of the events, then
 * of the registry, then of the cards.
 */
export function pendingTriggersOf(state: { table: TableState; log: LogEntry[] }): TriggerOffer[] {
  const { table } = state;
  if (table.resolving || effectSubjectOf(state)) return [];
  const log = effectiveLog(state.log);
  const index = lastActionEntry(log);
  if (index < 0) return [];
  const events = gameEventsOf(log[index], table, log[index - 1]);
  if (!events.length) return [];
  const records = log.slice(index + 1).flatMap((e) => (e.kind === 'triggerUsed' || e.kind === 'triggerSkipped' ? [e.target] : []));
  const usedThisTurn = log.flatMap((e) => (e.kind === 'triggerUsed' && e.turn === table.turn ? [e.target] : []));
  let view: TableView | null = null;
  const viewOf = () => (view ??= tableViewOf(table));
  const offers: TriggerOffer[] = [];
  events.forEach((event, k) => {
    for (const row of triggerRowsFor(event.kind)) {
      const rowIndex = triggerRowsOf(row.title).indexOf(row);
      for (const { instance, slot } of sourcesOf(row, event, table)) {
        const source = instance ? instance.id : 'botDeck';
        const target: TriggerTarget = { entry: index, source, row: rowIndex, event: k };
        if (records.some((r) => r && sameTarget(r, target))) continue;
        if (row.once === 'turn' && usedThisTurn.some((r) => r && r.source === source && r.row === rowIndex)) continue;
        const sourceCard: ViewCard | null = instance ? viewCardOf(instance) : null;
        const context: TriggerContext = { view: viewOf(), source: sourceCard, ...(slot !== undefined ? { sourceSlot: viewOf().missions[slot] } : {}) };
        if (!eventPasses(row, event, context, instance?.id)) continue;
        const missionIndex = eventMissionIndex(event);
        if (row.condition && !row.condition.holds(viewOf(), { ...(missionIndex !== undefined ? { missionIndex } : {}), ...(instance ? { id: instance.id } : {}) }))
          continue;
        offers.push({ target, row, event, source: instance, name: instance?.card ? cardDisplayName(instance.card) : row.title });
      }
    }
  });
  return offers;
}

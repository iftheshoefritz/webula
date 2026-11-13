// The printed Range of a ship (#1634), its Range on the table as it stands and the span total of a
// move (#1635), and what its card shows of the range it used this turn (#1636). A module of its own,
// with no import of `tableReducer.ts`, so `MissionRow` reads it without loading the reducer and its
// `@dnd-kit/sortable` import.

import type { CardInstance, MissionSlot } from './tableReducer';
import { quadrantOf, rangeSpanModelOf } from './rangeModels';

// A card with no printed Range reads 0.
export const printedRange = (card: CardInstance | null | undefined): number => Number(card?.card?.range) || 0;

// The printed span of a mission card; a card with none reads 0.
export const printedSpan = (card: CardInstance | null | undefined): number => Number(card?.card?.span) || 0;

// What a move between two different quadrants adds to the span total (#1635).
export const QUADRANT_SPAN = 2;

// The span total of a move of `ship` from the mission of slot `fromIndex` to the mission of slot
// `toIndex` (#1635): the printed spans of the two missions, plus 2 when both slots hold a mission and
// their quadrants differ, unless a span model of either mission or of the ship waives it. An empty
// slot, or a mission with no quadrant, adds no 2.
export function moveSpanTotal(missions: MissionSlot[], fromIndex: number, toIndex: number, ship: CardInstance): number {
  const from = missions[fromIndex]?.mission ?? null;
  const to = missions[toIndex]?.mission ?? null;
  const spans = printedSpan(from) + printedSpan(to);
  if (!from || !to || !quadrantOf(from) || !quadrantOf(to) || quadrantOf(from) === quadrantOf(to)) return spans;
  const waived = [from, to, ship].some((self) => rangeSpanModelOf(self)?.waivesQuadrant?.(self, from, to));
  return waived ? spans : spans + QUADRANT_SPAN;
}

// A ship's Range on the table as it stands (#1635): its printed Range, plus the Range its own range
// model gives it, plus the Range of every event placed on a mission card whose range model applies
// to it.
export function shipRangeOnTable(missions: MissionSlot[], ship: CardInstance): number {
  let range = printedRange(ship) + (rangeSpanModelOf(ship)?.shipRange?.(ship, missions) ?? 0);
  for (const slot of missions) {
    if (!slot.mission) continue;
    for (const event of slot.mission.placedOn ?? []) {
      range += rangeSpanModelOf(event)?.eventRange?.(event, slot.mission, ship, missions) ?? 0;
    }
  }
  return range;
}

// The Range on the table of every ship with an entry in `rangeUsed`, by the ship's instance id: what
// `rangeUsedDisplay` reads.
export function shipRangesOnTable(missions: MissionSlot[], rangeUsed: Record<string, number> | undefined): Record<string, number> {
  const ranges: Record<string, number> = {};
  if (!rangeUsed) return ranges;
  for (const slot of missions) {
    for (const ship of slot.ships) {
      if (ship.id in rangeUsed) ranges[ship.id] = shipRangeOnTable(missions, ship);
    }
  }
  return ranges;
}

// What a ship's card shows of the range it used this turn (#1636): the range used of its Range,
// "4/8", and whether that is over the Range. The Range is the ship's Range on the table, from
// `ranges` (#1635), or its printed Range when `ranges` has none. A ship with no entry in `rangeUsed`
// shows none.
export function rangeUsedDisplay(
  ship: CardInstance,
  rangeUsed: Record<string, number> | undefined,
  ranges?: Record<string, number>
): { used: number; total: number; text: string; over: boolean } | null {
  const used = rangeUsed?.[ship.id];
  if (used === undefined) return null;
  const total = ranges?.[ship.id] ?? printedRange(ship);
  return { used, total, text: `${used}/${total}`, over: used > total };
}

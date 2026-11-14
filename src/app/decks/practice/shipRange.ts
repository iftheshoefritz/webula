// The printed Range of a ship (#1634), its Range on the table as it stands and the span total of a
// move (#1635), and what its card shows of the range it has left this turn (#1636). A module of its
// own, with no import of `tableReducer.ts`, so `MissionRow` reads it without loading the reducer and
// its `@dnd-kit/sortable` import.

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
// their quadrants differ, unless a span model of either mission, of the ship or of an event in the
// core waives it (#1648). An empty slot, or a mission with no quadrant, adds no 2. The span models of
// the core's events then take their reductions off the total, which never goes below 0.
export function moveSpanTotal(
  missions: MissionSlot[],
  fromIndex: number,
  toIndex: number,
  ship: CardInstance,
  core: CardInstance[] = []
): number {
  const from = missions[fromIndex]?.mission ?? null;
  const to = missions[toIndex]?.mission ?? null;
  let total = printedSpan(from) + printedSpan(to);
  if (from && to && quadrantOf(from) && quadrantOf(to) && quadrantOf(from) !== quadrantOf(to)) {
    const waived =
      [from, to, ship].some((self) => rangeSpanModelOf(self)?.waivesQuadrant?.(self, from, to)) ||
      core.some((self) => rangeSpanModelOf(self)?.coreWaivesQuadrant?.(self, from, to, ship));
    if (!waived) total += QUADRANT_SPAN;
  }
  if (!from || !to) return total;
  for (const self of core) total -= rangeSpanModelOf(self)?.coreSpanReduction?.(self, from, to, ship) ?? 0;
  return Math.max(0, total);
}

// A ship's Range on the table as it stands (#1635): its printed Range, plus the Range its own range
// model gives it, plus the Range of every event placed on a mission card whose range model applies
// to it, plus the Range of every personnel of its crew and every event placed on it whose range model
// applies (#1648). It never goes below 0.
export function shipRangeOnTable(missions: MissionSlot[], ship: CardInstance): number {
  let range = printedRange(ship) + (rangeSpanModelOf(ship)?.shipRange?.(ship, missions) ?? 0);
  for (const p of ship.crew ?? []) range += rangeSpanModelOf(p)?.aboardRange?.(p, ship, missions) ?? 0;
  for (const event of ship.placedOn ?? []) range += rangeSpanModelOf(event)?.placedOnShipRange?.(event, ship, missions) ?? 0;
  for (const slot of missions) {
    if (!slot.mission) continue;
    for (const event of slot.mission.placedOn ?? []) {
      range += rangeSpanModelOf(event)?.eventRange?.(event, slot.mission, ship, missions) ?? 0;
    }
  }
  return Math.max(0, range);
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

// What a ship's card shows of the range it used this turn (#1636): the range it has left of its
// Range, one number, `left`, which stops at 0: a ship past its Range reads 0, and only the game log
// says by how much it went over. The Range is `ranges[ship.id]`, the ship's Range on the table
// (#1635), when given, or else the printed Range. A ship with no entry in `rangeUsed`, one that has
// not moved this turn, gets null, and its card shows the printed Range.
export interface RangeLeft {
  used: number;
  total: number;
  left: number;
  text: string;
}

export function rangeUsedDisplay(
  ship: CardInstance,
  rangeUsed: Record<string, number> | undefined,
  ranges?: Record<string, number>
): RangeLeft | null {
  const used = rangeUsed?.[ship.id];
  if (used === undefined) return null;
  const total = ranges?.[ship.id] ?? printedRange(ship);
  const left = Math.max(0, total - used);
  return { used, total, left, text: String(left) };
}

// The accessible name of the range left, "Range 4 left of 8".
export const rangeLeftLabel = ({ left, total }: Pick<RangeLeft, 'left' | 'total'>): string =>
  `Range ${left} left of ${total}`;

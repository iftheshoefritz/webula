// The printed Range of a ship (#1634), its Range on the table as it stands and the span total of a
// move (#1635), and what its card shows of the range it has left this turn (#1636). A module of its
// own, with no import of `tableReducer.ts`, so `MissionRow` reads it without loading the reducer and
// its `@dnd-kit/sortable` import.

import { QUADRANT_SPAN as SPAN_BETWEEN_QUADRANTS, rangeOf, spanOf } from '../../../lib/modifiers';
import type { CardInstance, MissionSlot } from './tableReducer';
import type { RangeTable } from './rangeModels';
import { modifierCardOf, type TableRead, tableReadOf, viewCardOf } from './tableView';

// A card with no printed Range reads 0.
export const printedRange = (card: CardInstance | null | undefined): number => Number(card?.card?.range) || 0;

// The printed span of a mission card; a card with none reads 0.
export const printedSpan = (card: CardInstance | null | undefined): number => Number(card?.card?.span) || 0;

// What a move between two different quadrants adds to the span total (#1635).
export const QUADRANT_SPAN = SPAN_BETWEEN_QUADRANTS;

// The span total of a move of `ship` from the mission of slot `fromIndex` to the mission of slot
// `toIndex` (#1635): the printed spans of the two missions, plus 2 when both slots hold a mission and
// their quadrants differ, unless a modifier row of either mission, of the ship or of an event in the
// core waives it (#1648). An empty slot, or a mission with no quadrant, adds no 2. Two missions that share a
// "Region: X" keyword take 2 off (#1941, Rulebook v4, "Order – Move a Ship", p. 10). The rows of the
// core's events then take their reductions off the total, which never goes below 0, and last
// set the total a move requires (Shadows of the Night, #1827): `spanOf` of `src/lib/modifiers` (#1887). With
// `cardText` false, the setting "Apply card text to attributes" off (#1668), no row applies: the
// printed spans, the 2 between quadrants and the 2 of a shared Region, rules of the game.
export function moveSpanTotal(
  missions: MissionSlot[],
  fromIndex: number,
  toIndex: number,
  ship: CardInstance,
  core: CardInstance[] = [],
  cardText = true
): number {
  const from = missions[fromIndex]?.mission ?? null;
  const to = missions[toIndex]?.mission ?? null;
  return spanOf(from && viewCardOf(from), to && viewCardOf(to), modifierCardOf(ship), cardText ? core.map(viewCardOf) : [], cardText);
}

// A ship's Range on the table as it stands (#1635): its printed Range, plus the modifier rows of the ship
// itself, of every event placed on a mission card, of every personnel of its crew and every event placed on it
// (#1648), and for a ship on a ship row of every personnel the player commands that changes ships (#1671) and of
// every event in the core (Soliton Wave, #1827): `rangeOf` of `src/lib/modifiers` (#1887). It never goes below 0.
// With `cardText` false (#1668) it is the printed Range.
export function shipRangeOnTable(table: RangeTable, ship: CardInstance, cardText = true): number {
  return cardText ? shipRangeOf(tableReadOf(table), ship) : printedRange(ship);
}

// The Range of `ship` on the table that `read` holds (#1878): what `shipRangeOnTable` gives with the card text on,
// from a view built once, so an attribute row and `attributesOnTableOf` build none of their own.
export function shipRangeOf(read: TableRead, ship: CardInstance): number {
  return rangeOf(read.view, modifierCardOf(ship));
}

// The Range on the table of every ship with an entry in `rangeUsed`, by the ship's instance id: what
// `rangeUsedDisplay` reads.
export function shipRangesOnTable(
  table: RangeTable,
  rangeUsed: Record<string, number> | undefined,
  cardText = true
): Record<string, number> {
  const ranges: Record<string, number> = {};
  if (!rangeUsed) return ranges;
  let read: TableRead | undefined;
  for (const slot of table.missions) {
    for (const ship of slot.ships) {
      if (!(ship.id in rangeUsed)) continue;
      if (cardText) read ??= tableReadOf(table);
      ranges[ship.id] = read ? shipRangeOf(read, ship) : printedRange(ship);
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

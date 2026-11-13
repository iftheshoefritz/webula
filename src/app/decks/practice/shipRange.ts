// The printed Range of a ship (#1634), and what its card shows of the range it has left this turn
// (#1636). A module of its own, with no import of `tableReducer.ts`, so `MissionRow` reads it without
// loading the reducer and its `@dnd-kit/sortable` import.

import type { CardInstance } from './tableReducer';

// A card with no printed Range reads 0.
export const printedRange = (card: CardInstance | null | undefined): number => Number(card?.card?.range) || 0;

// What a ship's card shows of the range it used this turn (#1636): the range it has left of its
// Range, one number, `left`, which stops at 0: a ship past its Range reads 0, and only the game log
// says by how much it went over. The Range is
// `ranges[ship.id]` when given, or else the printed Range. A ship with no entry in `rangeUsed`, one
// that has not moved this turn, gets null, and its card shows the printed Range.
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

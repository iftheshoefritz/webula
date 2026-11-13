// The printed Range of a ship (#1634), and what its card shows of the range it used this turn
// (#1636). A module of its own, with no import of `tableReducer.ts`, so `MissionRow` reads it without
// loading the reducer and its `@dnd-kit/sortable` import.

import type { CardInstance } from './tableReducer';

// A card with no printed Range reads 0.
export const printedRange = (card: CardInstance | null | undefined): number => Number(card?.card?.range) || 0;

// What a ship's card shows of the range it used this turn (#1636): the range used of its printed
// Range, "4/8", and whether that is over the Range. A ship with no entry in `rangeUsed` shows none.
export function rangeUsedDisplay(
  ship: CardInstance,
  rangeUsed: Record<string, number> | undefined
): { used: number; total: number; text: string; over: boolean } | null {
  const used = rangeUsed?.[ship.id];
  if (used === undefined) return null;
  const total = printedRange(ship);
  return { used, total, text: `${used}/${total}`, over: used > total };
}

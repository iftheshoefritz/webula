'use client';

// Shares `TableState.rangeUsed` (#1634) with every ship card (#1636), so each one can show the range
// it used this turn without a prop threaded through `MissionRow` -> `MissionColumn` -> `ShipRow`
// and `AttemptLayout` -> `ShipRow`. `PracticeTable` provides it from the table.

import { createContext, useContext } from 'react';

const RangeUsedContext = createContext<Record<string, number> | undefined>(undefined);

export const RangeUsedProvider = RangeUsedContext.Provider;

export function useRangeUsed(): Record<string, number> | undefined {
  return useContext(RangeUsedContext);
}

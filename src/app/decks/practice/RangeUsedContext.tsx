'use client';

// Shares `TableState.rangeUsed` (#1634) with every ship card (#1636), so each one can show the range
// it used this turn without a prop threaded through `MissionRow` -> `MissionColumn` -> `ShipRow`
// and `AttemptLayout` -> `ShipRow`. `PracticeTable` provides it from the table, with the Range on
// the table of each of those ships (#1635, `shipRangesOnTable`).

import { createContext, useContext } from 'react';

export interface RangeUsedInfo {
  used?: Record<string, number>;
  ranges?: Record<string, number>;
}

const RangeUsedContext = createContext<RangeUsedInfo>({});

export const RangeUsedProvider = RangeUsedContext.Provider;

export function useRangeUsed(): RangeUsedInfo {
  return useContext(RangeUsedContext);
}

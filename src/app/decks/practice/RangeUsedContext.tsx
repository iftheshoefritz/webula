'use client';

// Shares `TableState.rangeUsed` (#1634) with every ship card (#1636), so each one can show the range
// it used this turn without a prop threaded through `MissionRow` -> `MissionColumn` -> `ShipRow`
// and `AttemptLayout` -> `ShipRow`. `PracticeTable` provides it from the table, with the Range on
// the table of each of those ships (#1635, `shipRangesOnTable`). It also carries the attributes on
// the table of every personnel and ship whose values differ from the printed ones (#1666,
// `attributesOnTableOf`), by instance id, for the arrows of the bands.

import { createContext, useContext } from 'react';
import type { AttributesOnTable } from './attributesOnTable';

export interface RangeUsedInfo {
  used?: Record<string, number>;
  ranges?: Record<string, number>;
  attributes?: Record<string, AttributesOnTable>;
}

const RangeUsedContext = createContext<RangeUsedInfo>({});

export const RangeUsedProvider = RangeUsedContext.Provider;

export function useRangeUsed(): RangeUsedInfo {
  return useContext(RangeUsedContext);
}

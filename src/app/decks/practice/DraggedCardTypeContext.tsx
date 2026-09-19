'use client';

// Shares the dragged card's type (or `null` when nothing is dragging) with every drop zone
// component, so each one can look up its own highlight in `zoneAccepts.ts` (#608) without a
// prop threaded through every intermediate component (`MissionRow` -> `MissionColumn` ->
// `ShipRow`/`ShipCard`/`PileBadge`, `FlatCardRow`, `DiscardPile`, `DilemmaPileButton` ->
// `DilemmaPileHalf`). `page.tsx` provides the value from its own `draggingInstance` state, which
// already tracks the dragged card for the drag overlay; no new state is needed.

import { createContext, useContext } from 'react';

const DraggedCardTypeContext = createContext<string | null>(null);

export const DraggedCardTypeProvider = DraggedCardTypeContext.Provider;

export function useDraggedCardType(): string | null {
  return useContext(DraggedCardTypeContext);
}

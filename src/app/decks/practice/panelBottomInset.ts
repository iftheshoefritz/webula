import { useEffect, useState } from 'react';
import { VIEWER_TOP_INSET } from './viewerCardSize';

// Issue #828: a card list panel anchors its bottom edge just above the bottom row, not at the
// bottom of the screen, so it grows upward and leaves no empty band between the missions and the
// bottom row. The bottom row's zones keep fixed pixel sizes while the table above them grows, but
// its height still depends on its content (the counters above the discard pile, the core and brig
// rows), so it is measured, not hard-coded.

// The gap between the panel's bottom edge and the top of the bottom row.
export const PANEL_BOTTOM_ROW_GAP = VIEWER_TOP_INSET;

// The panel area's bottom inset: the distance from the bottom of the game layer to the top of the
// bottom row, plus the gap. Never less than `VIEWER_TOP_INSET`, the old symmetric inset.
export function panelBottomInset(gameLayerBottom: number, bottomRowTop: number): number {
  return Math.max(VIEWER_TOP_INSET, Math.round(gameLayerBottom - bottomRowTop + PANEL_BOTTOM_ROW_GAP));
}

// Measures the bottom row against the game layer with a `ResizeObserver`, the same pattern
// `useTableScale` uses. It observes the game layer, the row, and the row's siblings: the row's top
// also moves when the table above it shrinks, and that happens a render after the game layer
// resizes, once `useTableScale` has set the new scale. On a shrink the first measure sees the row
// still pushed down by the old, larger table, and neither the game layer nor the row resizes
// again (#876). Before both are mounted, and in jsdom, which has no layout, it returns
// `VIEWER_TOP_INSET`.
export function usePanelBottomInset(gameLayer: HTMLElement | null, bottomRow: HTMLElement | null): number {
  const [inset, setInset] = useState(VIEWER_TOP_INSET);

  useEffect(() => {
    if (!gameLayer || !bottomRow) return;
    const measure = () =>
      setInset(panelBottomInset(gameLayer.getBoundingClientRect().bottom, bottomRow.getBoundingClientRect().top));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gameLayer);
    observer.observe(bottomRow);
    for (const sibling of Array.from(bottomRow.parentElement?.children ?? [])) {
      if (sibling !== bottomRow) observer.observe(sibling);
    }
    return () => observer.disconnect();
  }, [gameLayer, bottomRow]);

  return inset;
}

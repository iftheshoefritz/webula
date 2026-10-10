import { useEffect, useState } from 'react';
import { SMALL_CARD_WIDTH } from './TableCard';

// Issue #1029: the core and the brig grow to make room for each new card, up to the free space the
// bottom row has, measured at runtime. Past that space their cards overlap more (`offsetFor`). The
// two zones sit in one flexible box between the hand and the dilemma pile, and that box's width is
// the space they share.

// The cards of the core and the brig sit edge to edge with a small gap, matching the ship row.
export const FLAT_ROW_MAX_OFFSET = SMALL_CARD_WIDTH + 2;
// The gap between the core and the brig, Tailwind's `gap-2`.
export const FLAT_ROW_GAP = 8;
// The size of the empty zone, and the least width a row keeps during a drag (`FlatCardRow`).
const FLAT_ROW_MIN_WIDTH = 56;

// The bounds of #927 and #928, which fit the 568 px acceptance viewport. They stand in until the
// space is measured: on the first render, and in jsdom, which has no layout.
export const UNMEASURED_FLAT_ROW_WIDTHS = { core: 109, brig: 60 } as const;

// The width a row of `count` cards takes with no overlap past the usual gap.
function naturalWidth(count: number): number {
  return Math.max(FLAT_ROW_MIN_WIDTH, SMALL_CARD_WIDTH + FLAT_ROW_MAX_OFFSET * (count - 1));
}

// The widest each zone may grow, given the width of the box they share. When both fit side by side
// with no extra overlap, each gets the room the other leaves. When they do not fit, they split the
// space in proportion to the width each would like, and each never falls below one card.
export function flatRowWidths(available: number, coreCount: number, brigCount: number): { core: number; brig: number } {
  if (available <= 0) return UNMEASURED_FLAT_ROW_WIDTHS;
  const budget = available - FLAT_ROW_GAP;
  const core = naturalWidth(coreCount);
  const brig = naturalWidth(brigCount);
  if (core + brig <= budget) return { core: budget - brig, brig: budget - core };
  const coreShare = Math.max(SMALL_CARD_WIDTH, Math.floor((budget * core) / (core + brig)));
  return { core: coreShare, brig: Math.max(SMALL_CARD_WIDTH, budget - coreShare) };
}

// The width of the box the core and the brig share, with a `ResizeObserver`, the same pattern
// `usePanelBottomInset` uses. 0 until it is measured.
export function useElementWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return width;
}

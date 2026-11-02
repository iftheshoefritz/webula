import { useEffect, useState } from 'react';
import { TABLE_CARD_ART_HEIGHT, TABLE_CARD_WIDTH } from './TableCard';

// Issue #1029: the core and the brig grow to make room for each new card, up to the free space the
// bottom row has, measured at runtime. Past that space their cards overlap more (`offsetFor`). The
// two zones sit in one flexible box between the draw deck and the dilemma pile (the closed hands, small
// fans on top of it since #1489, take none of it), and that box's width is
// the space they share. Their dashed outlines always fill that box between them (#1425).

// The size of the card of the draw deck, the dilemma pile, the discard pile and the closed hand at
// scale 1 (`PracticeTable.tsx`, `CardHand.tsx`).
export const PILE_CARD_WIDTH = 56;
export const PILE_CARD_HEIGHT = 80;
// Issue #1465: on a large screen every card of the bottom row grows by one bottom-row scale,
// `computeBottomRowScale` (`tableScale.ts`), from 1 up to `BOTTOM_ROW_SCALE_CAP`. Every size below
// is a function of it, and its constant is the size at 1.
export const pileCardSize = (rowScale = 1): { width: number; height: number } => ({
  width: Math.round(PILE_CARD_WIDTH * rowScale),
  height: Math.round(PILE_CARD_HEIGHT * rowScale),
});
// Each card of the core and the brig is the art crop of a table card, as in the other panels, and as
// tall as the card of the draw deck beside it (#1234). Its width follows from the crop's ratio.
export const flatCardHeight = (rowScale = 1): number => pileCardSize(rowScale).height;
export const flatCardWidth = (rowScale = 1): number =>
  Math.round((flatCardHeight(rowScale) * TABLE_CARD_WIDTH) / TABLE_CARD_ART_HEIGHT);
export const FLAT_CARD_HEIGHT = flatCardHeight();
export const FLAT_CARD_WIDTH = flatCardWidth();

// The cards of the core and the brig sit edge to edge with a small gap, matching the ship row.
export const flatRowMaxOffset = (rowScale = 1): number => flatCardWidth(rowScale) + 2;
export const FLAT_ROW_MAX_OFFSET = flatRowMaxOffset();
// The gap between the core and the brig, Tailwind's `gap-2`.
export const FLAT_ROW_GAP = 8;
// The least width a zone takes, with or without cards.
const FLAT_ROW_MIN_WIDTH = PILE_CARD_WIDTH;

// One card of each zone, and a little of a second for the core. They stand in until the space is
// measured: on the first render, and in jsdom, which has no layout.
export const unmeasuredFlatRowWidths = (rowScale = 1): { core: number; brig: number } => ({
  core: flatCardWidth(rowScale) + Math.round(20 * rowScale),
  brig: flatCardWidth(rowScale),
});
export const UNMEASURED_FLAT_ROW_WIDTHS = unmeasuredFlatRowWidths();

// The width a row of `count` cards takes with no overlap past the usual gap.
function naturalWidth(count: number, rowScale: number): number {
  return Math.max(
    Math.round(FLAT_ROW_MIN_WIDTH * rowScale),
    flatCardWidth(rowScale) + flatRowMaxOffset(rowScale) * (count - 1),
  );
}

// The width of each zone, given the width of the box they share: the two zones and the gap between
// them fill the box (#1425), so their outlines span it from the hand to the dilemma pile. When both
// fit side by side with no extra overlap, they share the slack in proportion to the width each would
// like, so two empty zones split it evenly. When they do not fit, they split the space in the same
// proportion, and each never falls below one card, so a very small box can overflow.
export function flatRowWidths(
  available: number,
  coreCount: number,
  brigCount: number,
  rowScale = 1,
): { core: number; brig: number } {
  if (available <= 0) return unmeasuredFlatRowWidths(rowScale);
  const budget = available - FLAT_ROW_GAP;
  const core = naturalWidth(coreCount, rowScale);
  const brig = naturalWidth(brigCount, rowScale);
  if (core + brig <= budget) {
    const coreShare = core + Math.floor(((budget - core - brig) * core) / (core + brig));
    return { core: coreShare, brig: budget - coreShare };
  }
  const cardWidth = flatCardWidth(rowScale);
  const coreShare = Math.max(cardWidth, Math.floor((budget * core) / (core + brig)));
  return { core: coreShare, brig: Math.max(cardWidth, budget - coreShare) };
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

// The height of an element, with the same `ResizeObserver` pattern. 0 until it is measured.
export function useElementHeight(el: HTMLElement | null): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return height;
}

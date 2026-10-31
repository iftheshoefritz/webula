import { useEffect, useState } from 'react';
import { TABLE_CARD_ART_HEIGHT, TABLE_CARD_WIDTH } from './TableCard';

// Issue #1029: the core and the brig grow to make room for each new card, up to the free space the
// bottom row has, measured at runtime. Past that space their cards overlap more (`offsetFor`). The
// two zones sit in one flexible box between the hand and the dilemma pile, and that box's width is
// the space they share. Their dashed outlines always fill that box between them (#1425).

// The height of the card of the draw deck and the dilemma pile, their `h-20` (`PracticeTable.tsx`).
export const PILE_CARD_HEIGHT = 80;
// Each card of the core and the brig is the art crop of a table card, as in the other panels, and as
// tall as the card of the draw deck beside it (#1234). Its width follows from the crop's ratio.
export const FLAT_CARD_HEIGHT = PILE_CARD_HEIGHT;
export const FLAT_CARD_WIDTH = Math.round((FLAT_CARD_HEIGHT * TABLE_CARD_WIDTH) / TABLE_CARD_ART_HEIGHT);

// The cards of the core and the brig sit edge to edge with a small gap, matching the ship row.
export const FLAT_ROW_MAX_OFFSET = FLAT_CARD_WIDTH + 2;
// The gap between the core and the brig, Tailwind's `gap-2`.
export const FLAT_ROW_GAP = 8;
// The least width a zone takes, with or without cards.
const FLAT_ROW_MIN_WIDTH = 56;

// One card of each zone, and a little of a second for the core. They stand in until the space is
// measured: on the first render, and in jsdom, which has no layout.
export const UNMEASURED_FLAT_ROW_WIDTHS = { core: FLAT_CARD_WIDTH + 20, brig: FLAT_CARD_WIDTH } as const;

// The width a row of `count` cards takes with no overlap past the usual gap.
function naturalWidth(count: number): number {
  return Math.max(FLAT_ROW_MIN_WIDTH, FLAT_CARD_WIDTH + FLAT_ROW_MAX_OFFSET * (count - 1));
}

// The width of each zone, given the width of the box they share: the two zones and the gap between
// them fill the box (#1425), so their outlines span it from the hand to the dilemma pile. When both
// fit side by side with no extra overlap, they share the slack in proportion to the width each would
// like, so two empty zones split it evenly. When they do not fit, they split the space in the same
// proportion, and each never falls below one card, so a very small box can overflow.
export function flatRowWidths(available: number, coreCount: number, brigCount: number): { core: number; brig: number } {
  if (available <= 0) return UNMEASURED_FLAT_ROW_WIDTHS;
  const budget = available - FLAT_ROW_GAP;
  const core = naturalWidth(coreCount);
  const brig = naturalWidth(brigCount);
  if (core + brig <= budget) {
    const coreShare = core + Math.floor(((budget - core - brig) * core) / (core + brig));
    return { core: coreShare, brig: budget - coreShare };
  }
  const coreShare = Math.max(FLAT_CARD_WIDTH, Math.floor((budget * core) / (core + brig)));
  return { core: coreShare, brig: Math.max(FLAT_CARD_WIDTH, budget - coreShare) };
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

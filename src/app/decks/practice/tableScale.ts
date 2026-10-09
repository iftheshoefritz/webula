'use client';

// Issue #717: when the player scrolls up on this page, the browser's own toolbar hides and the
// game layer (`page.tsx`'s `gameLayer` ref, `fixed inset-0`) grows to fill the extra visible
// height. Before this issue, only the enlarged card preview (`CardPreview.tsx`) used that extra
// room; the mission cards, the ship cards, the under-mission pile stack, and every card-list-panel
// card grid stayed at a fixed pixel size, leaving the freed-up space blank.
//
// `useTableScale` turns the game layer's own live size into a single number, 1 at the baseline
// size those fixed pixel constants were tuned against, and larger once there's more room than
// that. Every constant this issue grows (`TableCard.tsx`'s `TABLE_CARD_WIDTH`/
// `TABLE_CARD_ART_HEIGHT`, `MissionRow.tsx`'s ship-row sizes, `CardListPanel.tsx`'s card grid) is
// multiplied by this same scale, so they all grow in proportion to each other. The viewers (a pile
// panel and the open fan) draw their cards at `VIEWER_CARD_SCALE` times that (#802, `viewerCardSize.ts`).
//
// A `ResizeObserver` on the game layer, the same pattern `CardSearchClient.tsx` already uses for
// a live element size, catches a toolbar hide/show; neither a `matchMedia` query nor a one-off
// `window.innerHeight` read fires for that.

import { useEffect, useState } from 'react';
import { MISSION_SLOTS } from './tableReducer';
import { TABLE_CARD_WIDTH, fullCardHeight } from './TableCard';

// The 568x320 viewport the fixed pixel card sizes below were tuned against (see
// `MissionRow.tsx`'s `BADGE_STRIP_HEIGHT_BASE` comment) — scale 1 at this height, larger once the
// game layer measures taller than it.
const BASELINE_HEIGHT = 320; // px

// The space around the five mission columns that stays fixed regardless of scale: `page.tsx`'s
// own `p-4` padding on both sides of the game layer's content (32px), and `MissionRow.tsx`'s own
// `gap-2` between the five columns (8px, four gaps).
const CONTENT_PADDING = 32; // px, both sides combined
const MISSION_ROW_GAP = 8; // px

// Pure function, so the scale math can be tested with plain numbers rather than a real
// `ResizeObserver` (jsdom has none; `jest.setup.ts` stubs it out as a no-op).
//
// The scale is bounded by height (how much taller than the baseline the game layer measures) and
// by width (the five mission columns, at that scale, must still fit the available width) — the
// smaller of the two wins, since the freed-up space this issue targets is vertical, not
// horizontal: a wide-but-short viewport must not grow past what its width allows just because
// its height ratio alone would allow more. The result never drops below 1: a shorter-than-
// baseline game layer (the toolbar showing) keeps today's fixed sizes rather than shrinking them
// further.
// Issue #630: the dilemma stack sits in a reserved column to the right of the five mission
// columns, so the width budget reserves one more column and one more gap for it — 6 columns and
// 5 gaps, not 5 and 4.
export function computeTableScale(gameLayerWidth: number, gameLayerHeight: number): number {
  const heightScale = gameLayerHeight / BASELINE_HEIGHT;
  const availableWidth = gameLayerWidth - CONTENT_PADDING - MISSION_ROW_GAP * MISSION_SLOTS;
  const widthScale = availableWidth / (TABLE_CARD_WIDTH * (MISSION_SLOTS + 1));
  return Math.max(1, Math.min(heightScale, widthScale));
}

export function useTableScale(gameLayer: HTMLElement | null): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!gameLayer) return;
    const measure = () => setScale(computeTableScale(gameLayer.clientWidth, gameLayer.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gameLayer);
    return () => observer.disconnect();
  }, [gameLayer]);

  return scale;
}

// Issue #930: a mission's ship row packs every ship into one row, and a third ship overlaps the
// others (#713). When the table has spare height, the ship row takes a second row of ships, and a
// third, instead of overlapping more. The spare height is the gap the player sees between the
// mission rows and the bottom row once the browser's toolbar hides: `useShipRowCount` measures it,
// rather than deriving it from the table scale.
//
// One more row costs one ship card's art height (`MissionRow.tsx`'s scaled
// `SMALL_CARD_ART_HEIGHT`) plus the gap between two rows, so the count is 1 plus as many of those
// as fit the free height, capped at `MAX_SHIP_ROWS`. Pure, the same as `computeTableScale`, so
// plain numbers can test it. A negative free height (the table already overflows) keeps 1 row.
export const MAX_SHIP_ROWS = 3;

export function computeShipRowCount(freeHeight: number, rowHeight: number, rowGap: number): number {
  const extraRows = Math.floor(freeHeight / (rowHeight + rowGap));
  return Math.max(1, Math.min(MAX_SHIP_ROWS, 1 + extraRows));
}

// Measures the free height, from the bottom of the mission rows to the top of the bottom row, with
// a `ResizeObserver`, the same pattern `usePanelBottomInset` (`panelBottomInset.ts`) uses. The
// extra rows the tallest ship row already shows (its `maxShips` at `perRow` a row) take up part of
// that gap, so their height is added back: the free height is the gap a single row would leave,
// and the count does not flip back and forth as the rows it grants fill the gap. Before both
// elements are mounted, and in jsdom, which has no layout, it returns 1.
export function useShipRowCount(
  missionRows: HTMLElement | null,
  bottomRow: HTMLElement | null,
  rowHeight: number,
  rowGap: number,
  maxShips: number,
  perRow: number,
): number {
  const [rows, setRows] = useState(1);
  const usedRows = Math.max(1, Math.min(rows, Math.ceil(maxShips / perRow)));

  useEffect(() => {
    if (!missionRows || !bottomRow) return;
    const measure = () => {
      const gap = bottomRow.getBoundingClientRect().top - missionRows.getBoundingClientRect().bottom;
      const freeHeight = gap + (usedRows - 1) * (rowHeight + rowGap);
      setRows(computeShipRowCount(freeHeight, rowHeight, rowGap));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(missionRows);
    observer.observe(bottomRow);
    if (missionRows.parentElement) observer.observe(missionRows.parentElement);
    return () => observer.disconnect();
  }, [missionRows, bottomRow, rowHeight, rowGap, usedRows]);

  return rows;
}

// Issue #992: on a desktop (`useFinePointer`, #946) the mission and ship cards show the whole card
// (`MissionRow.tsx`), and when the table has a large gap above the bottom row they grow past the
// table scale too. `computeDesktopTableScale` returns the scale `MissionRow` draws at: the largest
// one at which a mission column with `DESKTOP_RESERVED_SHIP_ROWS` rows of ships fits the height
// above the bottom row, and at which the five mission columns and the desktop dilemma stack fit the
// width. It is never below 1. The ship rows past the reserved ones still come from
// `useShipRowCount`, which measures the gap that is left.
//
// The dilemma stack on a desktop (#988) is a fixed width that does not grow with the scale, so it
// is set here, and `page.tsx` reads it from here.
export const DILEMMA_STACK_CARD_WIDTH = 56; // px, the zone's own width on a touch screen
export const DILEMMA_STACK_DESKTOP_WIDTH_FACTOR = 2;
export const DESKTOP_RESERVED_SHIP_ROWS = 2;

// Issue #1060: a completed mission turns 90°, and on a desktop the turned card is as wide as the
// whole card is tall. Every desktop mission slot reserves that width, `fullCardHeight` of the card
// width, all the time, so completing a mission moves nothing. The width budget divides by the
// wider slot, not by `TABLE_CARD_WIDTH`, so a width-bound desktop draws its missions smaller than a
// slot of the card's own width would. A desktop too narrow for the wider slots at scale 1 gets the
// slot width that fits, `desktopMissionSlotBudget`, down to the card width (`missionSlotWidth`,
// `MissionRow.tsx`), and the turned card shrinks to fit it.
export function desktopMissionSlotBudget(gameLayerWidth: number): number {
  const dilemmaStackWidth = DILEMMA_STACK_CARD_WIDTH * DILEMMA_STACK_DESKTOP_WIDTH_FACTOR;
  const availableWidth = gameLayerWidth - CONTENT_PADDING - MISSION_ROW_GAP * MISSION_SLOTS - dilemmaStackWidth;
  return availableWidth / MISSION_SLOTS;
}

export function computeDesktopTableScale(
  gameLayerWidth: number,
  availableHeight: number,
  columnHeight: (scale: number) => number,
): number {
  const widthScale = desktopMissionSlotBudget(gameLayerWidth) / fullCardHeight(TABLE_CARD_WIDTH);
  if (widthScale <= 1 || columnHeight(1) >= availableHeight) return 1;
  // The column height only grows with the scale, so a bisection finds the largest scale that fits.
  let low = 1;
  let high = widthScale;
  if (columnHeight(high) <= availableHeight) return high;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (columnHeight(mid) <= availableHeight) low = mid;
    else high = mid;
  }
  return low;
}

// Measures the height above the bottom row, from the top of the mission rows to the top of the
// bottom row, the same elements `useShipRowCount` measures. It reads the bottom row's own height
// rather than its top, so a mission row taller than the table does not push the bottom row down
// and feed back into the measure. Returns `scale` off a desktop, and before the elements mount.
export function useDesktopTableScale(
  desktop: boolean,
  scale: number,
  gameLayer: HTMLElement | null,
  missionRows: HTMLElement | null,
  bottomRow: HTMLElement | null,
  columnHeight: (scale: number) => number,
): number {
  const [desktopScale, setDesktopScale] = useState<number | null>(null);

  useEffect(() => {
    if (!desktop || !gameLayer || !missionRows || !bottomRow) {
      setDesktopScale(null);
      return;
    }
    const measure = () => {
      const content = missionRows.parentElement ?? gameLayer;
      const paddingBottom = parseFloat(getComputedStyle(content).paddingBottom) || 0;
      const availableHeight =
        gameLayer.getBoundingClientRect().bottom -
        paddingBottom -
        bottomRow.getBoundingClientRect().height -
        missionRows.getBoundingClientRect().top;
      setDesktopScale(computeDesktopTableScale(gameLayer.clientWidth, availableHeight, columnHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gameLayer);
    observer.observe(bottomRow);
    return () => observer.disconnect();
  }, [desktop, gameLayer, missionRows, bottomRow, columnHeight]);

  return desktop && desktopScale !== null ? desktopScale : scale;
}

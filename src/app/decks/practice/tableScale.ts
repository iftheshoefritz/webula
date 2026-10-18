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
import {
  MISSION_COLUMN_GAP,
  SHIP_ROW_GAP,
  badgeStripHeight,
  missionCardHeight,
  shipCardWidth,
  shipRowLineHeight,
  shipRowWidth,
  shipsPerRow,
  underMissionStackRoom,
} from './MissionRow';

// The 568x320 viewport the fixed pixel card sizes below were tuned against (see
// `MissionRow.tsx`'s `BADGE_STRIP_HEIGHT_BASE` comment) — scale 1 at this height, larger once the
// game layer measures taller than it.
const BASELINE_HEIGHT = 320; // px

// The smallest screen the practice table supports: an iPhone SE (2nd generation) in landscape.
// It was the first-generation iPhone SE, 568x320, the baseline above, until the cards needed
// more room. The baseline stays at 320 px so every card keeps its size: at the minimum screen the
// table draws at a scale of about 1.17, and a size that must fit the minimum screen is checked at
// that scale, not at 1.
export const MIN_SCREEN = { width: 667, height: 375 } as const; // CSS px

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
// above the bottom row, and at which the five mission columns fit the width. The dilemma stack
// lives only in the attempt layout (#1170), so the mission row gives it no width. It is never below 1. The ship rows past the reserved ones still come from
// `useShipRowCount`, which measures the gap that is left.
//
// The dilemma stack on a desktop (#988) is a fixed width that does not grow with the scale, so it
// is set here, and `computeAttemptLayout` and `DilemmaStackPile` read it from here.
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
// The row has a gap between each two of the five slots, and none after the last.
export function desktopMissionSlotBudget(gameLayerWidth: number): number {
  const availableWidth = gameLayerWidth - CONTENT_PADDING - MISSION_ROW_GAP * (MISSION_SLOTS - 1);
  return availableWidth / MISSION_SLOTS;
}

export function computeDesktopTableScale(
  gameLayerWidth: number,
  availableHeight: number,
  columnHeight: (scale: number) => number,
): number {
  const widthScale = desktopMissionSlotBudget(gameLayerWidth) / fullCardHeight(TABLE_CARD_WIDTH);
  return fitColumnScale(widthScale, availableHeight, columnHeight);
}

// The touch layout grows its missions and ships the same way, now that the minimum screen,
// 667x375, leaves a gap above the bottom row at the table scale (`MIN_SCREEN`). A touch mission
// slot is the card's own width, the art crop, so the width budget is five card widths and the four
// gaps between them (#1170). The result never drops below the table
// scale: the gap only ever makes the missions and the ships larger than the rest of the table.
export const TOUCH_RESERVED_SHIP_ROWS = 2;
// The game menu and fullscreen buttons sit in the top left corner, over the table (`left-2`, 24 px
// wide, so they end 32 px in). The mission row is centred, so a row that keeps its left edge 4 px
// clear of them leaves this much more than the content padding free on each side.
const MENU_BUTTON_GUTTER = 20; // px, each side

export function computeTouchMissionScale(
  gameLayerWidth: number,
  availableHeight: number,
  columnHeight: (scale: number) => number,
  tableScale: number,
): number {
  const availableWidth =
    gameLayerWidth -
    CONTENT_PADDING -
    2 * MENU_BUTTON_GUTTER -
    MISSION_ROW_GAP * (MISSION_SLOTS - 1);
  const widthScale = availableWidth / MISSION_SLOTS / TABLE_CARD_WIDTH;
  return Math.max(tableScale, fitColumnScale(widthScale, availableHeight, columnHeight));
}

// The largest scale, up to `widthScale`, at which `columnHeight` fits `availableHeight`, and never
// below 1.
export function fitColumnScale(
  widthScale: number,
  availableHeight: number,
  columnHeight: (scale: number) => number,
): number {
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
// and feed back into the measure. Returns the scale the missions and the ships draw at: the desktop
// scale (#992) on a desktop, the touch mission scale on a touch screen, and `scale` before the
// elements mount.
export function useMissionScale(
  desktop: boolean,
  scale: number,
  gameLayer: HTMLElement | null,
  missionRows: HTMLElement | null,
  bottomRow: HTMLElement | null,
  desktopColumnHeight: (scale: number) => number,
  touchColumnHeight: (scale: number) => number,
): number {
  const [missionScale, setMissionScale] = useState<number | null>(null);

  useEffect(() => {
    if (!gameLayer || !missionRows || !bottomRow) {
      setMissionScale(null);
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
      setMissionScale(
        desktop
          ? computeDesktopTableScale(gameLayer.clientWidth, availableHeight, desktopColumnHeight)
          : computeTouchMissionScale(gameLayer.clientWidth, availableHeight, touchColumnHeight, scale),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gameLayer);
    observer.observe(bottomRow);
    return () => observer.disconnect();
  }, [desktop, scale, gameLayer, missionRows, bottomRow, desktopColumnHeight, touchColumnHeight]);

  return missionScale ?? scale;
}

// Issue #1164: the attempt layout. While an attempt is in progress the table shows, in place of the
// mission row, a strip across the top and, below it, the attempted mission, the ships and the away
// team at it, and the dilemma stack, left to right, above the bottom row.
//
// The strip is as tall as the game menu and fullscreen buttons reach below the content padding
// (`top-2`, two 24 px buttons and a 4 px gap, so they end 60 px down, 44 px below the 16 px padding),
// so the body below it is clear of them, and its contents start right of `MENU_BUTTON_GUTTER`.
export const ATTEMPT_STRIP_HEIGHT = 44; // px
export const ATTEMPT_STRIP_GUTTER = MENU_BUTTON_GUTTER;
// The gap between the strip and the body, and between the body's three columns (Tailwind's `gap-2`).
export const ATTEMPT_GAP = 8; // px

export interface AttemptLayoutSizes {
  // The scale of the mission card, drawn whole, and of its badge strip.
  missionScale: number;
  // The scale of the ships, and the rows they fill.
  shipScale: number;
  shipRows: number;
  // The width of the middle column: the away team badge or row, and the ships. At a space mission it
  // is the ships column, the gap and the crew row, and no wider (#1177).
  shipsWidth: number;
  // The width of the ship rows: the whole middle column, or, at a space mission, a column as wide as
  // the mission, with the crew row beside it (#1165, #1177).
  shipRowsWidth: number;
  // The row of the attempting personnel (#1165): the width of one whole card, the rows it fills
  // (1 or 2), and the width it may take.
  personnelCardWidth: number;
  personnelRows: number;
  personnelWidth: number;
}

// Issue #1165: the attempting personnel show as a row of whole cards, the away team at a planet
// mission in place of the away team badge, and the crew of the attempting ship beside the ships at
// a space mission. The cards overlap, as the core's and the brig's do, but each shows at least this
// much past the next one, so it stays visible and tappable; below that the row wraps to 2 rows,
// when the height has room for them.
export const ATTEMPT_PERSONNEL_MIN_SLICE = 12; // px
export const ATTEMPT_PERSONNEL_MAX_ROWS = 2;
// The line of the row's Stop, Unstop and Stop all buttons, below its cards.
export const ATTEMPT_PERSONNEL_BUTTONS_HEIGHT = 18; // px

export interface AttemptPersonnel {
  // The cards of the away team or of the crew, the equipment too.
  count: number;
  // An attempt at a space mission, with a ship: the row is the crew, beside the ships.
  space: boolean;
}

// The height of `rows` rows of whole cards `cardWidth` wide.
export const attemptPersonnelHeight = (cardWidth: number, rows: number): number =>
  rows * fullCardHeight(cardWidth) + (rows - 1) * SHIP_ROW_GAP;

// The rows a row of `count` cards fills in `width` (#1165): 1, unless 1 row would show less than
// the minimum slice of each card and 2 rows fit in `height`.
export function attemptPersonnelRows(count: number, cardWidth: number, width: number, height: number): number {
  if (count <= 1) return 1;
  const offset = Math.floor((width - cardWidth) / (count - 1));
  if (offset >= ATTEMPT_PERSONNEL_MIN_SLICE) return 1;
  return attemptPersonnelHeight(cardWidth, ATTEMPT_PERSONNEL_MAX_ROWS) <= height ? ATTEMPT_PERSONNEL_MAX_ROWS : 1;
}

// The height of the attempted mission's column at a scale: room for the slivers of the dilemmas
// under it, the whole card, and the badge strip of the placed-on counters below it.
export const attemptMissionColumnHeight = (scale: number): number =>
  underMissionStackRoom(scale, true) + missionCardHeight(scale, true) + MISSION_COLUMN_GAP + badgeStripHeight(scale);

// Pure, like `computeTouchMissionScale`. `availableHeight` runs from the bottom of the strip to the
// top of the bottom row, less the gap below the strip. `floorScale` is the scale the missions draw
// at on the normal table, capped by `attemptFloorScale`: neither the mission nor the ships draw
// smaller than that.
//
// The mission card has the width first: it grows, as far as the height allows, into the width left
// once the middle column keeps room for 2 ships at the floor scale, and for the row of the
// attempting personnel (`personnel`, #1165) at its minimum slice. The middle column takes the rest
// of the width, and the ships grow in it until they no longer fit with no overlap in the rows the
// height has room for, never past the mission's scale. With no `personnel`, the middle column holds
// the away team badge and the ships only.
//
// At a space mission (#1177) the ships sit in a column exactly as wide as the mission, 2 to a row as
// under a mission on the table, so the mission and the ships share the width as two card-wide
// columns. The crew row beside them gets the rest, up to its natural width, and any width past that
// stays empty, the columns centred.
// The floor of the attempt layout: the scale the missions draw at on the normal table, unless the
// whole mission card is too tall for `availableHeight` at that scale, and then the largest scale at
// which it fits, never below the table scale. The mission row gives the dilemma stack no width
// (#1170), so on a short screen, the minimum one too, its missions draw at a scale at which the
// whole card does not fit below the strip.
export function attemptFloorScale(missionScale: number, availableHeight: number, tableScale: number): number {
  return Math.max(tableScale, fitColumnScale(missionScale, availableHeight, attemptMissionColumnHeight));
}

export function computeAttemptLayout(
  gameLayerWidth: number,
  availableHeight: number,
  desktop: boolean,
  shipCount: number,
  floorScale: number,
  personnel?: AttemptPersonnel,
): AttemptLayoutSizes {
  const floor = Math.max(1, floorScale);
  const dilemmaStackWidth = DILEMMA_STACK_CARD_WIDTH * (desktop ? DILEMMA_STACK_DESKTOP_WIDTH_FACTOR : 1);
  const availableWidth = gameLayerWidth - CONTENT_PADDING - MENU_BUTTON_GUTTER - 2 * ATTEMPT_GAP - dilemmaStackWidth;
  const minShipsWidth = shipRowWidth(floor, 2);
  const space = personnel?.space ?? false;
  const count = personnel?.count ?? 0;

  // The row of the attempting personnel: whole cards as wide as a ship at the floor scale, never
  // taller than the room the column keeps for them.
  const buttonsRoom = SHIP_ROW_GAP + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT;
  const personnelHeightRoom = space
    ? availableHeight - badgeStripHeight(floor) - MISSION_COLUMN_GAP - buttonsRoom
    : availableHeight - MISSION_COLUMN_GAP - shipRowLineHeight(floor, desktop) - buttonsRoom;
  const personnelCardWidth = Math.max(
    1,
    Math.min(shipCardWidth(floor), Math.floor((Math.max(0, personnelHeightRoom) * 120) / 167)),
  );
  const minPersonnelWidth =
    personnelCardWidth + Math.max(0, Math.ceil(count / ATTEMPT_PERSONNEL_MAX_ROWS) - 1) * ATTEMPT_PERSONNEL_MIN_SLICE;
  const naturalPersonnelWidth = personnelCardWidth * Math.max(1, count);
  const minMiddleWidth = !personnel
    ? minShipsWidth
    : space
      ? minShipsWidth + ATTEMPT_GAP + minPersonnelWidth
      : Math.max(minShipsWidth, minPersonnelWidth);

  // At a space mission the ships column is as wide as the mission (#1177), so the width that bounds
  // the mission's scale is shared by two card-wide columns, next to the crew row at its minimum.
  const missionWidthScale = space
    ? (availableWidth - ATTEMPT_GAP - minPersonnelWidth) / (2 * TABLE_CARD_WIDTH)
    : (availableWidth - minMiddleWidth) / TABLE_CARD_WIDTH;
  const missionScale = Math.max(floor, fitColumnScale(missionWidthScale, availableHeight, attemptMissionColumnHeight));
  const missionWidth = Math.round(TABLE_CARD_WIDTH * missionScale);
  let shipsWidth: number;
  let shipRowsWidth: number;
  let personnelWidth: number;
  if (space) {
    shipRowsWidth = missionWidth;
    personnelWidth = Math.max(0, Math.min(naturalPersonnelWidth, Math.floor(availableWidth - 2 * missionWidth - ATTEMPT_GAP)));
    shipsWidth = shipRowsWidth + ATTEMPT_GAP + personnelWidth;
  } else {
    shipsWidth = Math.max(minMiddleWidth, Math.floor(availableWidth - missionWidth));
    personnelWidth = personnel ? Math.min(naturalPersonnelWidth, shipsWidth) : 0;
    shipRowsWidth = shipsWidth;
  }
  const personnelRows = personnel
    ? attemptPersonnelRows(count, personnelCardWidth, personnelWidth, personnelHeightRoom)
    : 0;

  // The middle column: the away team badge, or the row of the away team, then the rows of ships.
  const aboveShips =
    personnel && !space
      ? attemptPersonnelHeight(personnelCardWidth, personnelRows) + buttonsRoom
      : badgeStripHeight(missionScale);
  const rowsFitting = (scale: number): number => {
    const free = availableHeight - aboveShips - MISSION_COLUMN_GAP;
    const line = shipRowLineHeight(scale, desktop);
    return Math.max(1, Math.floor((free + SHIP_ROW_GAP) / (line + SHIP_ROW_GAP)));
  };
  const rowsNeeded = (scale: number): number => Math.max(1, Math.ceil(shipCount / shipsPerRow(scale, shipRowsWidth)));
  const fits = (scale: number): boolean =>
    shipCardWidth(scale) <= shipRowsWidth && rowsNeeded(scale) <= rowsFitting(scale);
  let shipScale = floor;
  if (missionScale > floor && fits(floor)) {
    if (fits(missionScale)) shipScale = missionScale;
    else {
      let low = floor;
      let high = missionScale;
      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid;
        else high = mid;
      }
      shipScale = low;
    }
  }
  return {
    missionScale,
    shipScale,
    shipRows: Math.min(rowsNeeded(shipScale), rowsFitting(shipScale)),
    shipsWidth,
    shipRowsWidth,
    personnelCardWidth,
    personnelRows,
    personnelWidth,
  };
}

// Measures the attempt layout with a `ResizeObserver`, the same way `useMissionScale` measures the
// mission row: the available height runs from the bottom of the strip to the top of the bottom row.
// The floor is the scale the mission row would draw at in the same space, from the top of the
// layout. Before the elements mount, and in jsdom, it returns the sizes at `scale`.
export function useAttemptLayout(
  desktop: boolean,
  scale: number,
  gameLayer: HTMLElement | null,
  layout: HTMLElement | null,
  strip: HTMLElement | null,
  bottomRow: HTMLElement | null,
  shipCount: number,
  personnel: AttemptPersonnel | undefined,
  desktopColumnHeight: (scale: number) => number,
  touchColumnHeight: (scale: number) => number,
): AttemptLayoutSizes {
  const [sizes, setSizes] = useState<AttemptLayoutSizes | null>(null);
  const personnelCount = personnel?.count;
  const personnelSpace = personnel?.space;

  useEffect(() => {
    const personnel =
      personnelCount === undefined ? undefined : { count: personnelCount, space: personnelSpace ?? false };
    if (!gameLayer || !layout || !strip || !bottomRow) {
      setSizes(null);
      return;
    }
    const measure = () => {
      const content = layout.parentElement ?? gameLayer;
      const paddingBottom = parseFloat(getComputedStyle(content).paddingBottom) || 0;
      const bodyBottom = gameLayer.getBoundingClientRect().bottom - paddingBottom - bottomRow.getBoundingClientRect().height;
      const tableHeight = bodyBottom - layout.getBoundingClientRect().top;
      const missionScale = desktop
        ? computeDesktopTableScale(gameLayer.clientWidth, tableHeight, desktopColumnHeight)
        : computeTouchMissionScale(gameLayer.clientWidth, tableHeight, touchColumnHeight, scale);
      const availableHeight = bodyBottom - strip.getBoundingClientRect().bottom - ATTEMPT_GAP;
      const floor = attemptFloorScale(missionScale, availableHeight, desktop ? 1 : scale);
      setSizes(computeAttemptLayout(gameLayer.clientWidth, availableHeight, desktop, shipCount, floor, personnel));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gameLayer);
    observer.observe(bottomRow);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [
    desktop,
    scale,
    gameLayer,
    layout,
    strip,
    bottomRow,
    shipCount,
    personnelCount,
    personnelSpace,
    desktopColumnHeight,
    touchColumnHeight,
  ]);

  if (sizes) return sizes;
  // Before the measure, and in jsdom: the sizes at `scale`, with the personnel row as wide as its
  // cards edge to edge.
  const cardWidth = shipCardWidth(scale);
  const personnelWidth = personnel ? cardWidth * Math.max(1, personnel.count) : 0;
  const shipRowsWidth = personnel?.space ? Math.round(TABLE_CARD_WIDTH * scale) : Math.max(shipRowWidth(scale, 2), personnelWidth);
  const shipsWidth = personnel?.space ? shipRowsWidth + ATTEMPT_GAP + personnelWidth : shipRowsWidth;
  return {
    missionScale: scale,
    shipScale: scale,
    shipRows: 1,
    shipsWidth,
    shipRowsWidth,
    personnelCardWidth: cardWidth,
    personnelRows: personnel ? 1 : 0,
    personnelWidth,
  };
}

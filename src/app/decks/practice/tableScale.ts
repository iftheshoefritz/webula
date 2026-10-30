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
import { TABLE_CARD_ART_HEIGHT, TABLE_CARD_WIDTH, fullCardHeight } from './TableCard';
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
import { viewerCardSize } from './viewerCardSize';

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
export const MENU_BUTTON_GUTTER = 20; // px, each side
// Issue #1337: on the full touch table the turn and score controls sit in a column left of the
// mission row, below the corner buttons. The row reserves this much past the content padding on its
// left, in place of `MENU_BUTTON_GUTTER`, and keeps the gutter on its right, so it is offset right of
// centre. At the minimum screen the width bound is then still a 105 px mission, the size the
// height-bound row drew at before the counters left the bottom row.
export const TOUCH_CONTROLS_COLUMN = 56; // px

// `leftReserve` is the space kept left of the row past the content padding: `MENU_BUTTON_GUTTER`, or
// `TOUCH_CONTROLS_COLUMN` on the full touch table.
export function computeTouchMissionScale(
  gameLayerWidth: number,
  availableHeight: number,
  columnHeight: (scale: number) => number,
  tableScale: number,
  leftReserve: number = MENU_BUTTON_GUTTER,
): number {
  const availableWidth =
    gameLayerWidth -
    CONTENT_PADDING -
    leftReserve -
    MENU_BUTTON_GUTTER -
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
  // The measure, with the elements it was measured for: when an element unmounts and a new one
  // mounts, the first render uses `scale` and not the measure of the old elements.
  const [measured, setMeasured] = useState<{ value: number; elements: readonly HTMLElement[] } | null>(null);

  useEffect(() => {
    if (!gameLayer || !missionRows || !bottomRow) return;
    const elements = [gameLayer, missionRows, bottomRow];
    const measure = () => {
      const content = missionRows.parentElement ?? gameLayer;
      const paddingBottom = parseFloat(getComputedStyle(content).paddingBottom) || 0;
      const availableHeight =
        gameLayer.getBoundingClientRect().bottom -
        paddingBottom -
        bottomRow.getBoundingClientRect().height -
        missionRows.getBoundingClientRect().top;
      setMeasured({
        value: desktop
          ? computeDesktopTableScale(gameLayer.clientWidth, availableHeight, desktopColumnHeight)
          : computeTouchMissionScale(
              gameLayer.clientWidth,
              availableHeight,
              touchColumnHeight,
              scale,
              TOUCH_CONTROLS_COLUMN,
            ),
        elements,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(gameLayer);
    observer.observe(bottomRow);
    return () => observer.disconnect();
  }, [desktop, scale, gameLayer, missionRows, bottomRow, desktopColumnHeight, touchColumnHeight]);

  return measured && measuredFor(measured.elements, [gameLayer, missionRows, bottomRow]) ? measured.value : scale;
}

// True when a measure taken for `measured` still belongs to the `current` elements, all mounted.
function measuredFor(measured: readonly HTMLElement[], current: readonly (HTMLElement | null)[]): boolean {
  return measured.length === current.length && current.every((element, i) => element !== null && element === measured[i]);
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
  // The width of the middle column: the away team row, and the ships. At a space mission it is the
  // ships column, the gap and the crew row (#1177). It takes all the width the mission and the stack
  // leave (#1365).
  shipsWidth: number;
  // The width of the ship rows: the whole middle column, or, at a space mission, its widest row of
  // ships, with the crew row beside it (#1165, #1177, #1365).
  shipRowsWidth: number;
  // The area of the attempting personnel (#1165, #1205, #1218): the width of one crop, the crops of a
  // row, the rows it shows at least in part (the rest scroll), and its width and height.
  personnelCardWidth: number;
  personnelColumns: number;
  personnelVisibleRows: number;
  personnelWidth: number;
  personnelHeight: number;
  // The column of the cards placed on the mission (#1180), right of the mission card, or 0 with
  // nothing placed on it.
  placedOnWidth: number;
  // The dilemma stack of the facing phase (#1208, #1218): the zone's width, one whole card and the
  // slivers of the cards behind it (`attemptFacingStackSize`), its height, and the card's width.
  stackWidth: number;
  stackHeight: number;
  stackCardWidth: number;
  // The height every column of the body fits, in both phases (#1203): `attemptColumnHeight`.
  columnHeight: number;
}

// Issue #1180: in the attempt layout the cards placed on the attempted mission show in a column to
// the right of the mission card, as tall as the card: the dilemmas in a block above, the events in
// a block below, each card as the art crop of a table card as wide as the column. It is as wide as
// a ship at the floor scale, and takes its width from the middle column's slack first.
export const ATTEMPT_PLACED_ON_BLOCK_GAP = 4; // px, between the two blocks
export const attemptPlacedOnWidth = (floor: number): number => shipCardWidth(floor);

export interface AttemptPlacedOnBlock {
  // The block's height, the height of one art crop, and the step from one card's top to the next.
  height: number;
  cardHeight: number;
  step: number;
}

// The blocks of the column, `height` tall with cards `cardWidth` wide: a group with cards gets the
// whole height when the other has none, and half of it, less half the gap, when both have cards.
// Every card shows, in `placedOn` order, overlapped to fit: the step never exceeds a card's height.
export function attemptPlacedOnBlocks(
  dilemmaCount: number,
  eventCount: number,
  height: number,
  cardWidth: number,
): { dilemmas: AttemptPlacedOnBlock | null; events: AttemptPlacedOnBlock | null } {
  const both = dilemmaCount > 0 && eventCount > 0;
  const blockHeight = Math.max(1, Math.floor(both ? (height - ATTEMPT_PLACED_ON_BLOCK_GAP) / 2 : height));
  const block = (count: number): AttemptPlacedOnBlock | null => {
    if (count === 0) return null;
    const cardHeight = Math.max(1, Math.min(blockHeight, Math.round((cardWidth * TABLE_CARD_ART_HEIGHT) / TABLE_CARD_WIDTH)));
    const step = count > 1 ? Math.min(cardHeight, Math.floor((blockHeight - cardHeight) / (count - 1))) : 0;
    return { height: blockHeight, cardHeight, step };
  };
  return { dilemmas: block(dilemmaCount), events: block(eventCount) };
}

// Issue #1165: the attempting personnel show in the middle column, the away team at a planet
// mission in place of the away team badge, and the crew of the attempting ship beside the ships at
// a space mission. Issue #1205: each card is the art crop of a table card, the personnel format of
// #1176, side by side with no overlap, in as many rows as the cards need, and the rows past the
// height scroll.
//
// Issue #1218: each card is as wide as a card of the crew panel on the full table
// (`viewerCardSize`), drawn as the art crop on a desktop too, with the 8 px gap of the panel's grid.
// It fills the height it has, not only whole rows, and when the cards do not all fit it shows at
// least a quarter of a card of the second row, so the player sees that it scrolls. The cards shrink
// below the crew panel's width only for that peek, or where the width runs out.
//
// Issue #1365: the area takes all the width the mission, the ships and the stack leave, even with
// fewer cards, so it does not jump when one joins or leaves, and a row holds as many cards as fit
// it, never fewer than `ATTEMPT_PERSONNEL_COLUMNS`. The mission's scale still keeps room for 3.
export const ATTEMPT_PERSONNEL_COLUMNS = 3;
export const ATTEMPT_PERSONNEL_GAP = 8; // px, the crew panel's `gap-2`
// The part of a card of the second row the area shows at least, when the cards do not all fit.
export const ATTEMPT_PERSONNEL_PEEK = 0.25;
// The width of the area's scrollbar (`scrollbar-visible`, `globals.css`). The area always keeps it
// beside the cards, so the scrollbar never pushes a card to the next row, and the area keeps its
// width when it starts to scroll.
export const ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH = 6; // px
// The width the facing stack keeps right of its top card for the slivers of the cards behind it,
// and the most the stack may be, as a multiple of its top card's width (#1218).
export const ATTEMPT_STACK_SLIVER_ROOM = 12; // px
export const ATTEMPT_STACK_MAX_WIDTH_FACTOR = 1.2;
// The line of the row's Stop, Unstop, Stop all and Shuffle buttons, above its cards (#1218).
export const ATTEMPT_PERSONNEL_BUTTONS_HEIGHT = 18; // px

export interface AttemptPersonnel {
  // The cards of the away team or of the crew, the equipment too.
  count: number;
  // An attempt at a space mission, with a ship: the row is the crew, beside the ships.
  space: boolean;
}

// The height of the art crop of a table card `cardWidth` wide.
export const attemptPersonnelCropHeight = (cardWidth: number): number =>
  Math.round((cardWidth * TABLE_CARD_ART_HEIGHT) / TABLE_CARD_WIDTH);

// The height of `rows` whole rows of crops `cardWidth` wide.
export const attemptPersonnelHeight = (cardWidth: number, rows: number): number =>
  Math.max(0, rows * attemptPersonnelCropHeight(cardWidth) + (rows - 1) * ATTEMPT_PERSONNEL_GAP);

// The width of an area of `columns` crops `cardWidth` wide, their gaps and the scrollbar.
export const attemptPersonnelWidth = (cardWidth: number, columns = ATTEMPT_PERSONNEL_COLUMNS): number =>
  columns * cardWidth + (columns - 1) * ATTEMPT_PERSONNEL_GAP + ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH;

// The crops `cardWidth` wide a row of an area `room` px across holds, never fewer than 3 (#1365).
export const attemptPersonnelColumnsFit = (room: number, cardWidth: number): number =>
  Math.max(
    ATTEMPT_PERSONNEL_COLUMNS,
    Math.floor((room - ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH + ATTEMPT_PERSONNEL_GAP) / (cardWidth + ATTEMPT_PERSONNEL_GAP)),
  );

// The widest crop whose area fits `room` px across.
export const attemptPersonnelWidthFit = (room: number): number =>
  Math.floor(
    (room - (ATTEMPT_PERSONNEL_COLUMNS - 1) * ATTEMPT_PERSONNEL_GAP - ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH) / ATTEMPT_PERSONNEL_COLUMNS,
  );

// The height `count` crops `cardWidth` wide, `columns` to a row, need: one row, and when they need
// more than one, the gap and the peek of the second row too.
export function attemptPersonnelNeededHeight(count: number, cardWidth: number, columns = ATTEMPT_PERSONNEL_COLUMNS): number {
  const crop = attemptPersonnelCropHeight(cardWidth);
  return count > columns ? crop + ATTEMPT_PERSONNEL_GAP + ATTEMPT_PERSONNEL_PEEK * crop : crop;
}

// The widest crop, up to `maxWidth`, at which `count` cards, `columns` to a row, fit `heightRoom`
// px down (`attemptPersonnelNeededHeight`).
export function attemptPersonnelCardWidth(
  count: number,
  heightRoom: number,
  maxWidth: number,
  columns = ATTEMPT_PERSONNEL_COLUMNS,
): number {
  const peek = count > columns;
  const needed = (width: number): number => attemptPersonnelNeededHeight(count, width, columns);
  let width = Math.max(1, Math.floor(maxWidth));
  const cropRoom = peek ? (heightRoom - ATTEMPT_PERSONNEL_GAP) / (1 + ATTEMPT_PERSONNEL_PEEK) : heightRoom;
  width = Math.max(1, Math.min(width, Math.floor((Math.max(0, cropRoom) * TABLE_CARD_WIDTH) / TABLE_CARD_ART_HEIGHT)));
  // The crop height rounds, so step down past a rounding that left it a pixel too tall.
  while (width > 1 && needed(width) > heightRoom) width -= 1;
  return width;
}

export interface AttemptPersonnelGrid {
  // The cards of one row, and the rows the area shows, at least in part; the rest scroll.
  columns: number;
  visibleRows: number;
  // The area's width, the scrollbar too, and its height.
  width: number;
  height: number;
}

// The widest crop, up to `maxWidth`, and the crops of a row, of `count` cards in an area `room` px
// across and `heightRoom` px down (#1365): as many to a row as fit the room, never fewer than 3,
// and the peek of a second row only when the cards need one at that many to a row. A narrower crop
// may fit more to a row, and so need no second row, so the two settle together, from the widest
// crop down.
export function attemptPersonnelFit(
  count: number,
  heightRoom: number,
  maxWidth: number,
  room: number,
): { cardWidth: number; columns: number } {
  let width = Math.max(1, Math.min(Math.floor(maxWidth), attemptPersonnelWidthFit(room)));
  while (width > 1 && attemptPersonnelNeededHeight(count, width, attemptPersonnelColumnsFit(room, width)) > heightRoom) {
    width -= 1;
  }
  return { cardWidth: width, columns: attemptPersonnelColumnsFit(room, width) };
}

// The grid of `count` crops `cardWidth` wide, `columns` to a row, in an area `width` px across, 3
// crops' worth by default, that may take `heightRoom` px down (#1218): as tall as its rows or as the
// room, whichever is less.
export function attemptPersonnelGrid(
  count: number,
  cardWidth: number,
  heightRoom: number,
  columns = ATTEMPT_PERSONNEL_COLUMNS,
  width = attemptPersonnelWidth(cardWidth, columns),
): AttemptPersonnelGrid {
  const rows = Math.max(1, Math.ceil(count / columns));
  const height = Math.max(0, Math.min(attemptPersonnelHeight(cardWidth, rows), Math.floor(heightRoom)));
  const step = attemptPersonnelCropHeight(cardWidth) + ATTEMPT_PERSONNEL_GAP;
  return {
    columns,
    visibleRows: Math.min(rows, Math.max(1, Math.ceil((height + ATTEMPT_PERSONNEL_GAP) / step))),
    width,
    height,
  };
}

// The dilemma stack of the facing phase (#1208, #1218): its top card is a whole card as tall as the
// mission card, or as the column when that is shorter, and the cards behind it show as slivers to
// its right, so the zone is at most `ATTEMPT_STACK_MAX_WIDTH_FACTOR` times as wide as the card. Like
// the mission, it never draws smaller than at `ATTEMPT_MIN_SCALE`, which a real screen never
// reaches: a height that small, such as the zero rects of jsdom, is left to the body's clip.
export const attemptStackSliverRoom = (cardWidth: number): number =>
  Math.min(ATTEMPT_STACK_SLIVER_ROOM, Math.floor(cardWidth * (ATTEMPT_STACK_MAX_WIDTH_FACTOR - 1)));

export function attemptFacingStackSize(
  missionScale: number,
  columnHeight: number,
): { stackWidth: number; stackHeight: number; stackCardWidth: number } {
  const stackHeight = Math.max(
    missionCardHeight(ATTEMPT_MIN_SCALE, true),
    Math.min(missionCardHeight(missionScale, true), Math.floor(columnHeight)),
  );
  const stackCardWidth = Math.max(1, Math.floor((stackHeight * 120) / 167));
  return { stackWidth: stackCardWidth + attemptStackSliverRoom(stackCardWidth), stackHeight, stackCardWidth };
}

// The height of the attempted mission's column at a scale: room for the slivers of the dilemmas
// under it, the whole card, and the badge strip of the placed-on counters below it.
export const attemptMissionColumnHeight = (scale: number): number =>
  underMissionStackRoom(scale, true) + missionCardHeight(scale, true) + MISSION_COLUMN_GAP + badgeStripHeight(scale);

// The largest scale, up to `widthScale`, at which the attempted mission's column fits
// `availableHeight`. Unlike `fitColumnScale` it has no floor of 1 (#1203): on a screen too short for
// the whole card, the mission shrinks below the table scale rather than push the bottom row down.
// It stops at `ATTEMPT_MIN_SCALE`, which a real screen never reaches: a height that small, such as
// the zero rects of jsdom, is left to the body's clip.
export const ATTEMPT_MIN_SCALE = 0.5;
export function attemptHeightScale(widthScale: number, availableHeight: number): number {
  if (widthScale <= ATTEMPT_MIN_SCALE || attemptMissionColumnHeight(ATTEMPT_MIN_SCALE) >= availableHeight) {
    return ATTEMPT_MIN_SCALE;
  }
  if (attemptMissionColumnHeight(widthScale) <= availableHeight) return widthScale;
  let low = ATTEMPT_MIN_SCALE;
  let high = widthScale;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (attemptMissionColumnHeight(mid) <= availableHeight) low = mid;
    else high = mid;
  }
  return low;
}

// The one height budget of the attempt body (#1203). The body's top padding, the room for the
// slivers above the mission, sits above every column, so each column, the mission's aside, fits
// what is left of `availableHeight` below it. `missionScale` is the largest the mission can draw at,
// so the budget holds at the scale it does draw at too.
export const attemptColumnHeight = (availableHeight: number, missionScale: number): number =>
  availableHeight - underMissionStackRoom(missionScale, true);

// Pure, like `computeTouchMissionScale`. `availableHeight` runs from the bottom of the strip to the
// top of the bottom row, less the gap below the strip. `floorScale` is the scale the missions draw
// at on the normal table, capped by `attemptFloorScale`: neither the mission nor the ships draw
// smaller than that, unless the whole mission card does not fit the height at it (#1203).
// `panelCardWidth` is the width of a card of the crew panel on the full table (`viewerCardSize`).
//
// The mission card grows, as far as the height allows, into the width left once the middle column
// keeps room for 2 ships at the floor scale and for the area of the attempting personnel at its
// target size, 3 cards of the crew panel's width, or less where the height cannot show them with
// the peek of a second row (#1218). The dilemma stack is one whole card and the slivers of the cards
// behind it, as wide as its height makes it, so it grows with the mission. The mission therefore
// stops growing where its growth would take the width the personnel need. Where the floor leaves
// too little width for the target, the personnel cards shrink to the width there is, and keep 3 to a
// row. With no `personnel`, the middle column holds the away team badge and the ships only.
//
// The middle column then takes what its personnel area and 2 ships at the floor scale need, and the
// ships grow in it until they no longer fit with no overlap in the rows the height has room for,
// never past the mission's scale.
//
// At a space mission (#1177) the ships grow in a column as wide as the mission, 2 to a row as under
// a mission on the table, and the crew row stands beside them. The mission's scale reserves that
// column and the away team badge above it, as before #1365, so it and the dilemma choice do not
// change; the facing body then draws no badge (#1365), and the column narrows to its widest row.
//
// Once the mission is fixed, the personnel area takes all the width the mission, the ships and the
// stack leave, with as many cards to a row as fit (#1365), so the body fills the row from the strip's
// gutter on the left to the content padding on the right.
//
// The personnel area takes the height its column keeps for it, and the rest scroll. At a planet
// mission that is the whole column but one line of ships, so the bottom row stays where #1203 put
// it. The line of its buttons sits above it (#1218).
// The floor of the attempt layout: the scale the missions draw at on the normal table, unless the
// whole mission card is too tall for `availableHeight` at that scale, and then the largest scale at
// which it fits, never below the table scale unless the card does not fit at the table scale either
// (#1203). The mission row gives the dilemma stack no width (#1170), so on a short screen, the
// minimum one too, its missions draw at a scale at which the whole card does not fit below the strip.
export function attemptFloorScale(missionScale: number, availableHeight: number, tableScale: number): number {
  return Math.min(
    Math.max(tableScale, fitColumnScale(missionScale, availableHeight, attemptMissionColumnHeight)),
    attemptHeightScale(Math.max(missionScale, tableScale), availableHeight),
  );
}

export function computeAttemptLayout(
  gameLayerWidth: number,
  availableHeight: number,
  desktop: boolean,
  shipCount: number,
  floorScale: number,
  personnel?: AttemptPersonnel,
  placedOn = false,
  panelCardWidth = viewerCardSize(1, desktop).width,
): AttemptLayoutSizes {
  // The height wins over the floor: the mission never draws taller than the height, nor the ships
  // and the personnel larger than the mission (#1203).
  const heightScale = attemptHeightScale(gameLayerWidth / TABLE_CARD_WIDTH, availableHeight);
  const floor = Math.min(Math.max(1, floorScale), heightScale);
  const columnHeight = attemptColumnHeight(availableHeight, heightScale);
  // The column of the placed cards (#1180) and its gap come off the width first. The mission is
  // bounded by the height or by the width, whichever is less, so this takes the middle column's
  // slack, and shrinks the mission, never below the floor, only when the slack runs out.
  const placedOnWidth = placedOn ? attemptPlacedOnWidth(floor) : 0;
  // The width of the mission, the middle column and the dilemma stack.
  const availableWidth =
    gameLayerWidth -
    CONTENT_PADDING -
    MENU_BUTTON_GUTTER -
    2 * ATTEMPT_GAP -
    (placedOnWidth > 0 ? placedOnWidth + ATTEMPT_GAP : 0);
  const minShipsWidth = shipRowWidth(floor, 2);
  const space = personnel?.space ?? false;
  const count = personnel?.count ?? 0;

  // The area of the attempting personnel, below the line of its buttons, in the height the column
  // keeps for them, and the crop it aims for there (#1218).
  const buttonsRoom = SHIP_ROW_GAP + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT;
  const personnelHeightRoom = space
    ? columnHeight - badgeStripHeight(floor) - MISSION_COLUMN_GAP - buttonsRoom
    : columnHeight - MISSION_COLUMN_GAP - shipRowLineHeight(floor, desktop) - buttonsRoom;
  const targetPersonnelWidth = personnel
    ? attemptPersonnelWidth(attemptPersonnelCardWidth(count, personnelHeightRoom, panelCardWidth))
    : 0;

  // The width the mission, the middle column and the stack take at a scale. It only grows with the
  // scale, so a bisection finds the largest scale whose width fits.
  const usedWidth = (scale: number): number => {
    const missionWidth = Math.round(TABLE_CARD_WIDTH * scale);
    const middleWidth = !personnel
      ? minShipsWidth
      : space
        ? missionWidth + ATTEMPT_GAP + targetPersonnelWidth
        : Math.max(minShipsWidth, targetPersonnelWidth);
    return missionWidth + middleWidth + attemptFacingStackSize(scale, columnHeight).stackWidth;
  };
  let missionWidthScale = 0;
  let high = gameLayerWidth / TABLE_CARD_WIDTH;
  if (usedWidth(high) <= availableWidth) missionWidthScale = high;
  else {
    for (let i = 0; i < 30; i++) {
      const mid = (missionWidthScale + high) / 2;
      if (usedWidth(mid) <= availableWidth) missionWidthScale = mid;
      else high = mid;
    }
  }
  const missionScale = Math.min(
    heightScale,
    Math.max(floor, fitColumnScale(missionWidthScale, availableHeight, attemptMissionColumnHeight)),
  );
  const missionWidth = Math.round(TABLE_CARD_WIDTH * missionScale);
  const { stackWidth, stackHeight, stackCardWidth } = attemptFacingStackSize(missionScale, columnHeight);

  // The rows of ships that fit below what sits above them in the middle column: the row of the away
  // team and its buttons at a planet mission, nothing at a space mission (#1365), where the ships
  // stand beside the crew, and the away team badge with no personnel. The layout always draws at
  // least 1 row, and a larger scale must fit its line too, since the area may leave room for only
  // one line at the floor.
  const linesFitting = (scale: number, aboveShips: number | null, rowsWidth: number) => {
    const free = aboveShips === null ? columnHeight : columnHeight - aboveShips - MISSION_COLUMN_GAP;
    const line = shipRowLineHeight(scale, desktop);
    const lines = Math.floor((free + SHIP_ROW_GAP) / (line + SHIP_ROW_GAP));
    const rowsNeeded = Math.max(1, Math.ceil(shipCount / shipsPerRow(scale, rowsWidth)));
    return { lines, rowsNeeded };
  };
  // The ships grow from the floor until they no longer fit with no overlap in the rows there is
  // room for, never past the mission's scale.
  const fitShips = (aboveShips: number | null, rowsWidth: number): { shipScale: number; shipRows: number } => {
    const fits = (scale: number): boolean => {
      const { lines, rowsNeeded } = linesFitting(scale, aboveShips, rowsWidth);
      return shipCardWidth(scale) <= rowsWidth && rowsNeeded <= lines;
    };
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
    const { lines, rowsNeeded } = linesFitting(shipScale, aboveShips, rowsWidth);
    return { shipScale, shipRows: Math.min(rowsNeeded, Math.max(1, lines)) };
  };

  // The width the mission, its placed-on column and the stack leave for the middle column.
  const middleRoom = Math.floor(availableWidth - missionWidth - stackWidth);
  let ships: { shipScale: number; shipRows: number };
  let shipsWidth: number;
  let shipRowsWidth: number;
  let grid: AttemptPersonnelGrid;
  let personnelCardWidth: number;
  if (space) {
    // A space mission (#1365): no away team badge above the ships, so the ships and the crew take
    // the whole height. The ships grow in a column as wide as the mission, 2 to a row (#1177), and
    // the column then narrows to its widest row, so the crew takes every pixel the ships leave.
    ships = fitShips(null, missionWidth);
    const perRow = Math.min(Math.max(1, shipCount), shipsPerRow(ships.shipScale, missionWidth));
    shipRowsWidth = Math.min(missionWidth, shipRowWidth(ships.shipScale, perRow));
    const personnelRoom = Math.max(0, middleRoom - shipRowsWidth - ATTEMPT_GAP);
    const gridHeightRoom = columnHeight - buttonsRoom;
    const fit = attemptPersonnelFit(count, gridHeightRoom, panelCardWidth, personnelRoom);
    personnelCardWidth = fit.cardWidth;
    grid = attemptPersonnelGrid(count, personnelCardWidth, gridHeightRoom, fit.columns, personnelRoom);
    shipsWidth = shipRowsWidth + ATTEMPT_GAP + grid.width;
  } else if (personnel) {
    // A planet mission: the away team row takes the whole middle column, above the ships (#1365).
    const fit = attemptPersonnelFit(count, personnelHeightRoom, panelCardWidth, middleRoom);
    personnelCardWidth = fit.cardWidth;
    grid = attemptPersonnelGrid(count, personnelCardWidth, personnelHeightRoom, fit.columns, Math.max(0, middleRoom));
    shipsWidth = Math.max(minShipsWidth, grid.width);
    shipRowsWidth = shipsWidth;
    ships = fitShips(grid.height + buttonsRoom, shipRowsWidth);
  } else {
    personnelCardWidth = attemptPersonnelCardWidth(0, personnelHeightRoom, panelCardWidth);
    grid = { columns: 0, visibleRows: 0, width: 0, height: 0 };
    shipsWidth = minShipsWidth;
    shipRowsWidth = shipsWidth;
    ships = fitShips(badgeStripHeight(missionScale), shipRowsWidth);
  }
  const personnelWidth = grid.width;
  const { shipScale, shipRows } = ships;
  return {
    missionScale,
    shipScale,
    shipRows,
    shipsWidth,
    shipRowsWidth,
    personnelCardWidth,
    personnelColumns: grid.columns,
    personnelVisibleRows: grid.visibleRows,
    personnelWidth,
    personnelHeight: grid.height,
    placedOnWidth,
    stackWidth,
    stackHeight,
    stackCardWidth,
    columnHeight,
  };
}

// Issue #1190: the layout of the dilemma choice (`Attempt.phase === 'choose'`, #1189). Left to
// right: the mission, at exactly the facing phase's scale, so it does not move when the phase
// changes; the dilemma stack, face up, every card readable; and a right column with the attempting
// personnel as one face-down pile, above the ships of the mission's ship row, one ship wide. At a
// planet mission the pile is the size of a stack card, and the ships stand right of it (#1222). The
// stack takes the width the middle column and the facing stack take in the facing phase.
// The line of the end labels above the cards of the choice phase's stack (#1204), in px.
export const ATTEMPT_STACK_LABEL_HEIGHT = 14;
// The empty space outside each end of the choice phase's stack, the "First" end and the
// "Last" end, on top of `ATTEMPT_GAP` (#1220), in px. It comes out of the stack's width.
export const ATTEMPT_STACK_SIDE_GAP = 16;

export interface AttemptChoiceSizes {
  // The scale of the mission card: the facing phase's `missionScale`.
  missionScale: number;
  // The face-up stack: the zone's width and height, less the space outside each end
  // (`ATTEMPT_STACK_SIDE_GAP`, #1220), and the width and height of one card in it,
  // drawn as the art crop of a table card (#1221). The cards sit edge to edge while they fit, and
  // overlap past that, below the line of the end labels (`ATTEMPT_STACK_LABEL_HEIGHT`, #1204).
  stackWidth: number;
  stackHeight: number;
  stackCardWidth: number;
  stackCardHeight: number;
  // The right part: its whole width, the face-down pile's card, and the ships, one to a row, in a
  // column `shipColumnWidth` wide. At a planet mission (#1222) the pile is a crop of the card back
  // exactly the size of a stack card, its bottom edge level with the bottom edge of the stack's cards,
  // and the ship column stands right of it. A space mission has no pile (#1235): the player knows the
  // crew is on the ship, whose crew badge shows the count, so the right part is the ship column alone
  // and the pile's sizes are 0.
  rightWidth: number;
  pileCardWidth: number;
  pileCardHeight: number;
  // Whether the right part shows the pile: a planet mission only (#1235).
  hasPile: boolean;
  shipColumnWidth: number;
  shipScale: number;
  shipRows: number;
}

// The art crop of one card of the choice phase's stack (#1221): as tall as the zone below the line
// of the end labels, in the crop ratio of the placed-on column and the personnel rows, and no wider
// than the zone.
export function attemptStackCropSize(stackHeight: number, stackWidth: number): { stackCardWidth: number; stackCardHeight: number } {
  const heightRoom = Math.max(0, stackHeight - ATTEMPT_STACK_LABEL_HEIGHT);
  const stackCardWidth = Math.max(1, Math.min(stackWidth, Math.floor((heightRoom * TABLE_CARD_WIDTH) / TABLE_CARD_ART_HEIGHT)));
  const stackCardHeight = Math.max(1, Math.min(heightRoom, attemptPersonnelCropHeight(stackCardWidth)));
  return { stackCardWidth, stackCardHeight };
}

// Pure, like `computeAttemptLayout`, with the same inputs, and the facing sizes for them, whose
// `missionScale` and `columnHeight` it keeps.
export function computeAttemptChoiceLayout(
  gameLayerWidth: number,
  availableHeight: number,
  desktop: boolean,
  shipCount: number,
  floorScale: number,
  face: AttemptLayoutSizes,
  // Whether the attempt is at a space mission; at a planet mission the pile is a stack card (#1222).
  space: boolean,
): AttemptChoiceSizes {
  const { missionScale, columnHeight } = face;
  const floor = Math.min(Math.max(1, floorScale), missionScale);
  const missionWidth = Math.round(TABLE_CARD_WIDTH * missionScale);
  // The column of the placed cards (#1180) keeps the facing phase's width, and the stack gives it up.
  const placedOnRoom = face.placedOnWidth > 0 ? face.placedOnWidth + ATTEMPT_GAP : 0;
  // The space outside both ends of the stack (#1220) comes out of the stack's width.
  const availableWidth =
    gameLayerWidth - CONTENT_PADDING - MENU_BUTTON_GUTTER - 2 * ATTEMPT_GAP - 2 * ATTEMPT_STACK_SIDE_GAP - placedOnRoom;

  const shipLine = shipRowLineHeight(floor, desktop);
  const stackHeight = missionCardHeight(missionScale, true);

  if (!space) {
    // A planet mission (#1222): the pile is a crop of the card back the size of a stack card, and the
    // ships stand in a column of their own right of it, one ship wide, top-aligned, in the rows that
    // fit the whole height. The stack card takes its width from the height, and when the stack would
    // not hold 3 cards of that width edge to edge beside a pile as wide, the stack cards and the pile
    // shrink together to the width there is.
    const shipColumnWidth = shipRowWidth(floor, 1);
    const pairRoom = availableWidth - missionWidth - ATTEMPT_GAP - shipColumnWidth;
    const fromHeight = attemptStackCropSize(stackHeight, Infinity).stackCardWidth;
    const { stackCardWidth, stackCardHeight } = attemptStackCropSize(
      stackHeight,
      Math.max(1, Math.min(fromHeight, Math.floor(pairRoom / 4))),
    );
    const rightWidth = stackCardWidth + ATTEMPT_GAP + shipColumnWidth;
    const rowsFitting = Math.max(1, Math.floor((columnHeight + SHIP_ROW_GAP) / (shipLine + SHIP_ROW_GAP)));
    const rowsNeeded = Math.max(1, Math.ceil(shipCount / shipsPerRow(floor, shipColumnWidth)));
    return {
      missionScale,
      stackWidth: Math.max(stackCardWidth, Math.floor(availableWidth - missionWidth - rightWidth)),
      stackHeight,
      stackCardWidth,
      stackCardHeight,
      rightWidth,
      pileCardWidth: stackCardWidth,
      pileCardHeight: stackCardHeight,
      hasPile: true,
      shipColumnWidth,
      shipScale: floor,
      shipRows: Math.min(rowsNeeded, rowsFitting),
    };
  }

  // A space mission: no pile (#1235). The right column holds only the ships, one to a row, in the
  // rows that fit the whole height.
  const rightWidth = shipRowWidth(floor, 1);
  const rowsFitting = Math.max(1, Math.floor((columnHeight + SHIP_ROW_GAP) / (shipLine + SHIP_ROW_GAP)));
  const rowsNeeded = Math.max(1, Math.ceil(shipCount / shipsPerRow(floor, rightWidth)));

  // The stack: every width the mission, the right column and the space outside its ends leave, as tall as the mission card. Its
  // cards are art crops (#1221) and take the height the line of the end labels leaves, no wider than
  // lets 3 of them sit edge to edge (#1220).
  const stackWidth = Math.max(1, Math.floor(availableWidth - missionWidth - rightWidth));
  const { stackCardWidth, stackCardHeight } = attemptStackCropSize(stackHeight, Math.max(1, Math.floor(stackWidth / 3)));
  return {
    missionScale,
    stackWidth,
    stackHeight,
    stackCardWidth,
    stackCardHeight,
    rightWidth,
    pileCardWidth: 0,
    pileCardHeight: 0,
    hasPile: false,
    shipColumnWidth: rightWidth,
    shipScale: floor,
    shipRows: Math.min(rowsNeeded, rowsFitting),
  };
}

// Measures the attempt layout with a `ResizeObserver`, the same way `useMissionScale` measures the
// mission row: the available height runs from the bottom of the strip to the top of the bottom row.
// The floor is the scale the mission row would draw at in the same space, from the top of the
// layout. Before the elements mount, and in jsdom, it returns the sizes at `scale`. It returns the
// sizes of both phases (#1190), so a change of phase needs no new measure.
export type AttemptSizes = AttemptLayoutSizes & { choice: AttemptChoiceSizes };

export function useAttemptLayout(
  desktop: boolean,
  scale: number,
  gameLayer: HTMLElement | null,
  layout: HTMLElement | null,
  strip: HTMLElement | null,
  bottomRow: HTMLElement | null,
  shipCount: number,
  personnel: AttemptPersonnel | undefined,
  // Whether any card is placed on the attempted mission, which gives it the column (#1180).
  placedOn: boolean,
  desktopColumnHeight: (scale: number) => number,
  touchColumnHeight: (scale: number) => number,
): AttemptSizes {
  // The measure, with the elements it was measured for, as in `useMissionScale`: the attempt layout
  // mounts many times in one game, and each mount starts from the fallback.
  const [measured, setMeasured] = useState<{ value: AttemptSizes; elements: readonly HTMLElement[] } | null>(null);
  const personnelCount = personnel?.count;
  const personnelSpace = personnel?.space;

  useEffect(() => {
    const personnel =
      personnelCount === undefined ? undefined : { count: personnelCount, space: personnelSpace ?? false };
    if (!gameLayer || !layout || !strip || !bottomRow) return;
    const elements = [gameLayer, layout, strip, bottomRow];
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
      const face = computeAttemptLayout(
        gameLayer.clientWidth,
        availableHeight,
        desktop,
        shipCount,
        floor,
        personnel,
        placedOn,
        viewerCardSize(scale, desktop).width,
      );
      const choice = computeAttemptChoiceLayout(
        gameLayer.clientWidth,
        availableHeight,
        desktop,
        shipCount,
        floor,
        face,
        personnel?.space ?? false,
      );
      setMeasured({ value: { ...face, choice }, elements });
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
    placedOn,
    desktopColumnHeight,
    touchColumnHeight,
  ]);

  if (measured && measuredFor(measured.elements, [gameLayer, layout, strip, bottomRow])) return measured.value;
  // Before the measure, and in jsdom: the sizes at `scale`, with the personnel area 3 crew panel
  // cards wide and tall enough for all of them (#1218), and at a space mission a ships column as
  // wide as its one row of ships (#1365).
  const fallbackCardWidth = viewerCardSize(scale, desktop).width;
  const fallbackGrid = personnel
    ? attemptPersonnelGrid(personnel.count, fallbackCardWidth, Infinity)
    : { columns: 0, visibleRows: 0, width: 0, height: 0 };
  const personnelWidth = fallbackGrid.width;
  const shipRowsWidth = personnel?.space
    ? Math.min(Math.round(TABLE_CARD_WIDTH * scale), shipRowWidth(scale, Math.max(1, Math.min(shipCount, shipsPerRow(scale)))))
    : Math.max(shipRowWidth(scale, 2), personnelWidth);
  const shipsWidth = personnel?.space ? shipRowsWidth + ATTEMPT_GAP + personnelWidth : shipRowsWidth;
  const stackHeight = missionCardHeight(scale, true);
  const { stackCardWidth, stackCardHeight } = attemptStackCropSize(stackHeight, Infinity);
  const facingStack = attemptFacingStackSize(scale, Infinity);
  return {
    columnHeight: Infinity,
    missionScale: scale,
    shipScale: scale,
    shipRows: 1,
    shipsWidth,
    shipRowsWidth,
    personnelCardWidth: fallbackCardWidth,
    personnelColumns: fallbackGrid.columns,
    personnelVisibleRows: fallbackGrid.visibleRows,
    personnelWidth,
    personnelHeight: fallbackGrid.height,
    placedOnWidth: placedOn ? attemptPlacedOnWidth(scale) : 0,
    ...facingStack,
    choice: {
      missionScale: scale,
      stackWidth: 3 * stackCardWidth,
      stackHeight,
      stackCardWidth,
      stackCardHeight,
      ...(personnel?.space
        ? {
            rightWidth: shipRowWidth(scale, 1),
            pileCardWidth: 0,
            pileCardHeight: 0,
            hasPile: false,
            shipColumnWidth: shipRowWidth(scale, 1),
          }
        : {
            rightWidth: stackCardWidth + ATTEMPT_GAP + shipRowWidth(scale, 1),
            pileCardWidth: stackCardWidth,
            pileCardHeight: stackCardHeight,
            hasPile: true,
            shipColumnWidth: shipRowWidth(scale, 1),
          }),
      shipScale: scale,
      shipRows: 1,
    },
  };
}

import {
  ATTEMPT_GAP,
  ATTEMPT_STACK_LABEL_HEIGHT,
  ATTEMPT_STACK_SIDE_GAP,
  ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
  attemptPersonnelButtonsInBand,
  ATTEMPT_PERSONNEL_GAP,
  ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH,
  ATTEMPT_STACK_SLIVER_ROOM,
  ATTEMPT_STRIP_HEIGHT,
  attemptFloorScale,
  attemptPersonnelCardWidth,
  attemptPersonnelWidth,
  AttemptLayoutSizes,
  DESKTOP_RESERVED_SHIP_ROWS,
  attemptMissionColumnHeight,
  computeAttemptChoiceLayout,
  computeAttemptLayout,
  computeDesktopTableScale,
  computeShipRowCount,
  computeTableScale,
  computeTouchMissionScale,
  TOUCH_CONTROLS_COLUMN,
  desktopMissionSlotBudget,
  fitColumnScale,
  MIN_SCREEN,
  TOUCH_RESERVED_SHIP_ROWS,
  attemptPersonnelCropHeight,
  attemptPersonnelGrid,
} from '../../../app/decks/practice/tableScale';
import {
  badgeStripHeight,
  missionCardHeight,
  missionColumnHeight,
  shipCardWidth,
  shipRowLineHeight,
  shipRowWidth,
  shipsPerRow,
  underMissionStackRoom,
} from '../../../app/decks/practice/MissionRow';
import { offsetFor } from '../../../app/decks/practice/overlapOffset';
import { fullCardHeight } from '../../../app/decks/practice/TableCard';
import { viewerCardSize } from '../../../app/decks/practice/viewerCardSize';

// #630: the dilemma stack's own reserved column widens computeTableScale's width budget from 5
// mission columns and 4 gaps to 6 columns (the stack's own) and 5 gaps.
describe('computeTableScale (#630)', () => {
  it('still returns 1 at the 568x320 acceptance-check viewport', () => {
    expect(computeTableScale(568, 320)).toBe(1);
  });

  it('returns 375/320 at the 667x375 minimum screen, an iPhone SE (2nd generation)', () => {
    expect(MIN_SCREEN).toEqual({ width: 667, height: 375 });
    expect(computeTableScale(MIN_SCREEN.width, MIN_SCREEN.height)).toBeCloseTo(375 / 320, 5);
  });

  it('bounds the scale by the widened width budget once width is the tighter constraint', () => {
    // availableWidth = gameLayerWidth - 32 (padding) - 8 * 5 (five gaps between six columns)
    // widthScale = availableWidth / (72 * 6)
    // A tall viewport makes height's own scale (20) far exceed width's, so width wins; the
    // result must stay above 1 here too, or the "widthScale reflects the extra column and gap"
    // assertion below would be masked by computeTableScale's own floor of 1.
    const gameLayerWidth = 936;
    const gameLayerHeight = 6400; // heightScale = 20
    const expectedAvailableWidth = 936 - 32 - 8 * 5;
    const expectedWidthScale = expectedAvailableWidth / (72 * 6);
    expect(expectedWidthScale).toBeGreaterThan(1);
    expect(computeTableScale(gameLayerWidth, gameLayerHeight)).toBeCloseTo(expectedWidthScale, 5);
  });

  // #1383: the bottom row rises by the bottom safe-area inset, so the scale measures the safe height.
  it('measures the height above the bottom safe-area inset', () => {
    expect(computeTableScale(1024, 700, 0)).toBe(computeTableScale(1024, 700));
    expect(computeTableScale(1024, 700, 34)).toBe(computeTableScale(1024, 666));
    expect(computeTableScale(1024, 700, 34)).toBeLessThan(computeTableScale(1024, 700));
  });
});

// #930: one more row of ships costs one ship card's art height plus the gap between two rows.
describe('computeShipRowCount (#930)', () => {
  const rowHeight = 32;
  const rowGap = 4;

  it('keeps one row with no spare height, or a table that already overflows', () => {
    expect(computeShipRowCount(0, rowHeight, rowGap)).toBe(1);
    expect(computeShipRowCount(35, rowHeight, rowGap)).toBe(1);
    expect(computeShipRowCount(-50, rowHeight, rowGap)).toBe(1);
  });

  it('takes a second row once the free height fits one more row and its gap', () => {
    expect(computeShipRowCount(36, rowHeight, rowGap)).toBe(2);
    expect(computeShipRowCount(71, rowHeight, rowGap)).toBe(2);
  });

  it('takes a third row past twice that, and never more than 3', () => {
    expect(computeShipRowCount(72, rowHeight, rowGap)).toBe(3);
    expect(computeShipRowCount(1000, rowHeight, rowGap)).toBe(3);
  });
});

// #992: the desktop cards grow into a large gap above the bottom row.
describe('computeDesktopTableScale (#992)', () => {
  const column = (scale: number) => missionColumnHeight(scale, true, 2);

  it('grows the cards until the column fills the height above the bottom row', () => {
    const scale = computeDesktopTableScale(3000, 600, column);
    expect(scale).toBeGreaterThan(2);
    expect(column(scale)).toBeLessThanOrEqual(600);
    expect(column(scale + 0.01)).toBeGreaterThan(600);
  });

  it('stops at the width of five missions, with no dilemma stack in the row (#1170)', () => {
    // #1060: each slot reserves the width of a turned mission, 100 px at scale 1, not 72.
    // (1500 - 32 padding - 4 gaps of 8) / (5 * 100)
    expect(computeDesktopTableScale(1500, 5000, column)).toBeCloseTo((1500 - 32 - 32) / 500, 5);
  });

  it('draws the missions larger than with the dilemma stack in the row, or the same where height binds (#1170)', () => {
    // The budget before #1170: 5 gaps of 8 and the 112 px desktop dilemma stack.
    const withStack = (width: number, height: number) =>
      fitColumnScale((width - 32 - 40 - 112) / 5 / 100, height, column);
    expect(computeDesktopTableScale(1440, 5000, column)).toBeGreaterThan(withStack(1440, 5000));
    expect(desktopMissionSlotBudget(1440)).toBeCloseTo((1440 - 32 - 32) / 5, 5);
    // Where the height binds, the scale stays the same.
    expect(computeDesktopTableScale(1440, 400, column)).toBeCloseTo(withStack(1440, 400), 5);
    expect(computeDesktopTableScale(1440, 400, column)).toBeLessThan((1440 - 32 - 32) / 500);
  });

  it('stays at 1 when the wider slots do not fit at scale 1 (#1060)', () => {
    // Five 72 px slots fit 500 px, five 100 px slots do not.
    expect(desktopMissionSlotBudget(500)).toBeCloseTo((500 - 32 - 32) / 5, 5);
    expect(computeDesktopTableScale(500, 5000, column)).toBe(1);
  });

  it('never goes below 1', () => {
    expect(computeDesktopTableScale(3000, 100, column)).toBe(1);
    expect(computeDesktopTableScale(400, 5000, column)).toBe(1);
  });
});

// The touch missions and ships grow into the gap above the bottom row too, now that the minimum
// screen is 667x375 (`MIN_SCREEN`).
describe('computeTouchMissionScale', () => {
  const column = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const minTableScale = computeTableScale(MIN_SCREEN.width, MIN_SCREEN.height);

  it('makes the missions larger than the table scale at the minimum screen', () => {
    // A 375 px table leaves about 250 px above the bottom row.
    const scale = computeTouchMissionScale(MIN_SCREEN.width, 250, column, minTableScale);
    expect(scale).toBeGreaterThan(minTableScale * 1.1);
  });

  it('stops at the width of five art crops, clear of the menu buttons, with no dilemma stack (#1170)', () => {
    // (667 - 32 padding - 2 * 20 menu button gutter - 4 gaps of 8) / (5 * 72)
    expect(computeTouchMissionScale(MIN_SCREEN.width, 5000, column, 1)).toBeCloseTo((667 - 32 - 40 - 32) / 360, 5);
  });

  it('draws the missions larger at the minimum screen than with the dilemma stack in the row (#1170)', () => {
    // The budget before #1170: 5 gaps of 8 and the 56 px dilemma stack.
    const withStack = (height: number) =>
      Math.max(minTableScale, fitColumnScale((667 - 32 - 40 - 40 - 56) / 360, height, column));
    // A 375 px table leaves about 250 px above the bottom row.
    expect(computeTouchMissionScale(MIN_SCREEN.width, 250, column, minTableScale)).toBeGreaterThan(withStack(250));
    // Where the height binds, the scale stays the same.
    expect(computeTouchMissionScale(MIN_SCREEN.width, 150, column, minTableScale)).toBeCloseTo(withStack(150), 5);
  });

  it('keeps a 105 px mission at the minimum screen with the turn and score column reserved (#1337)', () => {
    // (667 - 32 padding - 56 controls column - 20 menu button gutter - 4 gaps of 8) / (5 * 72)
    const scale = computeTouchMissionScale(MIN_SCREEN.width, 5000, column, 1, TOUCH_CONTROLS_COLUMN);
    expect(scale).toBeCloseTo((667 - 32 - 56 - 20 - 32) / 360, 5);
    // The width of a mission before the counters left the bottom row, measured at 667x375.
    expect(scale * 72).toBeGreaterThanOrEqual(105);
  });

  it('grows until the column with two rows of ships fills the height', () => {
    const scale = computeTouchMissionScale(3000, 300, column, 1);
    expect(column(scale)).toBeLessThanOrEqual(300);
    expect(column(scale + 0.01)).toBeGreaterThan(300);
  });

  it('never goes below the table scale', () => {
    expect(computeTouchMissionScale(MIN_SCREEN.width, 100, column, minTableScale)).toBe(minTableScale);
    expect(computeTouchMissionScale(400, 5000, column, 1.3)).toBe(1.3);
  });
});

// Issue #1384: the content column pads itself by the left and the right safe-area insets, so the
// width math reserves them, and at insets 0 nothing changes.
describe('the side safe-area insets (#1384)', () => {
  const column = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const desktopColumn = (scale: number) => missionColumnHeight(scale, true, DESKTOP_RESERVED_SHIP_ROWS);

  it('computeTouchMissionScale with insets 0 equals the result without them', () => {
    for (const [width, height] of [[MIN_SCREEN.width, 250], [812, 260], [1280, 600]]) {
      expect(computeTouchMissionScale(width, height, column, 1, TOUCH_CONTROLS_COLUMN, 0)).toBe(
        computeTouchMissionScale(width, height, column, 1, TOUCH_CONTROLS_COLUMN),
      );
    }
  });

  it('computeTouchMissionScale reserves left 47 and right 47 at 812x375', () => {
    const withInsets = computeTouchMissionScale(812, 5000, column, 1, TOUCH_CONTROLS_COLUMN, 94);
    expect(withInsets).toBe(computeTouchMissionScale(812 - 94, 5000, column, 1, TOUCH_CONTROLS_COLUMN));
    // (812 - 94 insets - 32 padding - 56 controls column - 20 menu button gutter - 4 gaps of 8) / (5 * 72)
    expect(withInsets).toBeCloseTo((812 - 94 - 32 - 56 - 20 - 32) / 360, 5);
    expect(withInsets).toBeLessThan(computeTouchMissionScale(812, 5000, column, 1, TOUCH_CONTROLS_COLUMN));
  });

  it('computeTableScale, desktopMissionSlotBudget and computeDesktopTableScale reserve them too', () => {
    expect(computeTableScale(812, 375, 21, 0)).toBe(computeTableScale(812, 375, 21));
    expect(computeTableScale(1400, 2000, 0, 94)).toBe(computeTableScale(1400 - 94, 2000));
    expect(desktopMissionSlotBudget(1280, 0)).toBe(desktopMissionSlotBudget(1280));
    expect(desktopMissionSlotBudget(1280, 94)).toBe(desktopMissionSlotBudget(1280 - 94));
    expect(computeDesktopTableScale(1280, 5000, desktopColumn, 94)).toBe(
      computeDesktopTableScale(1280 - 94, 5000, desktopColumn),
    );
  });
});

// Issue #1164: the attempt layout sizes the attempted mission, drawn whole, and the ships beside it
// from the space below its strip.
describe('computeAttemptLayout (#1164)', () => {
  const touchColumn = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const desktopColumn = (scale: number) => missionColumnHeight(scale, true, DESKTOP_RESERVED_SHIP_ROWS);
  const minTableScale = computeTableScale(MIN_SCREEN.width, MIN_SCREEN.height);
  // The width the layout's parts take: the padding, the menu gutter, the mission card, the ships
  // column, the dilemma stack and the two gaps.
  const usedWidth = (sizes: AttemptLayoutSizes) =>
    32 + 20 + Math.round(72 * sizes.missionScale) + sizes.shipsWidth + sizes.stackWidth + 2 * ATTEMPT_GAP;

  it('draws the mission larger than the mission row does at the minimum screen, and fits it', () => {
    // A 375 px table leaves about 250 px above the bottom row, and the strip and its gap take 52.
    const tableHeight = 250;
    const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const rowScale = computeTouchMissionScale(MIN_SCREEN.width, tableHeight, touchColumn, minTableScale);
    // The mission row's scale is too large for the whole card here (#1170), so the floor drops to
    // the largest scale that fits the height.
    const floor = attemptFloorScale(rowScale, available, minTableScale);
    expect(floor).toBeLessThan(rowScale);
    expect(floor).toBeGreaterThan(minTableScale);
    const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor);
    expect(sizes.missionScale).toBeGreaterThanOrEqual(floor);
    expect(attemptMissionColumnHeight(sizes.missionScale)).toBeLessThanOrEqual(available + 1);
    expect(usedWidth(sizes)).toBeLessThanOrEqual(MIN_SCREEN.width);
    // The whole card is taller than the art crop the mission row draws.
    expect(missionCardHeight(sizes.missionScale, true)).toBeGreaterThan(missionCardHeight(rowScale, false));
    expect(ATTEMPT_STRIP_HEIGHT).toBeGreaterThanOrEqual(60 - 16);
  });

  it('draws the mission larger than the desktop mission row does at 1440x900, and fits it', () => {
    const tableHeight = 700;
    const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
    const sizes = computeAttemptLayout(1440, available, true, 2, floor);
    expect(sizes.missionScale).toBeGreaterThan(floor);
    expect(attemptMissionColumnHeight(sizes.missionScale)).toBeLessThanOrEqual(available);
    expect(attemptMissionColumnHeight(sizes.missionScale + 0.01)).toBeGreaterThan(available);
    expect(usedWidth(sizes)).toBeLessThanOrEqual(1440);
  });

  it('never draws the mission or the ships below the floor, nor the ships above the mission', () => {
    for (const [width, height, ships] of [
      [MIN_SCREEN.width, 198, 6],
      [1440, 600, 0],
      [1440, 600, 12],
    ]) {
      const floor = 1.3;
      const sizes = computeAttemptLayout(width, height, width > 1000, ships, floor);
      expect(sizes.missionScale).toBeGreaterThanOrEqual(floor);
      expect(sizes.shipScale).toBeGreaterThanOrEqual(floor);
      expect(sizes.shipScale).toBeLessThanOrEqual(sizes.missionScale);
    }
  });

  // Issue #1203: the height wins over the floor.
  it('draws the mission below the floor when the whole card does not fit the height at it', () => {
    const sizes = computeAttemptLayout(MIN_SCREEN.width, 100, false, 1, 1.3);
    expect(sizes.missionScale).toBeLessThan(1.3);
    expect(attemptMissionColumnHeight(sizes.missionScale)).toBeLessThanOrEqual(100);
    expect(sizes.shipScale).toBeLessThanOrEqual(sizes.missionScale);
  });

  it('gives more ships more rows, as far as the height allows', () => {
    const one = computeAttemptLayout(1440, 600, true, 1, 1);
    const many = computeAttemptLayout(1440, 600, true, 12, 1);
    expect(one.shipRows).toBe(1);
    expect(many.shipRows).toBeGreaterThan(1);
    const shipsHeight = (s: AttemptLayoutSizes) =>
      badgeStripHeight(s.missionScale) + 4 + s.shipRows * shipRowLineHeight(s.shipScale, true) + (s.shipRows - 1) * 4;
    expect(shipsHeight(many)).toBeLessThanOrEqual(600);
  });

  // Issue #1165: the row of the attempting personnel, the 20 personnel of the fixture's away team.
  describe('the row of the attempting personnel (#1165)', () => {
    const tableHeight = 250;
    const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const floor = attemptFloorScale(
      computeTouchMissionScale(MIN_SCREEN.width, tableHeight, touchColumn, minTableScale),
      available,
      minTableScale,
    );
    // The rows the area's cards need, and the room a row of `columns` crops takes, its gaps too.
    const rowsNeeded = (sizes: AttemptLayoutSizes, count: number) => Math.ceil(count / sizes.personnelColumns);
    const rowWidth = (sizes: AttemptLayoutSizes) =>
      sizes.personnelColumns * sizes.personnelCardWidth + (sizes.personnelColumns - 1) * ATTEMPT_PERSONNEL_GAP;

    it('fits 20 away team cards at 667x375, clear of the dilemma stack, in rows that scroll', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 0, floor, { count: 20, space: false });
      expect(usedWidth(sizes)).toBeLessThanOrEqual(MIN_SCREEN.width);
      expect(sizes.personnelWidth).toBeLessThanOrEqual(sizes.shipsWidth);
      expect(rowWidth(sizes)).toBeLessThanOrEqual(sizes.personnelWidth);
      // The area and one line of ships fit the height below the strip; the buttons sit in the band
      // above the body (#1376).
      expect(sizes.personnelButtonsInBand).toBe(true);
      const middle = sizes.personnelHeight + 4 + sizes.shipRows * shipRowLineHeight(sizes.shipScale, false);
      expect(middle).toBeLessThanOrEqual(available);
      expect(rowsNeeded(sizes, 20)).toBeGreaterThan(sizes.personnelVisibleRows);
    });

    it('fits a crew of 12 beside the ships at a space mission', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, { count: 12, space: true });
      expect(usedWidth(sizes)).toBeLessThanOrEqual(MIN_SCREEN.width);
      expect(sizes.shipRowsWidth + ATTEMPT_GAP + sizes.personnelWidth).toBeLessThanOrEqual(sizes.shipsWidth);
      expect(sizes.shipScale).toBeGreaterThanOrEqual(floor);
      // The crew row starts at the top of the column, its buttons in the band above it (#1376).
      expect(sizes.personnelButtonsInBand).toBe(true);
      const middle = Math.max(sizes.personnelHeight, sizes.shipRows * shipRowLineHeight(sizes.shipScale, false));
      expect(underMissionStackRoom(sizes.missionScale, true) + middle).toBeLessThanOrEqual(available + 0.5);
    });

    // Issue #1180: the column of the cards placed on the mission, at the inputs of ?fixture=attempt.
    it('fits the column of the placed cards at 667x375, from the middle column and never below the floor', () => {
      const crew = { count: 12, space: true };
      const without = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, crew);
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, crew, true);
      expect(without.placedOnWidth).toBe(0);
      expect(sizes.placedOnWidth).toBe(shipCardWidth(floor));
      expect(sizes.missionScale).toBeGreaterThanOrEqual(floor);
      expect(usedWidth(sizes) + sizes.placedOnWidth + ATTEMPT_GAP).toBeLessThanOrEqual(MIN_SCREEN.width);
    });

    // Issue #1218: the mission grows only until the personnel area binds, so on a wide screen the
    // column of the placed cards takes its width from the mission, and the personnel keep theirs.
    it('takes the column from the mission on a wide screen, and leaves the personnel as they were', () => {
      const tableHeight = 700;
      const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
      const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
      const panel = viewerCardSize(1, true).width;
      const without = computeAttemptLayout(1440, available, true, 1, floor, { count: 2, space: true }, false, panel);
      const sizes = computeAttemptLayout(1440, available, true, 1, floor, { count: 2, space: true }, true, panel);
      expect(sizes.missionScale).toBeLessThan(without.missionScale);
      expect(sizes.missionScale).toBeGreaterThanOrEqual(floor);
      expect(sizes.personnelCardWidth).toBe(without.personnelCardWidth);
      expect(usedWidth(sizes) + sizes.placedOnWidth + ATTEMPT_GAP).toBeLessThanOrEqual(1440);
    });

    // Issue #1177: at a space mission the ships grow in one column as wide as the mission. Issue
    // #1365: the column then narrows to its widest row of ships.
    it('makes the ships column as wide as its one ship at 667x375, with the ship at the mission scale', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, { count: 12, space: true });
      expect(sizes.shipScale).toBe(sizes.missionScale);
      expect(sizes.shipRowsWidth).toBe(shipCardWidth(sizes.shipScale));
      expect(sizes.shipRowsWidth).toBeLessThan(Math.round(72 * sizes.missionScale));
      expect(usedWidth(sizes)).toBeLessThanOrEqual(MIN_SCREEN.width);
      expect(usedWidth(sizes)).toBeGreaterThan(MIN_SCREEN.width - 1);
    });

    it('gives a small crew on a wide screen the whole rest of the width, as more cards to a row (#1365)', () => {
      const tableHeight = 700;
      const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
      const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
      const sizes = computeAttemptLayout(1440, available, true, 1, floor, { count: 2, space: true });
      expect(sizes.shipRowsWidth).toBe(shipCardWidth(sizes.shipScale));
      expect(sizes.personnelWidth).toBeGreaterThan(attemptPersonnelWidth(sizes.personnelCardWidth));
      expect(sizes.personnelColumns).toBeGreaterThan(3);
      // A crew that fits one row has no peek of a second.
      expect(sizes.personnelVisibleRows).toBe(1);
      expect(sizes.personnelHeight).toBe(attemptPersonnelCropHeight(sizes.personnelCardWidth));
      expect(sizes.shipsWidth).toBe(sizes.shipRowsWidth + ATTEMPT_GAP + sizes.personnelWidth);
      expect(usedWidth(sizes)).toBeLessThanOrEqual(1440);
      expect(usedWidth(sizes)).toBeGreaterThan(1440 - 1);
    });

    it('fits many ships down a column as wide as its widest row, between the floor and the mission scale', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 6, floor, { count: 12, space: true });
      const perRow = Math.min(6, shipsPerRow(sizes.shipScale, Math.round(72 * sizes.missionScale)));
      expect(sizes.shipRowsWidth).toBe(shipRowWidth(sizes.shipScale, perRow));
      expect(shipsPerRow(sizes.shipScale, sizes.shipRowsWidth)).toBe(perRow);
      expect(sizes.shipScale).toBeGreaterThanOrEqual(floor);
      expect(sizes.shipScale).toBeLessThanOrEqual(sizes.missionScale);
      const ships = sizes.shipRows * shipRowLineHeight(sizes.shipScale, false) + (sizes.shipRows - 1) * 4;
      expect(ships).toBeLessThanOrEqual(sizes.columnHeight);
    });

    it('takes all the planet column but one line of ships for the area, its buttons in the band above (#1376)', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 5, floor, { count: 40, space: false });
      expect(sizes.personnelButtonsInBand).toBe(true);
      const room = sizes.columnHeight - 4 - shipRowLineHeight(floor, false);
      expect(sizes.personnelHeight).toBeLessThanOrEqual(room);
      // The area fills the height it has, not only whole rows (#1218).
      expect(sizes.personnelHeight).toBe(Math.floor(room));
      expect(sizes.shipRows).toBe(1);
    });
  });

  describe('attemptPersonnelGrid (#1205, #1218)', () => {
    const crop = attemptPersonnelCropHeight(40);
    const width = 3 * 40 + 2 * ATTEMPT_PERSONNEL_GAP + ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH;

    it('holds 3 crops to a row, and is as tall as its rows when they fit the height', () => {
      expect(attemptPersonnelGrid(5, 40, 1000)).toEqual({ columns: 3, visibleRows: 2, width, height: 2 * crop + 8 });
    });

    it('stays 3 crops wide with fewer cards', () => {
      expect(attemptPersonnelGrid(1, 40, 1000)).toEqual({ columns: 3, visibleRows: 1, width, height: crop });
      expect(attemptPersonnelGrid(2, 40, 1000).width).toBe(width);
    });

    it('fills the height it has, and counts a row that shows in part', () => {
      const grid = attemptPersonnelGrid(12, 40, crop + 8 + 10);
      expect(grid.height).toBe(crop + 8 + 10);
      expect(grid.visibleRows).toBe(2);
    });

    it('shows at least 1 row', () => {
      expect(attemptPersonnelGrid(8, 40, 10).visibleRows).toBe(1);
    });
  });

  describe('attemptPersonnelCardWidth (#1218)', () => {
    it('keeps the peek of the second row in the height when the cards need more than one row', () => {
      for (const room of [60, 98, 124, 300]) {
        const width = attemptPersonnelCardWidth(12, room, 1000);
        const crop = attemptPersonnelCropHeight(width);
        expect(crop + ATTEMPT_PERSONNEL_GAP + 0.25 * crop).toBeLessThanOrEqual(room);
        const wider = attemptPersonnelCropHeight(width + 1);
        expect(wider + ATTEMPT_PERSONNEL_GAP + 0.25 * wider).toBeGreaterThan(room);
      }
    });

    it('needs no peek for one row', () => {
      const width = attemptPersonnelCardWidth(3, 98, 1000);
      expect(attemptPersonnelCropHeight(width)).toBeLessThanOrEqual(98);
      expect(attemptPersonnelCropHeight(width + 1)).toBeGreaterThan(98);
    });

    it('is never wider than the most it is given', () => {
      expect(attemptPersonnelCardWidth(12, 1000, 127)).toBe(127);
    });
  });
});

// Issue #1218: in the facing phase the stack is one card and its slivers, and the personnel get 3
// cards to a row, as wide as the crew panel's where the screen has the room, with the peek of a
// second row, and the mission grows only while the personnel keep that width.
describe('the personnel and the stack of the facing phase (#1218)', () => {
  const touchColumn = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const desktopColumn = (scale: number) => missionColumnHeight(scale, true, DESKTOP_RESERVED_SHIP_ROWS);
  const buttonsRoom = 4 + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT;
  // The table heights: the 218 px the browser measures at 667x375 below a bottom row about 125 px
  // tall, and the 250 px of the other tests.
  const screens = [
    { name: '667x375', width: MIN_SCREEN.width, height: MIN_SCREEN.height, tableHeight: 218, desktop: false },
    { name: '667x375, 250 px tall', width: MIN_SCREEN.width, height: MIN_SCREEN.height, tableHeight: 250, desktop: false },
    { name: '1024x768', width: 1024, height: 768, tableHeight: 768 - 32 - 160, desktop: false },
    { name: '1920x1080', width: 1920, height: 1080, tableHeight: 1080 - 32 - 200, desktop: false },
    { name: 'a desktop at 1024x768', width: 1024, height: 768, tableHeight: 768 - 32 - 125, desktop: true },
    { name: 'a desktop at 1440x900', width: 1440, height: 900, tableHeight: 900 - 32 - 125, desktop: true },
    { name: 'a desktop at 1920x1080', width: 1920, height: 1080, tableHeight: 1080 - 32 - 125, desktop: true },
  ];
  const cases = [
    { name: 'a planet mission with an away team of 20', ships: 0, personnel: { count: 20, space: false }, placedOn: false },
    { name: 'a space mission with a crew of 12', ships: 1, personnel: { count: 12, space: true }, placedOn: false },
    { name: 'a space mission with a crew of 12 and placed cards', ships: 1, personnel: { count: 12, space: true }, placedOn: true },
    { name: 'a space mission with a crew of 2', ships: 1, personnel: { count: 2, space: true }, placedOn: false },
  ];

  for (const screen of screens) {
    const tableScale = screen.desktop ? 1 : computeTableScale(screen.width, screen.height);
    const available = screen.tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const rowScale = screen.desktop
      ? computeDesktopTableScale(screen.width, screen.tableHeight, desktopColumn)
      : computeTouchMissionScale(screen.width, screen.tableHeight, touchColumn, tableScale);
    const floor = attemptFloorScale(rowScale, available, tableScale);
    const panel = viewerCardSize(computeTableScale(screen.width, screen.height), screen.desktop).width;

    it.each(cases)(`lays out $name on ${screen.name}`, ({ ships, personnel, placedOn }) => {
      const sizes = computeAttemptLayout(screen.width, available, screen.desktop, ships, floor, personnel, placedOn, panel);
      // At least 3 cards to a row, as many as fit the area (#1365), never wider than the crew panel's.
      const columns = sizes.personnelColumns;
      expect(columns).toBeGreaterThanOrEqual(3);
      expect(sizes.personnelCardWidth).toBeLessThanOrEqual(panel);
      const rowWidth = (n: number) => n * sizes.personnelCardWidth + (n - 1) * 8 + ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH;
      expect(rowWidth(columns)).toBeLessThanOrEqual(sizes.personnelWidth);
      expect(rowWidth(columns + 1)).toBeGreaterThan(sizes.personnelWidth);
      // The peek: at least a quarter of a card of the second row when the cards do not all fit.
      const crop = attemptPersonnelCropHeight(sizes.personnelCardWidth);
      if (personnel.count > columns) {
        expect(sizes.personnelHeight).toBeGreaterThanOrEqual(crop + 8 + 0.25 * crop - 1);
        expect(sizes.personnelVisibleRows).toBeGreaterThanOrEqual(2);
      } else {
        expect(sizes.personnelHeight).toBe(crop);
      }
      // The stack is at most 1.2 times its top card.
      expect(sizes.stackWidth).toBeLessThanOrEqual(1.2 * sizes.stackCardWidth);
      expect(sizes.stackWidth).toBe(sizes.stackCardWidth + Math.min(ATTEMPT_STACK_SLIVER_ROOM, Math.floor(0.2 * sizes.stackCardWidth)));
      // The widths fit the game layer.
      const used =
        32 + 20 + Math.round(72 * sizes.missionScale) +
        (sizes.placedOnWidth > 0 ? sizes.placedOnWidth + ATTEMPT_GAP : 0) +
        sizes.shipsWidth + sizes.stackWidth + 2 * ATTEMPT_GAP;
      // They fill it, so the mission and the stack sit at the edges (#1365).
      expect(used).toBeLessThanOrEqual(screen.width);
      expect(used).toBeGreaterThan(screen.width - 1);
      // At a space mission the ships column is no wider than its row of 1 ship (#1365).
      if (personnel.space) expect(sizes.shipRowsWidth).toBe(shipCardWidth(sizes.shipScale));
      // The heights fit below the slivers' room; a space mission has no away team badge (#1365).
      const shipsHeight = sizes.shipRows * shipRowLineHeight(sizes.shipScale, screen.desktop) + (sizes.shipRows - 1) * 4;
      const buttons = sizes.personnelButtonsInBand ? 0 : buttonsRoom;
      const middle = personnel.space
        ? Math.max(buttons + sizes.personnelHeight, shipsHeight)
        : buttons + sizes.personnelHeight + 4 + shipsHeight;
      expect(underMissionStackRoom(sizes.missionScale, true) + middle).toBeLessThanOrEqual(available + 0.5);
      expect(sizes.missionScale).toBeGreaterThanOrEqual(Math.min(floor, sizes.missionScale));
      // The choice phase keeps the mission's scale and fits the width.
      const choice = computeAttemptChoiceLayout(screen.width, available, screen.desktop, ships, floor, sizes, personnel.space);
      expect(choice.missionScale).toBe(sizes.missionScale);
      expect(
        32 + 20 + Math.round(72 * choice.missionScale) +
          (sizes.placedOnWidth > 0 ? sizes.placedOnWidth + ATTEMPT_GAP : 0) +
          choice.stackWidth + 2 * ATTEMPT_STACK_SIDE_GAP + choice.rightWidth + 2 * ATTEMPT_GAP,
      ).toBeLessThanOrEqual(screen.width);
    });
  }

  it('gives the cards the width of the crew panel where the screen has the room', () => {
    const tableHeight = 900 - 32 - 125;
    const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
    const panel = viewerCardSize(computeTableScale(1440, 900), true).width;
    expect(panel).toBe(170);
    for (const personnel of [{ count: 20, space: false }, { count: 12, space: true }]) {
      expect(computeAttemptLayout(1440, available, true, 1, floor, personnel, false, panel).personnelCardWidth).toBe(panel);
    }
  });

  it('stops the mission growing where its growth would take the width the personnel need', () => {
    const tableHeight = 900 - 32 - 125;
    const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
    const crew = { count: 12, space: true };
    const sizes = computeAttemptLayout(1440, available, true, 1, floor, crew, false, 170);
    const smallCards = computeAttemptLayout(1440, available, true, 1, floor, crew, false, 100);
    expect(sizes.personnelCardWidth).toBe(170);
    expect(smallCards.missionScale).toBeGreaterThan(sizes.missionScale);
    expect(sizes.missionScale).toBeGreaterThanOrEqual(floor);
  });

  it('shrinks the cards to the width there is when the floor leaves too little, and keeps at least 3 to a row', () => {
    const tableHeight = 768 - 32 - 160;
    const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const tableScale = computeTableScale(1024, 768);
    const floor = attemptFloorScale(computeTouchMissionScale(1024, tableHeight, touchColumn, tableScale), available, tableScale);
    const panel = viewerCardSize(tableScale).width;
    const sizes = computeAttemptLayout(1024, available, false, 1, floor, { count: 12, space: true }, true, panel);
    expect(sizes.personnelCardWidth).toBeLessThan(panel);
    expect(sizes.personnelColumns).toBeGreaterThanOrEqual(3);
    expect(sizes.missionScale).toBeCloseTo(floor, 5);
    const used =
      32 + 20 + Math.round(72 * sizes.missionScale) + sizes.placedOnWidth + ATTEMPT_GAP + sizes.shipsWidth + sizes.stackWidth + 2 * ATTEMPT_GAP;
    expect(used).toBeLessThanOrEqual(1024);
    expect(used + 3).toBeGreaterThan(1024);
  });
});

// Issue #1208: the dilemma stack of the facing phase draws a whole top card beside the slivers of
// the cards behind it. Issue #1218: it is no wider than that.
describe('the facing stack (#1208)', () => {
  const touchColumn = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const screens = [
    { width: MIN_SCREEN.width, height: MIN_SCREEN.height, tableHeight: 250 },
    { width: 1133, height: 744, tableHeight: 600 },
  ];
  const cases = [
    { personnel: { count: 12, space: true }, placedOn: true },
    { personnel: { count: 20, space: false }, placedOn: false },
  ];
  for (const screen of screens) {
    const tableScale = computeTableScale(screen.width, screen.height);
    const available = screen.tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const floor = attemptFloorScale(
      computeTouchMissionScale(screen.width, screen.tableHeight, touchColumn, tableScale),
      available,
      tableScale,
    );
    for (const { personnel, placedOn } of cases) {
      const label = `${screen.width}x${screen.height}, ${personnel.space ? 'a space' : 'a planet'} mission`;
      const sizes = computeAttemptLayout(screen.width, available, false, 1, floor, personnel, placedOn, viewerCardSize(tableScale).width);

      it(`draws a whole top card no taller than the zone, beside the slivers, at ${label}`, () => {
        expect(sizes.stackHeight).toBeLessThanOrEqual(sizes.columnHeight);
        expect(sizes.stackHeight).toBeLessThanOrEqual(missionCardHeight(sizes.missionScale, true));
        expect(Math.round((sizes.stackCardWidth * 167) / 120)).toBeLessThanOrEqual(sizes.stackHeight + 1);
        // The card is as tall as the zone: a 120×167 card, not 72 wide.
        expect(sizes.stackCardWidth).toBe(Math.floor((sizes.stackHeight * 120) / 167));
        expect(sizes.stackWidth - sizes.stackCardWidth).toBeLessThanOrEqual(ATTEMPT_STACK_SLIVER_ROOM);
        expect(sizes.stackWidth).toBeLessThanOrEqual(1.2 * sizes.stackCardWidth);
      });
    }
  }
});

describe('computeAttemptChoiceLayout (#1190)', () => {
  const touchColumn = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const minTableScale = computeTableScale(MIN_SCREEN.width, MIN_SCREEN.height);
  const tableHeight = 250;
  const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
  const floor = attemptFloorScale(
    computeTouchMissionScale(MIN_SCREEN.width, tableHeight, touchColumn, minTableScale),
    available,
    minTableScale,
  );

  it.each([
    ['a planet mission with an away team of 20', 0, { count: 20, space: false }],
    ['a space mission with 1 ship and a crew of 12', 1, { count: 12, space: true }],
  ])('fits the minimum screen at %s, with the mission at the facing scale', (_name, ships, personnel) => {
    const face = computeAttemptLayout(MIN_SCREEN.width, available, false, ships, floor, personnel);
    const choice = computeAttemptChoiceLayout(MIN_SCREEN.width, available, false, ships, floor, face, personnel.space);
    expect(choice.missionScale).toBe(face.missionScale);
    const missionWidth = Math.round(72 * choice.missionScale);
    // The padding, the menu gutter, the mission, the stack, the space outside its ends (#1220), the
    // right column and the two gaps.
    const used = 32 + 20 + missionWidth + choice.stackWidth + 2 * ATTEMPT_STACK_SIDE_GAP + choice.rightWidth + 2 * ATTEMPT_GAP;
    expect(used).toBeLessThanOrEqual(MIN_SCREEN.width);
    expect(attemptMissionColumnHeight(choice.missionScale)).toBeLessThanOrEqual(available + 1);
    // The rows of ships fit the height below the slivers' room: alone at a space mission (#1235),
    // beside the pile at a planet mission (#1222).
    const shipsHeight = choice.shipRows * shipRowLineHeight(choice.shipScale, false);
    const right = personnel.space ? shipsHeight : Math.max(choice.stackHeight, shipsHeight);
    expect(right).toBeLessThanOrEqual(available - underMissionStackRoom(choice.missionScale, true));
    // The stack is wider than the facing phase's fan, and its cards are art crops (#1221), as tall as
    // the zone below the end labels allows.
    expect(choice.stackWidth).toBeGreaterThan(56);
    expect(choice.stackCardWidth).toBeLessThanOrEqual(choice.stackWidth);
    expect(choice.stackCardHeight).toBe(attemptPersonnelCropHeight(choice.stackCardWidth));
    expect(ATTEMPT_STACK_LABEL_HEIGHT + choice.stackCardHeight).toBeLessThanOrEqual(choice.stackHeight);
    // At a planet mission the pile is as wide as a stack card (#1222), so there the width can bind
    // first: the stack and the pile then hold 4 cards edge to edge. At a space mission the width binds
    // when 3 cards as tall as the zone allows would not sit edge to edge beside the space outside the
    // stack's ends (#1220).
    if (personnel.space) {
      expect(
        ATTEMPT_STACK_LABEL_HEIGHT + choice.stackCardHeight > choice.stackHeight - 2 ||
          choice.stackCardWidth === Math.floor(choice.stackWidth / 3),
      ).toBe(true);
    } else {
      expect(choice.stackWidth + choice.pileCardWidth).toBeLessThan(4 * (choice.stackCardWidth + 1));
    }
    expect(choice.stackHeight).toBe(missionCardHeight(choice.missionScale, true));
    // 3 dilemmas sit edge to edge, every one readable.
    expect(offsetFor(3, choice.stackCardWidth, choice.stackWidth, choice.stackCardWidth)).toBe(choice.stackCardWidth);
  });

  // Issue #1222: at a planet mission the pile is the size of a stack card, and the ships stand in a
  // column of their own right of it.
  it.each([0, 1, 5])('gives the pile the size of a stack card at a planet mission with %i ships', (ships) => {
    const personnel = { count: 20, space: false };
    const face = computeAttemptLayout(MIN_SCREEN.width, available, false, ships, floor, personnel);
    const choice = computeAttemptChoiceLayout(MIN_SCREEN.width, available, false, ships, floor, face, false);
    expect(choice.hasPile).toBe(true);
    expect(choice.pileCardWidth).toBe(choice.stackCardWidth);
    expect(choice.pileCardHeight).toBe(choice.stackCardHeight);
    expect(choice.shipColumnWidth).toBe(shipRowWidth(choice.shipScale, 1));
    expect(choice.rightWidth).toBe(choice.pileCardWidth + ATTEMPT_GAP + choice.shipColumnWidth);
    const missionWidth = Math.round(72 * choice.missionScale);
    expect(
      32 + 20 + missionWidth + choice.stackWidth + 2 * ATTEMPT_STACK_SIDE_GAP + choice.rightWidth + 2 * ATTEMPT_GAP,
    ).toBeLessThanOrEqual(MIN_SCREEN.width);
    const shipRows = choice.shipRows * shipRowLineHeight(choice.shipScale, false) + (choice.shipRows - 1) * 4;
    expect(shipRows).toBeLessThanOrEqual(face.columnHeight);
  });

  // Issue #1220: the space outside both ends of the stack comes out of the stack's width, so the
  // other columns keep theirs.
  it.each([
    ['a planet mission', 0, { count: 20, space: false }],
    ['a space mission', 1, { count: 12, space: true }],
  ])('leaves a space outside both ends of the stack at %s', (_name, ships, personnel) => {
    const face = computeAttemptLayout(MIN_SCREEN.width, available, false, ships, floor, personnel);
    const choice = computeAttemptChoiceLayout(MIN_SCREEN.width, available, false, ships, floor, face, personnel.space);
    expect(ATTEMPT_STACK_SIDE_GAP).toBeGreaterThanOrEqual(16);
    const missionWidth = Math.round(72 * choice.missionScale);
    const available_ = MIN_SCREEN.width - 32 - 20 - 2 * ATTEMPT_GAP - 2 * ATTEMPT_STACK_SIDE_GAP;
    expect(choice.stackWidth).toBe(available_ - missionWidth - choice.rightWidth);
  });

  // Issue #1235: a space mission has no pile, so the right column is one ship wide and its ships
  // take the whole height.
  it.each([1, 5])('shows no pile at a space mission with %i ships, only the ships', (ships) => {
    const personnel = { count: 12, space: true };
    const face = computeAttemptLayout(MIN_SCREEN.width, available, false, ships, floor, personnel);
    const choice = computeAttemptChoiceLayout(MIN_SCREEN.width, available, false, ships, floor, face, true);
    expect(choice.hasPile).toBe(false);
    expect(choice.pileCardWidth).toBe(0);
    expect(choice.pileCardHeight).toBe(0);
    expect(choice.rightWidth).toBe(shipRowWidth(choice.shipScale, 1));
    expect(choice.shipColumnWidth).toBe(choice.rightWidth);
    const line = shipRowLineHeight(choice.shipScale, false);
    expect(choice.shipRows * line + (choice.shipRows - 1) * 4).toBeLessThanOrEqual(face.columnHeight);
    // The rows the pile used to leave: the ships below a pile as wide as a ship.
    const oldPile = Math.min(shipCardWidth(choice.shipScale), Math.floor(((face.columnHeight - 4 - line) * 120) / 167));
    const oldRows = Math.max(1, Math.floor((face.columnHeight - fullCardHeight(oldPile) - 4 + 4) / (line + 4)));
    expect(choice.shipRows).toBeGreaterThanOrEqual(Math.min(ships, oldRows));
  });
});

// Issue #1203: in both phases, the body's top padding and its tallest column fit the height above
// the bottom row, so the attempt layout never pushes the bottom row off the screen.
describe('the attempt layout fits the height above the bottom row (#1203)', () => {
  const touchColumn = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const desktopColumn = (scale: number) => missionColumnHeight(scale, true, DESKTOP_RESERVED_SHIP_ROWS);
  const buttonsRoom = 4 + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT;
  const shipRowsHeight = (rows: number, scale: number, desktop: boolean) =>
    rows * shipRowLineHeight(scale, desktop) + (rows - 1) * 4;
  // The bottom row of the practice table is about 125 px tall at the minimum screen, and the table
  // has 16 px of padding above and below.
  const screens = [
    { name: '667x375', width: MIN_SCREEN.width, height: MIN_SCREEN.height, desktop: false },
    { name: '800x600', width: 800, height: 600, desktop: false },
    { name: 'a desktop at 800x600', width: 800, height: 600, desktop: true },
    { name: 'a short screen', width: MIN_SCREEN.width, height: 300, desktop: false },
  ];
  const cases = [
    { name: 'a space mission with a crew of 12 and 1 ship', ships: 1, personnel: { count: 12, space: true } },
    { name: 'a planet mission with an away team of 20 and no ship', ships: 0, personnel: { count: 20, space: false } },
    { name: 'a planet mission with an away team of 20 and 5 ships', ships: 5, personnel: { count: 20, space: false } },
  ];

  for (const screen of screens) {
    const tableScale = screen.desktop ? 1 : computeTableScale(screen.width, screen.height);
    const tableHeight = screen.height - 32 - 125;
    const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const rowScale = screen.desktop
      ? computeDesktopTableScale(screen.width, tableHeight, desktopColumn)
      : computeTouchMissionScale(screen.width, tableHeight, touchColumn, tableScale);
    const floor = attemptFloorScale(rowScale, available, tableScale);

    it.each(cases)(`fits $name on ${screen.name}, in both phases`, ({ ships, personnel }) => {
      const face = computeAttemptLayout(screen.width, available, screen.desktop, ships, floor, personnel);
      const padding = underMissionStackRoom(face.missionScale, true);
      expect(padding + face.columnHeight).toBeLessThanOrEqual(available + 0.5);

      // The facing phase: the mission, the middle column and the dilemma stack.
      const personnelHeight = face.personnelHeight + (face.personnelButtonsInBand ? 0 : buttonsRoom);
      const ships_ = shipRowsHeight(face.shipRows, face.shipScale, screen.desktop);
      const middle = personnel.space
        ? Math.max(personnelHeight, ships_)
        : personnelHeight + 4 + ships_;
      const stack = missionCardHeight(face.missionScale, true);
      expect(attemptMissionColumnHeight(face.missionScale)).toBeLessThanOrEqual(available + 0.5);
      expect(padding + Math.max(middle, stack)).toBeLessThanOrEqual(available + 0.5);

      // The choice phase: the mission, the stack, and the ships, beside the pile at a planet mission.
      const choice = computeAttemptChoiceLayout(screen.width, available, screen.desktop, ships, floor, face, personnel.space);
      const shipsHeight = shipRowsHeight(choice.shipRows, choice.shipScale, screen.desktop);
      const right = personnel.space
        ? fullCardHeight(choice.pileCardWidth) + 4 + shipsHeight
        : Math.max(choice.stackHeight, shipsHeight);
      expect(padding + Math.max(choice.stackHeight, right)).toBeLessThanOrEqual(available + 0.5);
      // The stack's cards fit below the line of its end labels (#1204).
      expect(ATTEMPT_STACK_LABEL_HEIGHT + choice.stackCardHeight).toBeLessThanOrEqual(choice.stackHeight);
      expect(choice.stackCardWidth).toBeLessThanOrEqual(choice.stackWidth);
    });
  }
});

// Issue #1365: the facing body gives the personnel the width it left empty, and the mission, the
// facing stack and the whole dilemma choice draw exactly as before. The numbers are those of the
// code before #1365, for an away team of 20 and a crew of 12, with cards placed on the mission.
describe('the facing body takes the empty width, and the mission and the choice do not change (#1365)', () => {
  const screens = {
    667: { height: 375, tableHeight: 218, desktop: false },
    1440: { height: 900, tableHeight: 743, desktop: true },
  } as const;
  const cases = [
    {
      width: 667,
      space: false,
      expected: { missionScale: expect.closeTo(1.215277, 5), columnHeight: 142, placedOnWidth: 41, stackWidth: 98, stackHeight: 121 },
      choice: { missionScale: expect.closeTo(1.215277, 5), stackWidth: 287, stackHeight: 121, stackCardWidth: 95, stackCardHeight: 84, rightWidth: 144, pileCardWidth: 95, pileCardHeight: 84, hasPile: true, shipColumnWidth: 41, shipScale: expect.closeTo(1.215277, 5), shipRows: 1 },
    },
    {
      width: 667,
      space: true,
      expected: { missionScale: expect.closeTo(1.215278, 5), columnHeight: 142, placedOnWidth: 41, stackWidth: 98, stackHeight: 121 },
      choice: { missionScale: expect.closeTo(1.215278, 5), stackWidth: 390, stackHeight: 121, stackCardWidth: 120, stackCardHeight: 107, rightWidth: 41, pileCardWidth: 0, pileCardHeight: 0, hasPile: false, shipColumnWidth: 41, shipScale: expect.closeTo(1.215277, 5), shipRows: 1 },
    },
    {
      width: 1440,
      space: false,
      expected: { missionScale: expect.closeTo(5.048611, 5), columnHeight: 589, placedOnWidth: 94, stackWidth: 374, stackHeight: 505 },
      choice: { missionScale: expect.closeTo(5.048611, 5), stackWidth: 580, stackHeight: 505, stackCardWidth: 193, stackCardHeight: 172, rightWidth: 295, pileCardWidth: 193, pileCardHeight: 172, hasPile: true, shipColumnWidth: 94, shipScale: expect.closeTo(2.752000, 5), shipRows: 1 },
    },
    {
      width: 1440,
      space: true,
      expected: { missionScale: expect.closeTo(3.326389, 5), columnHeight: 589, placedOnWidth: 94, stackWidth: 251, stackHeight: 333 },
      choice: { missionScale: expect.closeTo(3.326389, 5), stackWidth: 905, stackHeight: 333, stackCardWidth: 301, stackCardHeight: 268, rightWidth: 94, pileCardWidth: 0, pileCardHeight: 0, hasPile: false, shipColumnWidth: 94, shipScale: expect.closeTo(2.752000, 5), shipRows: 1 },
    },
  ];
  it.each(cases)('keeps the sizes at $width px, space $space', ({ width, space, expected, choice }) => {
    const screen = screens[width as keyof typeof screens];
    const tableScale = screen.desktop ? 1 : computeTableScale(width, screen.height);
    const available = screen.tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const rowScale = screen.desktop
      ? computeDesktopTableScale(width, screen.tableHeight, (s) => missionColumnHeight(s, true, DESKTOP_RESERVED_SHIP_ROWS))
      : computeTouchMissionScale(width, screen.tableHeight, (s) => missionColumnHeight(s, false, TOUCH_RESERVED_SHIP_ROWS), tableScale);
    const floor = attemptFloorScale(rowScale, available, tableScale);
    const panel = viewerCardSize(computeTableScale(width, screen.height), screen.desktop).width;
    const personnel = space ? { count: 12, space: true } : { count: 20, space: false };
    const face = computeAttemptLayout(width, available, screen.desktop, space ? 1 : 0, floor, personnel, true, panel);
    expect(face).toMatchObject(expected);
    expect(computeAttemptChoiceLayout(width, available, screen.desktop, space ? 1 : 0, floor, face, space)).toEqual(choice);
    // The body fills the row: the mission at the strip's gutter, the stack at the content padding.
    const used =
      32 + 20 + Math.round(72 * face.missionScale) + face.placedOnWidth + ATTEMPT_GAP + face.shipsWidth + face.stackWidth + 2 * ATTEMPT_GAP;
    expect(used).toBeLessThanOrEqual(width);
    expect(used).toBeGreaterThan(width - 1);
  });
});

// Issue #1376: in the facing phase the line of the personnel's buttons sits in the band above the
// body, so the first row of cards starts at the top of the column, level with the mission card and
// the stack, and the area takes the line's height. The old numbers are those of the code before.
describe('the first row of the personnel is level with the mission (#1376)', () => {
  const touchColumn = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const cases = [
    { width: MIN_SCREEN.width, height: MIN_SCREEN.height, ships: 1, personnel: { count: 12, space: true }, old: { missionScale: 1.215277611756032, personnelHeight: 120, visibleRows: 2 } },
    { width: MIN_SCREEN.width, height: MIN_SCREEN.height, ships: 0, personnel: { count: 20, space: false }, old: { missionScale: 1.2152773735574103, personnelHeight: 77, visibleRows: 2 } },
    { width: 800, height: 600, ships: 1, personnel: { count: 12, space: true }, old: { missionScale: 1.9333333333333331, personnelHeight: 311, visibleRows: 4 } },
    { width: 800, height: 600, ships: 0, personnel: { count: 20, space: false }, old: { missionScale: 2.604166656318638, personnelHeight: 245, visibleRows: 3 } },
  ];

  it.each(cases)('starts the grid at the top of the mission card at $width x $height, space $personnel.space', ({ width, height, ships, personnel, old }) => {
    const tableScale = computeTableScale(width, height);
    const tableHeight = height - 32 - 125;
    const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const floor = attemptFloorScale(computeTouchMissionScale(width, tableHeight, touchColumn, tableScale), available, tableScale);
    const sizes = computeAttemptLayout(width, available, false, ships, floor, personnel);

    // The band above the body holds the line of buttons, so the grid's offset from the top of the
    // column, where the mission card and the stack start, is 0.
    expect(underMissionStackRoom(sizes.missionScale, true)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_BUTTONS_HEIGHT);
    expect(sizes.personnelButtonsInBand).toBe(true);
    // The grid draws in the whole room of its column: all of it at a space mission, all of it but
    // one line of ships at a planet mission.
    const room = personnel.space
      ? sizes.columnHeight
      : sizes.columnHeight - 4 - shipRowLineHeight(floor, false);
    expect(sizes.personnelHeight).toBe(Math.floor(room));

    // The area gets the line's height: taller than before, and as many rows or more.
    expect(sizes.personnelHeight).toBe(old.personnelHeight + 4 + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT);
    expect(sizes.personnelVisibleRows).toBeGreaterThanOrEqual(old.visibleRows);
    // The mission's scale, and so the dilemma choice, does not change.
    expect(sizes.missionScale).toBeCloseTo(old.missionScale, 9);
  });

  it('keeps the line above the area where the band is too short for it', () => {
    expect(attemptPersonnelButtonsInBand(1)).toBe(true);
    expect(attemptPersonnelButtonsInBand(0.8)).toBe(false);
    expect(underMissionStackRoom(0.8, true)).toBeLessThan(ATTEMPT_PERSONNEL_BUTTONS_HEIGHT);
  });
});

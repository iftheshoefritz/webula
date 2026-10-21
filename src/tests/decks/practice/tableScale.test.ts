import {
  ATTEMPT_GAP,
  ATTEMPT_STACK_LABEL_HEIGHT,
  ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
  ATTEMPT_PERSONNEL_CARD_WIDTH,
  ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH,
  ATTEMPT_STRIP_HEIGHT,
  attemptFloorScale,
  attemptPersonnelHeight,
  AttemptLayoutSizes,
  DESKTOP_RESERVED_SHIP_ROWS,
  attemptMissionColumnHeight,
  computeAttemptChoiceLayout,
  computeAttemptLayout,
  computeDesktopTableScale,
  computeShipRowCount,
  computeTableScale,
  computeTouchMissionScale,
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
  underMissionStackRoom,
} from '../../../app/decks/practice/MissionRow';
import { offsetFor } from '../../../app/decks/practice/overlapOffset';
import { fullCardHeight } from '../../../app/decks/practice/TableCard';

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

// Issue #1164: the attempt layout sizes the attempted mission, drawn whole, and the ships beside it
// from the space below its strip.
describe('computeAttemptLayout (#1164)', () => {
  const touchColumn = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);
  const desktopColumn = (scale: number) => missionColumnHeight(scale, true, DESKTOP_RESERVED_SHIP_ROWS);
  const minTableScale = computeTableScale(MIN_SCREEN.width, MIN_SCREEN.height);
  // The width the layout's parts take: the padding, the menu gutter, the mission card, the ships
  // column, the dilemma stack and the two gaps.
  const usedWidth = (sizes: AttemptLayoutSizes, desktop: boolean) =>
    32 + 20 + Math.round(72 * sizes.missionScale) + sizes.shipsWidth + 56 * (desktop ? 2 : 1) + 2 * ATTEMPT_GAP;

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
    expect(usedWidth(sizes, false)).toBeLessThanOrEqual(MIN_SCREEN.width);
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
    expect(usedWidth(sizes, true)).toBeLessThanOrEqual(1440);
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
      sizes.personnelColumns * sizes.personnelCardWidth + (sizes.personnelColumns - 1) * 4;

    it('fits 20 away team cards at 667x375, clear of the dilemma stack, in rows that scroll', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 0, floor, { count: 20, space: false });
      expect(usedWidth(sizes, false)).toBeLessThanOrEqual(MIN_SCREEN.width);
      expect(sizes.personnelWidth).toBeLessThanOrEqual(sizes.shipsWidth);
      expect(rowWidth(sizes)).toBeLessThanOrEqual(sizes.personnelWidth);
      // The area, its buttons and one line of ships fit the height below the strip.
      const middle =
        sizes.personnelHeight + 4 + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT + 4 + sizes.shipRows * shipRowLineHeight(sizes.shipScale, false);
      expect(middle).toBeLessThanOrEqual(available);
      expect(rowsNeeded(sizes, 20)).toBeGreaterThan(sizes.personnelVisibleRows);
    });

    it('fits a crew of 12 beside the ships at a space mission', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, { count: 12, space: true });
      expect(usedWidth(sizes, false)).toBeLessThanOrEqual(MIN_SCREEN.width);
      expect(sizes.shipRowsWidth + ATTEMPT_GAP + sizes.personnelWidth).toBeLessThanOrEqual(sizes.shipsWidth);
      expect(sizes.shipScale).toBeGreaterThanOrEqual(floor);
      const middle =
        badgeStripHeight(sizes.missionScale) +
        4 +
        Math.max(
          sizes.personnelHeight + 4 + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
          sizes.shipRows * shipRowLineHeight(sizes.shipScale, false),
        );
      expect(middle).toBeLessThanOrEqual(available);
    });

    // Issue #1180: the column of the cards placed on the mission, at the inputs of ?fixture=attempt.
    it('fits the column of the placed cards at 667x375, from the middle column and never below the floor', () => {
      const crew = { count: 12, space: true };
      const without = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, crew);
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, crew, true);
      expect(without.placedOnWidth).toBe(0);
      expect(sizes.placedOnWidth).toBe(shipCardWidth(floor));
      expect(sizes.missionScale).toBeGreaterThanOrEqual(floor);
      expect(usedWidth(sizes, false) + sizes.placedOnWidth + ATTEMPT_GAP).toBeLessThanOrEqual(MIN_SCREEN.width);
    });

    it('takes the column from the slack of the middle column, and leaves the mission as it was', () => {
      const tableHeight = 700;
      const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
      const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
      const without = computeAttemptLayout(1440, available, true, 1, floor, { count: 2, space: true });
      const sizes = computeAttemptLayout(1440, available, true, 1, floor, { count: 2, space: true }, true);
      // The bisection of the height bound starts from another width, so allow its precision.
      expect(sizes.missionScale).toBeCloseTo(without.missionScale, 4);
      expect(Math.round(72 * sizes.missionScale)).toBe(Math.round(72 * without.missionScale));
      expect(sizes.shipsWidth).toBe(without.shipsWidth);
      expect(usedWidth(sizes, true) + sizes.placedOnWidth + ATTEMPT_GAP).toBeLessThanOrEqual(1440);
    });

    // Issue #1177: at a space mission the ships sit in one column as wide as the mission.
    it('makes the ships column as wide as the mission at 667x375, with the ship at the mission scale', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, { count: 12, space: true });
      expect(sizes.shipRowsWidth).toBe(Math.round(72 * sizes.missionScale));
      expect(sizes.shipScale).toBe(sizes.missionScale);
      // The mission is height-bound here, so its scale does not shrink for the ships column.
      expect(sizes.missionScale).toBeCloseTo(
        Math.max(floor, fitColumnScale(10, available, attemptMissionColumnHeight)),
        5,
      );
      expect(usedWidth(sizes, false)).toBeLessThanOrEqual(MIN_SCREEN.width);
    });

    it('keeps the ships column as wide as the mission on a wide screen with a small crew', () => {
      const tableHeight = 700;
      const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
      const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
      const sizes = computeAttemptLayout(1440, available, true, 1, floor, { count: 2, space: true });
      expect(sizes.shipRowsWidth).toBe(Math.round(72 * sizes.missionScale));
      expect(sizes.personnelWidth).toBe(sizes.personnelCardWidth * 2 + 4);
      expect(sizes.shipsWidth).toBe(sizes.shipRowsWidth + ATTEMPT_GAP + sizes.personnelWidth);
      expect(usedWidth(sizes, true)).toBeLessThanOrEqual(1440);
    });

    it('fits many ships down the one column between the floor and the mission scale', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 6, floor, { count: 12, space: true });
      expect(sizes.shipRowsWidth).toBe(Math.round(72 * sizes.missionScale));
      expect(sizes.shipScale).toBeGreaterThanOrEqual(floor);
      expect(sizes.shipScale).toBeLessThanOrEqual(sizes.missionScale);
      const ships = badgeStripHeight(sizes.missionScale) + 4 + sizes.shipRows * shipRowLineHeight(sizes.shipScale, false) + (sizes.shipRows - 1) * 4;
      expect(ships).toBeLessThanOrEqual(available);
    });

    // Issue #1205: cropped table cards of one fixed width, 4 to a row in the crew row of a space
    // mission at the minimum screen, in rows that scroll. The body is the one the browser measures
    // at 667x375, as in the #1203 tests below: a bottom row about 125 px tall.
    const minAvailable = MIN_SCREEN.height - 32 - 125 - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
    const minFloor = attemptFloorScale(
      computeTouchMissionScale(MIN_SCREEN.width, MIN_SCREEN.height - 32 - 125, touchColumn, minTableScale),
      minAvailable,
      minTableScale,
    );
    it('shows the crew of ?fixture=attempt at 667x375 as crops 4 to a row, with no overlap, in rows that scroll', () => {
      // 652: the game layer of headless Chromium at 667, less the page's scrollbar.
      for (const [width, placedOn] of [[667, true], [667, false], [652, true], [652, false]] as const) {
        const sizes = computeAttemptLayout(width, minAvailable, false, 1, minFloor, { count: 12, space: true }, placedOn);
        expect(sizes.personnelCardWidth).toBe(ATTEMPT_PERSONNEL_CARD_WIDTH);
        expect(sizes.personnelColumns).toBe(4);
        expect(sizes.personnelWidth).toBe(4 * ATTEMPT_PERSONNEL_CARD_WIDTH + 3 * 4 + ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH);
        expect(sizes.personnelVisibleRows).toBeGreaterThanOrEqual(1);
        expect(sizes.personnelVisibleRows).toBeLessThan(3);
        expect(sizes.personnelHeight).toBe(
          sizes.personnelVisibleRows * attemptPersonnelCropHeight(ATTEMPT_PERSONNEL_CARD_WIDTH) + (sizes.personnelVisibleRows - 1) * 4,
        );
      }
    });

    it.each([667, 652])('measures the width at the fixture at %i: a 5th crop would not fit the crew row', (width) => {
      // The room the crew row may take at ?fixture=attempt: the width less the mission and the ships column.
      const sizes = computeAttemptLayout(width, minAvailable, false, 1, minFloor, { count: 12, space: true }, true);
      const room =
        width - 32 - 20 - 3 * ATTEMPT_GAP - 56 - sizes.placedOnWidth - ATTEMPT_GAP - 2 * Math.round(72 * sizes.missionScale);
      const fourAcross = 4 * ATTEMPT_PERSONNEL_CARD_WIDTH + 3 * 4 + ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH;
      expect(fourAcross).toBeLessThanOrEqual(room);
      expect(fourAcross + ATTEMPT_PERSONNEL_CARD_WIDTH + 4).toBeGreaterThan(room);
    });

    it('fits more crops across a planet mission, at the same width', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 0, floor, { count: 20, space: false });
      expect(sizes.personnelCardWidth).toBe(ATTEMPT_PERSONNEL_CARD_WIDTH);
      expect(sizes.personnelColumns).toBeGreaterThan(4);
    });

    it('keeps the crop width on a larger screen', () => {
      const tableHeight = 700;
      const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
      const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
      for (const space of [true, false]) {
        const sizes = computeAttemptLayout(1440, available, true, 1, floor, { count: 20, space });
        expect(sizes.personnelCardWidth).toBe(ATTEMPT_PERSONNEL_CARD_WIDTH);
        expect(sizes.personnelColumns).toBeGreaterThanOrEqual(4);
      }
    });

    it('takes all the planet column but one line of ships for the area', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 5, floor, { count: 40, space: false });
      const room = sizes.columnHeight - 4 - shipRowLineHeight(floor, false) - 4 - ATTEMPT_PERSONNEL_BUTTONS_HEIGHT;
      const row = attemptPersonnelCropHeight(sizes.personnelCardWidth);
      expect(sizes.personnelHeight).toBeLessThanOrEqual(room);
      expect(sizes.personnelHeight + 4 + row).toBeGreaterThan(room);
      expect(sizes.shipRows).toBe(1);
    });

    it('shrinks the crops only when one row does not fit the height', () => {
      const height = 120;
      const sizes = computeAttemptLayout(MIN_SCREEN.width, height, false, 1, floor, { count: 8, space: false });
      expect(sizes.personnelCardWidth).toBeLessThan(ATTEMPT_PERSONNEL_CARD_WIDTH);
      expect(sizes.personnelVisibleRows).toBe(1);
      const middle =
        sizes.personnelHeight + 4 + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT + 4 + shipRowLineHeight(sizes.shipScale, false);
      expect(middle).toBeLessThanOrEqual(height);
    });
  });

  describe('attemptPersonnelGrid (#1205)', () => {
    const crop = attemptPersonnelCropHeight(40);

    it('holds as many crops to a row as fit, and every row when they all fit the height', () => {
      expect(attemptPersonnelGrid(5, 40, 130, 1000)).toEqual({ columns: 3, visibleRows: 2, width: 128, height: 2 * crop + 4 });
      expect(attemptPersonnelGrid(2, 40, 2000, 1000)).toEqual({ columns: 2, visibleRows: 1, width: 84, height: crop });
    });

    it('shows the whole rows that fit the height and keeps the scrollbar beside the cards', () => {
      const grid = attemptPersonnelGrid(12, 40, 172, 2 * crop + 4);
      expect(grid.visibleRows).toBe(2);
      // 4 crops fit 172 px, but not beside the scrollbar, so the row holds 3.
      expect(grid.columns).toBe(3);
      expect(grid.width).toBe(3 * 40 + 2 * 4 + ATTEMPT_PERSONNEL_SCROLLBAR_WIDTH);
      expect(grid.height).toBe(2 * crop + 4);
    });

    it('shows at least 1 row', () => {
      expect(attemptPersonnelGrid(8, 40, 2000, 10).visibleRows).toBe(1);
    });
  });
});

// Issue #1190: the dilemma choice keeps the facing phase's mission scale and gives the stack in the
// middle the width the personnel row takes in the facing phase.
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
    const choice = computeAttemptChoiceLayout(MIN_SCREEN.width, available, false, ships, floor, face);
    expect(choice.missionScale).toBe(face.missionScale);
    const missionWidth = Math.round(72 * choice.missionScale);
    // The padding, the menu gutter, the mission, the stack, the right column and the two gaps.
    expect(32 + 20 + missionWidth + choice.stackWidth + choice.rightWidth + 2 * ATTEMPT_GAP).toBeLessThanOrEqual(
      MIN_SCREEN.width,
    );
    expect(attemptMissionColumnHeight(choice.missionScale)).toBeLessThanOrEqual(available + 1);
    // The pile and the rows of ships below it fit the height below the slivers' room.
    const right =
      fullCardHeight(choice.pileCardWidth) + 4 + choice.shipRows * shipRowLineHeight(choice.shipScale, false);
    expect(right).toBeLessThanOrEqual(available - underMissionStackRoom(choice.missionScale, true));
    // The stack is wider than the facing phase's fan, and its cards are art crops (#1221), as tall as
    // the zone below the end labels allows.
    expect(choice.stackWidth).toBeGreaterThan(56);
    expect(choice.stackCardWidth).toBeLessThanOrEqual(choice.stackWidth);
    expect(choice.stackCardHeight).toBe(attemptPersonnelCropHeight(choice.stackCardWidth));
    expect(ATTEMPT_STACK_LABEL_HEIGHT + choice.stackCardHeight).toBeLessThanOrEqual(choice.stackHeight);
    expect(ATTEMPT_STACK_LABEL_HEIGHT + choice.stackCardHeight).toBeGreaterThan(choice.stackHeight - 2);
    expect(choice.stackHeight).toBe(missionCardHeight(choice.missionScale, true));
    // 3 dilemmas sit edge to edge, every one readable.
    expect(offsetFor(3, choice.stackCardWidth, choice.stackWidth, choice.stackCardWidth)).toBe(choice.stackCardWidth);
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
      const personnelHeight = face.personnelHeight + buttonsRoom;
      const ships_ = shipRowsHeight(face.shipRows, face.shipScale, screen.desktop);
      const middle = personnel.space
        ? badgeStripHeight(face.missionScale) + 4 + Math.max(personnelHeight, ships_)
        : personnelHeight + 4 + ships_;
      const stack = missionCardHeight(face.missionScale, true);
      expect(attemptMissionColumnHeight(face.missionScale)).toBeLessThanOrEqual(available + 0.5);
      expect(padding + Math.max(middle, stack)).toBeLessThanOrEqual(available + 0.5);

      // The choice phase: the mission, the stack, and the pile above its ships.
      const choice = computeAttemptChoiceLayout(screen.width, available, screen.desktop, ships, floor, face);
      const right =
        fullCardHeight(choice.pileCardWidth) + 4 + shipRowsHeight(choice.shipRows, choice.shipScale, screen.desktop);
      expect(padding + Math.max(choice.stackHeight, right)).toBeLessThanOrEqual(available + 0.5);
      // The stack's cards fit below the line of its end labels (#1204).
      expect(ATTEMPT_STACK_LABEL_HEIGHT + choice.stackCardHeight).toBeLessThanOrEqual(choice.stackHeight);
      expect(choice.stackCardWidth).toBeLessThanOrEqual(choice.stackWidth);
    });
  }
});

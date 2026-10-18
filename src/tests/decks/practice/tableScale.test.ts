import {
  ATTEMPT_GAP,
  ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
  ATTEMPT_PERSONNEL_MIN_SLICE,
  ATTEMPT_STRIP_HEIGHT,
  attemptFloorScale,
  attemptPersonnelHeight,
  AttemptLayoutSizes,
  DESKTOP_RESERVED_SHIP_ROWS,
  attemptMissionColumnHeight,
  computeAttemptLayout,
  computeDesktopTableScale,
  computeShipRowCount,
  computeTableScale,
  computeTouchMissionScale,
  desktopMissionSlotBudget,
  fitColumnScale,
  MIN_SCREEN,
  TOUCH_RESERVED_SHIP_ROWS,
} from '../../../app/decks/practice/tableScale';
import {
  badgeStripHeight,
  missionCardHeight,
  missionColumnHeight,
  shipRowLineHeight,
} from '../../../app/decks/practice/MissionRow';
import { offsetFor } from '../../../app/decks/practice/overlapOffset';

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
      [MIN_SCREEN.width, 100, 1],
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
    // The cards each line holds, and the least of each card the row shows past the next one.
    const slice = (sizes: AttemptLayoutSizes, count: number) =>
      offsetFor(Math.ceil(count / sizes.personnelRows), sizes.personnelCardWidth, sizes.personnelWidth, sizes.personnelCardWidth);

    it('fits 20 away team cards at 667x375, clear of the dilemma stack, with each card showing', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 0, floor, { count: 20, space: false });
      expect(usedWidth(sizes, false)).toBeLessThanOrEqual(MIN_SCREEN.width);
      expect(sizes.personnelWidth).toBeLessThanOrEqual(sizes.shipsWidth);
      expect(slice(sizes, 20)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_MIN_SLICE);
      // The row, its buttons and one line of ships fit the height below the strip.
      const middle =
        attemptPersonnelHeight(sizes.personnelCardWidth, sizes.personnelRows) +
        4 +
        ATTEMPT_PERSONNEL_BUTTONS_HEIGHT +
        4 +
        sizes.shipRows * shipRowLineHeight(sizes.shipScale, false);
      expect(middle).toBeLessThanOrEqual(available);
    });

    it('fits a crew of 12 beside the ships at a space mission', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, { count: 12, space: true });
      expect(usedWidth(sizes, false)).toBeLessThanOrEqual(MIN_SCREEN.width);
      expect(sizes.shipRowsWidth + ATTEMPT_GAP + sizes.personnelWidth).toBeLessThanOrEqual(sizes.shipsWidth);
      expect(sizes.shipScale).toBeGreaterThanOrEqual(floor);
      expect(slice(sizes, 12)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_MIN_SLICE);
      const middle =
        badgeStripHeight(sizes.missionScale) +
        4 +
        Math.max(
          attemptPersonnelHeight(sizes.personnelCardWidth, sizes.personnelRows) + 4 + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
          sizes.shipRows * shipRowLineHeight(sizes.shipScale, false),
        );
      expect(middle).toBeLessThanOrEqual(available);
    });

    it('wraps to 2 rows when 1 row would show too little of each card and the height has room', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, 400, false, 0, floor, { count: 60, space: false });
      expect(sizes.personnelRows).toBe(2);
      expect(slice(sizes, 60)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_MIN_SLICE);
      expect(computeAttemptLayout(MIN_SCREEN.width, 400, false, 0, floor, { count: 20, space: false }).personnelRows).toBe(1);
    });
  });
});

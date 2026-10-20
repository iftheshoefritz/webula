import {
  ATTEMPT_GAP,
  ATTEMPT_STACK_LABEL_HEIGHT,
  ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
  ATTEMPT_PERSONNEL_MIN_SLICE,
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
  attemptPersonnelLines,
  ATTEMPT_PERSONNEL_MAX_PER_ROW,
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
    // The least of each card the row shows past the next one, in its first line, the fuller one.
    const slice = (sizes: AttemptLayoutSizes) =>
      offsetFor(sizes.personnelFirstRow, sizes.personnelCardWidth, sizes.personnelWidth, sizes.personnelCardWidth);

    it('fits 20 away team cards at 667x375, clear of the dilemma stack, with each card showing', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 0, floor, { count: 20, space: false });
      expect(usedWidth(sizes, false)).toBeLessThanOrEqual(MIN_SCREEN.width);
      expect(sizes.personnelWidth).toBeLessThanOrEqual(sizes.shipsWidth);
      expect(slice(sizes)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_MIN_SLICE);
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
      expect(slice(sizes)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_MIN_SLICE);
      const middle =
        badgeStripHeight(sizes.missionScale) +
        4 +
        Math.max(
          attemptPersonnelHeight(sizes.personnelCardWidth, sizes.personnelRows) + 4 + ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
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
      expect(slice(sizes)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_MIN_SLICE);
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
      expect(slice(sizes)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_MIN_SLICE);
    });

    it('keeps the ships column as wide as the mission on a wide screen with a small crew', () => {
      const tableHeight = 700;
      const available = tableHeight - ATTEMPT_STRIP_HEIGHT - ATTEMPT_GAP;
      const floor = computeDesktopTableScale(1440, tableHeight, desktopColumn);
      const sizes = computeAttemptLayout(1440, available, true, 1, floor, { count: 2, space: true });
      expect(sizes.shipRowsWidth).toBe(Math.round(72 * sizes.missionScale));
      expect(sizes.personnelWidth).toBe(sizes.personnelCardWidth * 2);
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

    // Issue #1178: the cards fill a row side by side, at most 6, wrap to a second row, and overlap
    // only when both rows are full.
    it('shows a crew of 12 at 667x375 as 2 rows of 6 with no overlap', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, { count: 12, space: true });
      expect(sizes.personnelRows).toBe(2);
      expect(sizes.personnelFirstRow).toBe(ATTEMPT_PERSONNEL_MAX_PER_ROW);
      expect(sizes.personnelWidth).toBe(ATTEMPT_PERSONNEL_MAX_PER_ROW * sizes.personnelCardWidth);
      expect(slice(sizes)).toBe(sizes.personnelCardWidth);
      expect(sizes.shipRowsWidth).toBe(Math.round(72 * sizes.missionScale));
    });

    it('shows 4 personnel in 1 row with no overlap', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, { count: 4, space: true });
      expect(sizes.personnelRows).toBe(1);
      expect(sizes.personnelFirstRow).toBe(4);
      expect(sizes.personnelWidth).toBe(4 * sizes.personnelCardWidth);
    });

    it('fills the first row before the second: 8 personnel give 6 and 2', () => {
      for (const space of [true, false]) {
        const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor, { count: 8, space });
        expect(sizes.personnelRows).toBe(2);
        expect(sizes.personnelFirstRow).toBe(6);
        expect(slice(sizes)).toBe(sizes.personnelCardWidth);
      }
    });

    it('overlaps 20 away team cards in 2 rows no wider than 6 cards at 667x375', () => {
      const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 0, floor, { count: 20, space: false });
      expect(sizes.personnelRows).toBe(2);
      expect(sizes.personnelFirstRow).toBe(10);
      expect(sizes.personnelWidth).toBeLessThanOrEqual(ATTEMPT_PERSONNEL_MAX_PER_ROW * sizes.personnelCardWidth);
      expect(slice(sizes)).toBeGreaterThanOrEqual(ATTEMPT_PERSONNEL_MIN_SLICE);
      expect(slice(sizes)).toBeLessThan(sizes.personnelCardWidth);
    });

    it('shrinks the cards at a planet mission until 2 rows fit above a line of ships', () => {
      // A short body: a ship-wide card fits 1 row here, but not 2.
      const height = 180;
      const sizes = computeAttemptLayout(MIN_SCREEN.width, height, false, 1, floor, { count: 8, space: false });
      const one = computeAttemptLayout(MIN_SCREEN.width, height, false, 1, floor, { count: 1, space: false });
      expect(sizes.personnelRows).toBe(2);
      expect(sizes.personnelCardWidth).toBeLessThan(one.personnelCardWidth);
      const middle =
        attemptPersonnelHeight(sizes.personnelCardWidth, 2) +
        4 +
        ATTEMPT_PERSONNEL_BUTTONS_HEIGHT +
        4 +
        shipRowLineHeight(floor, false);
      expect(middle).toBeLessThanOrEqual(height);
    });
  });

  describe('attemptPersonnelLines (#1178)', () => {
    it('holds fewer than 6 cards to a row when the width runs out', () => {
      expect(attemptPersonnelLines(5, 40, 130, 1000)).toEqual({ rows: 2, firstRow: 3, width: 120 });
      expect(attemptPersonnelLines(3, 40, 130, 1000)).toEqual({ rows: 1, firstRow: 3, width: 120 });
    });

    it('holds at most 6 cards to a row however wide the room', () => {
      expect(attemptPersonnelLines(7, 40, 2000, 1000)).toEqual({ rows: 2, firstRow: 6, width: 240 });
      expect(attemptPersonnelLines(12, 40, 2000, 1000)).toEqual({ rows: 2, firstRow: 6, width: 240 });
    });

    it('overlaps the cards, split about evenly, once both rows are full', () => {
      expect(attemptPersonnelLines(13, 40, 2000, 1000)).toEqual({ rows: 2, firstRow: 7, width: 240 });
      expect(attemptPersonnelLines(9, 40, 130, 1000)).toEqual({ rows: 2, firstRow: 5, width: 130 });
    });

    it('overlaps the cards in 1 row when 2 rows do not fit the height', () => {
      expect(attemptPersonnelLines(8, 40, 2000, 60)).toEqual({ rows: 1, firstRow: 8, width: 240 });
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
    // The stack is wider than the facing phase's fan, and its cards are as tall as the zone allows.
    expect(choice.stackWidth).toBeGreaterThan(56);
    expect(choice.stackCardWidth).toBeLessThanOrEqual(choice.stackWidth);
    expect(fullCardHeight(choice.stackCardWidth)).toBeLessThanOrEqual(choice.stackHeight + 1);
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
      const personnelHeight = attemptPersonnelHeight(face.personnelCardWidth, face.personnelRows) + buttonsRoom;
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
      expect(ATTEMPT_STACK_LABEL_HEIGHT + fullCardHeight(choice.stackCardWidth)).toBeLessThanOrEqual(choice.stackHeight);
    });
  }
});

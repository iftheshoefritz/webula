import {
  ATTEMPT_GAP,
  ATTEMPT_STRIP_HEIGHT,
  AttemptLayoutSizes,
  DESKTOP_RESERVED_SHIP_ROWS,
  attemptMissionColumnHeight,
  computeAttemptLayout,
  computeDesktopTableScale,
  computeShipRowCount,
  computeTableScale,
  computeTouchMissionScale,
  desktopMissionSlotBudget,
  MIN_SCREEN,
  TOUCH_RESERVED_SHIP_ROWS,
} from '../../../app/decks/practice/tableScale';
import {
  badgeStripHeight,
  missionCardHeight,
  missionColumnHeight,
  shipRowLineHeight,
} from '../../../app/decks/practice/MissionRow';

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

  it('stops at the width of five missions and the desktop dilemma stack', () => {
    // #1060: each slot reserves the width of a turned mission, 100 px at scale 1, not 72.
    // (1500 - 32 padding - 5 gaps of 8 - 112 dilemma stack) / (5 * 100)
    expect(computeDesktopTableScale(1500, 5000, column)).toBeCloseTo((1500 - 32 - 40 - 112) / 500, 5);
  });

  it('stays at 1 when the wider slots do not fit at scale 1 (#1060)', () => {
    // Five 72 px slots fit 600 px, five 100 px slots do not.
    expect(desktopMissionSlotBudget(600)).toBeCloseTo((600 - 32 - 40 - 112) / 5, 5);
    expect(computeDesktopTableScale(600, 5000, column)).toBe(1);
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

  it('stops at the width of five art crops and the dilemma stack, clear of the menu buttons', () => {
    // (667 - 32 padding - 2 * 20 menu button gutter - 5 gaps of 8 - 56 dilemma stack) / (5 * 72)
    expect(computeTouchMissionScale(MIN_SCREEN.width, 5000, column, 1)).toBeCloseTo(
      (667 - 32 - 40 - 40 - 56) / 360,
      5,
    );
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
    const floor = computeTouchMissionScale(MIN_SCREEN.width, tableHeight, touchColumn, minTableScale);
    const sizes = computeAttemptLayout(MIN_SCREEN.width, available, false, 1, floor);
    expect(sizes.missionScale).toBeGreaterThanOrEqual(floor);
    expect(attemptMissionColumnHeight(sizes.missionScale)).toBeLessThanOrEqual(available + 1);
    expect(usedWidth(sizes, false)).toBeLessThanOrEqual(MIN_SCREEN.width);
    // The whole card is taller than the art crop the mission row draws at the floor scale.
    expect(missionCardHeight(sizes.missionScale, true)).toBeGreaterThan(missionCardHeight(floor, false));
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
});

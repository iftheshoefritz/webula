import {
  computeDesktopTableScale,
  computeShipRowCount,
  computeTableScale,
  computeTouchMissionScale,
  desktopMissionSlotBudget,
  MIN_SCREEN,
  TOUCH_RESERVED_SHIP_ROWS,
} from '../../../app/decks/practice/tableScale';
import { missionColumnHeight } from '../../../app/decks/practice/MissionRow';

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

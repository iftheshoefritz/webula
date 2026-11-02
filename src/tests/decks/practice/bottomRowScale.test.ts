import {
  BOTTOM_ROW_SCALE_CAP,
  DESKTOP_RESERVED_SHIP_ROWS,
  MIN_SCREEN,
  TOUCH_RESERVED_SHIP_ROWS,
  computeBottomRowScale,
  computeTableScale,
} from '../../../app/decks/practice/tableScale';
import { missionColumnHeight } from '../../../app/decks/practice/MissionRow';
import { PILE_CARD_HEIGHT } from '../../../app/decks/practice/flatRowWidths';
import { TABLE_CARD_WIDTH, fullCardHeight } from '../../../app/decks/practice/TableCard';

// Issue #1465: the bottom row grows with the table on a large screen, up to a cap.
const desktopColumn = (scale: number) => missionColumnHeight(scale, true, DESKTOP_RESERVED_SHIP_ROWS);
const touchColumn = (scale: number) => missionColumnHeight(scale, false, TOUCH_RESERVED_SHIP_ROWS);

function rowScale(width: number, height: number, desktop: boolean, insetBottom = 0): number {
  return computeBottomRowScale({
    gameLayerWidth: width,
    gameLayerHeight: height,
    tableScale: computeTableScale(width, height, insetBottom),
    desktop,
    columnHeight: desktop ? desktopColumn : touchColumn,
    insetBottom,
  });
}

describe('computeBottomRowScale', () => {
  it('stays at 1 on the minimum screen, at 800x600 and on a phone', () => {
    expect(rowScale(MIN_SCREEN.width, MIN_SCREEN.height, false)).toBe(1);
    expect(rowScale(800, 600, false)).toBe(1);
    expect(rowScale(800, 600, true)).toBe(1);
    expect(rowScale(932, 430, false)).toBe(1);
  });

  it('grows to 1.25 at 1280x800 on a desktop', () => {
    expect(rowScale(1280, 800, true)).toBeCloseTo(1.25, 5);
  });

  it('grows to about 1.69 at 1920x1080, on a desktop and on a touch screen', () => {
    expect(rowScale(1920, 1080, true)).toBeCloseTo(1.6875, 3);
    expect(rowScale(1920, 1080, false)).toBeCloseTo(1.6875, 3);
  });

  it('stops at the cap on a very large screen', () => {
    expect(rowScale(2560, 1440, true)).toBe(BOTTOM_ROW_SCALE_CAP);
    expect(rowScale(3840, 2160, false)).toBe(BOTTOM_ROW_SCALE_CAP);
  });

  it('keeps 1 where the missions are bound by the height, and the missions still fit', () => {
    expect(rowScale(2560, 900, true)).toBe(1);
  });

  it('never takes the height the width-bound missions need', () => {
    // A wide screen whose height only just holds the missions: the guard, not the ramp, decides.
    const width = 2560;
    const height = 1250;
    const scale = rowScale(width, height, true);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThan(computeTableScale(width, height) / 2);
    const budget = (width - 32 - 76 - 8 * 4) / 5;
    // The mission column at its width-bound scale, and the row, fit the height inside the padding.
    const missionScale = budget / fullCardHeight(TABLE_CARD_WIDTH);
    expect(desktopColumn(missionScale) + PILE_CARD_HEIGHT * scale).toBeLessThanOrEqual(height - 32 + 1e-6);
  });

  it('lowers or keeps the scale with a bottom safe-area inset, never raises it', () => {
    for (const [w, h] of [
      [1024, 768],
      [1280, 800],
      [1366, 1024],
      [1920, 1080],
    ]) {
      expect(rowScale(w, h, false, 34)).toBeLessThanOrEqual(rowScale(w, h, false));
    }
  });
});

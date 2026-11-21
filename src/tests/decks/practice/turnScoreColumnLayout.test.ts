import {
  TURN_SCORE_COLUMN_CLEARANCE,
  TURN_SCORE_TAP_ROW_MAX,
  TURN_SCORE_TAP_ROW_MIN,
  turnScoreColumnHeight,
  turnScoreColumnLayout,
} from '../../../app/decks/practice/tableScale';

// Issue #1790: every control of the column on a row of its own, sized from the free height.
describe('turnScoreColumnLayout (#1395, #1790)', () => {
  const fitsIn = (top: number, roomBottom: number, systemControls = false) => {
    const layout = turnScoreColumnLayout({ systemControls, top, roomBottom });
    return { layout, bottom: top + turnScoreColumnHeight(layout) + TURN_SCORE_COLUMN_CLEARANCE };
  };

  it('measures the column at the floor, with its labels, as 222 px', () => {
    expect(turnScoreColumnHeight(turnScoreColumnLayout({ systemControls: false, top: 0, roomBottom: 0 }))).toBe(222);
    expect(TURN_SCORE_COLUMN_CLEARANCE).toBe(8);
  });

  it('fits at 667×375 on touch, with tap rows of 32 px or more and its labels', () => {
    const { layout, bottom } = fitsIn(124, 359);
    expect(layout.tapRow).toBeGreaterThanOrEqual(32);
    expect(layout.labels).toBe(true);
    expect(layout.compact).toBe(false);
    expect(layout.tapText).toBeGreaterThanOrEqual(12);
    expect(layout.listText).toBeGreaterThanOrEqual(12);
    expect(bottom).toBeLessThanOrEqual(359);
  });

  it('reaches 44 px at 800×600 on touch and at 1280×800 on a desktop, and never more', () => {
    expect(fitsIn(124, 584).layout.tapRow).toBe(TURN_SCORE_TAP_ROW_MAX);
    expect(fitsIn(172, 784).layout.tapRow).toBe(TURN_SCORE_TAP_ROW_MAX);
    expect(fitsIn(0, 5000).layout.tapRow).toBe(44);
    expect(fitsIn(172, 784).layout.tapText).toBe(14);
  });

  it('grows the rows with the room, one px at a time', () => {
    const floor = turnScoreColumnHeight(turnScoreColumnLayout({ systemControls: false, top: 0, roomBottom: 0 }));
    const at = (extra: number) => fitsIn(100, 100 + floor + TURN_SCORE_COLUMN_CLEARANCE + extra).layout;
    expect(at(0).tapRow).toBe(TURN_SCORE_TAP_ROW_MIN);
    expect(at(10).tapRow).toBeGreaterThan(TURN_SCORE_TAP_ROW_MIN);
    for (const extra of [0, 5, 10, 20, 40]) {
      const { bottom } = fitsIn(100, 100 + floor + TURN_SCORE_COLUMN_CLEARANCE + extra);
      expect(bottom).toBeLessThanOrEqual(100 + floor + TURN_SCORE_COLUMN_CLEARANCE + extra);
    }
  });

  it('hides the labels before it goes below 32 px', () => {
    const floor = 222 + TURN_SCORE_COLUMN_CLEARANCE;
    const layout = turnScoreColumnLayout({ systemControls: true, top: 100, roomBottom: 100 + floor - 1 });
    expect(layout).toMatchObject({ labels: false, compact: false, tapRow: 32 });
  });

  it('goes compact with the system controls only when the floor with no labels does not fit', () => {
    const unlabelled = turnScoreColumnHeight({ ...turnScoreColumnLayout({ systemControls: false, top: 0, roomBottom: 0 }), labels: false });
    const fits = 144 + unlabelled + TURN_SCORE_COLUMN_CLEARANCE;
    expect(turnScoreColumnLayout({ systemControls: true, top: 144, roomBottom: fits }).compact).toBe(false);
    expect(turnScoreColumnLayout({ systemControls: true, top: 144, roomBottom: fits - 1 }).compact).toBe(true);
  });

  it('keeps the labels on an iPad mini in fullscreen', () => {
    // 744 px tall, a bottom row of about 140 px.
    expect(turnScoreColumnLayout({ systemControls: true, top: 144, roomBottom: 744 - 140 })).toMatchObject({ labels: true, compact: false });
  });

  it('never goes compact without the system controls', () => {
    expect(turnScoreColumnLayout({ systemControls: false, top: 124, roomBottom: 100 })).toMatchObject({ compact: false, tapRow: 32 });
  });

  it('gives a room not measured yet the floor with its labels', () => {
    expect(turnScoreColumnLayout({ systemControls: true, top: 144, roomBottom: 0 })).toMatchObject({ compact: false, labels: true, tapRow: 32 });
  });
});

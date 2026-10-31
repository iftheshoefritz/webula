import {
  TURN_SCORE_COLUMN_CLEARANCE,
  TURN_SCORE_COLUMN_HEIGHT,
  turnScoreColumnCompact,
} from '../../../app/decks/practice/tableScale';

describe('turnScoreColumnCompact (#1395)', () => {
  it('measures the full column as two groups of 68 px, 8 px apart (#1399)', () => {
    expect(TURN_SCORE_COLUMN_HEIGHT).toBe(144);
    expect(TURN_SCORE_COLUMN_CLEARANCE).toBe(8);
  });

  it('keeps the labels on an iPad mini in fullscreen', () => {
    // 744 px tall, a bottom row of about 140 px.
    expect(turnScoreColumnCompact({ systemControls: true, top: 144, roomBottom: 744 - 140 })).toBe(false);
  });

  it('goes compact with the system controls when the room is too short', () => {
    const fits = 144 + TURN_SCORE_COLUMN_HEIGHT + TURN_SCORE_COLUMN_CLEARANCE;
    expect(turnScoreColumnCompact({ systemControls: true, top: 144, roomBottom: fits })).toBe(false);
    expect(turnScoreColumnCompact({ systemControls: true, top: 144, roomBottom: fits - 1 })).toBe(true);
  });

  it('never goes compact without the system controls', () => {
    expect(turnScoreColumnCompact({ systemControls: false, top: 124, roomBottom: 100 })).toBe(false);
  });

  it('counts a room not measured yet as room enough', () => {
    expect(turnScoreColumnCompact({ systemControls: true, top: 144, roomBottom: 0 })).toBe(false);
  });
});

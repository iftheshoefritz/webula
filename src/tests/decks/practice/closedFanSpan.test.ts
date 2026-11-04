import { closedFanSpan } from '../../../app/decks/practice/CardHand';

// Issue #1496: the closed hand sits in the middle of the screen except in the dilemma choice, and
// never leaves the box of the core and the brig.
describe('closedFanSpan', () => {
  const rect = { left: 200, right: 700, width: 500 };

  it('starts at the left or the right end of the anchor (#1489)', () => {
    expect(closedFanSpan('left', rect, 100, 1000)).toEqual({ left: 200, right: 300 });
    expect(closedFanSpan('right', rect, 100, 1000)).toEqual({ left: 600, right: 700 });
  });

  it('centres on the middle of the screen', () => {
    expect(closedFanSpan('center', rect, 100, 900)).toEqual({ left: 400, right: 500 });
  });

  it('slides inward to stay inside the anchor', () => {
    // The screen's middle, 650, would put the right edge at 700 + 0: still inside.
    expect(closedFanSpan('center', rect, 100, 1300)).toEqual({ left: 600, right: 700 });
    // 750 is right of the anchor: the fan stops at its right end.
    expect(closedFanSpan('center', rect, 100, 1500)).toEqual({ left: 600, right: 700 });
    // 150 is left of it: the fan stops at its left end.
    expect(closedFanSpan('center', rect, 100, 300)).toEqual({ left: 200, right: 300 });
  });

  it('is no wider than the anchor', () => {
    expect(closedFanSpan('center', { left: 200, right: 260, width: 60 }, 100, 460)).toEqual({ left: 200, right: 260 });
  });

  it('centres on the screen with no anchor, or one of no width (jsdom)', () => {
    expect(closedFanSpan('center', null, 100, 800)).toEqual({ left: 350, right: 450 });
    expect(closedFanSpan('center', { left: 0, right: 0, width: 0 }, 100, 800)).toEqual({ left: 350, right: 450 });
  });
});

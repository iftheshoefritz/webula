import {
  DESKTOP_VIEWER_CARD_MAX_WIDTH,
  fullCardHeight,
  viewerCardSize,
  VIEWER_CARD_SCALE,
} from '../../../app/decks/practice/viewerCardSize';

describe('viewerCardSize (#802, #806)', () => {
  it('is 1.5x the width of the shared table card', () => {
    expect(VIEWER_CARD_SCALE).toBe(1.5);
    expect(viewerCardSize(1).width).toBe(108);
  });

  it('grows with the table scale', () => {
    expect(viewerCardSize(2).width).toBe(216);
  });

  it('takes its height from the whole card image, not from the cropped art', () => {
    // 120 x 167 is the card image's own size. The cropped art of the table card is shorter than
    // its own width; the full card is taller than its width.
    expect(viewerCardSize(1).height).toBe(fullCardHeight(108));
    expect(viewerCardSize(1).height).toBe(150);
    expect(viewerCardSize(2).height).toBe(301);
    expect(viewerCardSize(1).height).toBeGreaterThan(viewerCardSize(1).width);
  });

  it('caps the width on a desktop, with the height of the full card (#946)', () => {
    // The 1440 x 800 game layer of the issue measures a table scale of 2.5.
    expect(viewerCardSize(2.5).width).toBe(270);
    expect(viewerCardSize(2.5, true).width).toBe(DESKTOP_VIEWER_CARD_MAX_WIDTH);
    expect(viewerCardSize(2.5, true).height).toBe(fullCardHeight(DESKTOP_VIEWER_CARD_MAX_WIDTH));
  });

  it('keeps a smaller card as it is on a desktop, and every size on a touch device (#946)', () => {
    expect(viewerCardSize(1, true)).toEqual(viewerCardSize(1));
    expect(viewerCardSize(3, false).width).toBe(324);
  });
});

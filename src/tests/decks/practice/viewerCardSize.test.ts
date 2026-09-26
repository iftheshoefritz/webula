import { fullCardHeight, viewerCardSize, VIEWER_CARD_SCALE } from '../../../app/decks/practice/viewerCardSize';

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
});

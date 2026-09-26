import { viewerCardSize, VIEWER_CARD_SCALE } from '../../../app/decks/practice/viewerCardSize';

describe('viewerCardSize (#802)', () => {
  it('is 1.5x the shared table card', () => {
    expect(VIEWER_CARD_SCALE).toBe(1.5);
    expect(viewerCardSize(1)).toEqual({ width: 108, artHeight: 96 });
  });

  it('grows with the table scale', () => {
    expect(viewerCardSize(2)).toEqual({ width: 216, artHeight: 192 });
  });
});

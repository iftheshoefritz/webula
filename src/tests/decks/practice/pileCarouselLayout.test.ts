import {
  MAX_CAROUSEL_NEIGHBOURS,
  carouselCardSize,
  carouselLayout,
  carouselNeighbours,
} from '../../../app/decks/practice/pileCarouselLayout';
import { PREVIEW_MAX_HEIGHT } from '../../../app/decks/practice/previewSize';

// #1899: the layout of the pile carousel.
describe('carouselLayout', () => {
  it('sizes the middle card to the height, never past the native image', () => {
    expect(carouselCardSize(2000, 300).cardHeight).toBe(300);
    expect(carouselCardSize(4000, 2000).cardHeight).toBe(PREVIEW_MAX_HEIGHT);
  });

  it('keeps the middle card under half the width, so neighbours show on a narrow screen', () => {
    const { cardWidth } = carouselCardSize(300, 400);
    expect(cardWidth).toBeLessThanOrEqual(300 * 0.46);
    expect(carouselNeighbours(300, cardWidth)).toBeGreaterThanOrEqual(1);
  });

  it('shows at most the cap of neighbours on each side on a wide screen', () => {
    const { cardWidth } = carouselCardSize(4000, 200);
    expect(carouselNeighbours(4000, cardWidth)).toBe(MAX_CAROUSEL_NEIGHBOURS);
  });

  it('lays out the middle card and its neighbours, the middle one on top and turned to face the player', () => {
    const layout = carouselLayout(1280, 500, 24, 5);
    const middle = layout.slots.find((slot) => slot.distance === 0)!;
    expect(middle).toMatchObject({ index: 5, x: 0, scale: 1, rotate: 0, opacity: 1 });
    for (const slot of layout.slots) {
      if (slot.distance === 0) continue;
      expect(slot.zIndex).toBeLessThan(middle.zIndex);
      expect(Math.sign(slot.x)).toBe(Math.sign(slot.index - 5));
      expect(slot.scale).toBeLessThan(1);
    }
  });

  it('shows only the cards the pile has at its ends', () => {
    const layout = carouselLayout(1280, 500, 24, 0);
    expect(Math.min(...layout.slots.map((slot) => slot.index))).toBe(0);
    expect(layout.slots.every((slot) => slot.index >= 0 && slot.index < 24)).toBe(true);
  });

  it('lays out no card for an empty pile or an unmeasured box', () => {
    expect(carouselLayout(1280, 500, 0, 0).slots).toEqual([]);
    expect(carouselLayout(0, 0, 10, 0).slots).toEqual([]);
  });
});

import { ARC_ANGLE_PER_CARD, ARC_MAX_ANGLE, ARC_SAG, handArcLayout } from '../../../app/decks/practice/handArc';

// Half the width a card covers once turned, as the layout computes it.
const halfExtent = (width: number, height: number, angle: number) => {
  const rad = (Math.abs(angle) * Math.PI) / 180;
  return (width / 2) * Math.cos(rad) + (height / 2) * Math.sin(rad);
};

describe('handArcLayout (#1125)', () => {
  it('keeps every turned card between the two piles', () => {
    // About the gap between the draw deck and the dilemma pile at 667 x 375.
    const layout = handArcLayout({ count: 7, cardWidth: 126, maxStep: 135, left: 230, right: 590, bottom: 375 });
    for (const card of layout.cards) {
      const extent = halfExtent(layout.cardWidth, layout.cardHeight, card.angle);
      expect(card.centerX - extent).toBeGreaterThanOrEqual(230 - 0.01);
      expect(card.centerX + extent).toBeLessThanOrEqual(590 + 0.01);
    }
  });

  it('puts each card about half below the bottom edge, on average', () => {
    const layout = handArcLayout({ count: 7, cardWidth: 126, maxStep: 135, left: 230, right: 590, bottom: 375 });
    const mean = layout.cards.reduce((sum, card) => sum + card.centerY, 0) / layout.cards.length;
    expect(mean).toBeCloseTo(375);
  });

  it('turns the ends outward and sets them lower than the middle', () => {
    const { cards } = handArcLayout({ count: 5, cardWidth: 108, maxStep: 116, left: 0, right: 1000, bottom: 600 });
    expect(cards[0].angle).toBeLessThan(0);
    expect(cards[4].angle).toBeGreaterThan(0);
    expect(cards[2].angle).toBe(0);
    expect(cards[0].centerY).toBeGreaterThan(cards[2].centerY);
    expect(cards[4].centerY).toBeGreaterThan(cards[2].centerY);
  });

  it('centres the hand in the gap and spaces no two cards wider than the largest step', () => {
    const { cards } = handArcLayout({ count: 3, cardWidth: 108, maxStep: 116, left: 100, right: 1100, bottom: 600 });
    expect(cards[1].centerX).toBe(600);
    expect(cards[1].centerX - cards[0].centerX).toBe(116);
  });

  it('sags the ends by about half of what #1125 drew (#1132)', () => {
    expect(ARC_SAG).toBe(0.06);
    expect(ARC_MAX_ANGLE).toBe(14);
    expect(ARC_ANGLE_PER_CARD).toBe(3);
    // The share of a card's bounding box below the bottom edge, as getBoundingClientRect measures it.
    const layout = handArcLayout({ count: 7, cardWidth: 126, maxStep: 135, left: 0, right: 2000, bottom: 375 });
    const share = (card: { centerY: number; angle: number }) => {
      const rad = (Math.abs(card.angle) * Math.PI) / 180;
      const half = (layout.cardHeight / 2) * Math.cos(rad) + (layout.cardWidth / 2) * Math.sin(rad);
      return (card.centerY + half - 375) / (2 * half);
    };
    const shares = layout.cards.map(share);
    // 0.56 vs 0.45 before, a difference of 0.11.
    expect(shares[0] - shares[3]).toBeGreaterThan(0.04);
    expect(shares[0] - shares[3]).toBeLessThan(0.07);
    const mean = shares.reduce((sum, s) => sum + s, 0) / shares.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it('draws a narrower card when the gap is narrower than one card', () => {
    const layout = handArcLayout({ count: 1, cardWidth: 126, maxStep: 135, left: 0, right: 80, bottom: 375 });
    expect(layout.cardWidth).toBe(80);
    expect(layout.cards[0].angle).toBe(0);
  });
});

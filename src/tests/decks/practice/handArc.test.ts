import {
  ARC_ANGLE_PER_CARD,
  ARC_MAX_ANGLE,
  ARC_SAG,
  ARC_TOUCH_LOWER,
  ArcLayout,
  handArcLayout,
} from '../../../app/decks/practice/handArc';

// Half the width a card covers once turned, as the layout computes it.
const halfExtent = (width: number, height: number, angle: number) => {
  const rad = (Math.abs(angle) * Math.PI) / 180;
  return (width / 2) * Math.cos(rad) + (height / 2) * Math.sin(rad);
};

// A corner of a card, from its local offset, once turned clockwise around its centre.
const corner = (card: { centerX: number; centerY: number; angle: number }, dx: number, dy: number) => {
  const rad = (card.angle * Math.PI) / 180;
  return {
    x: card.centerX + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: card.centerY + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
};

// Whether point `p` lies inside a card, on its left side of the card's right edge (side 1) or on its
// right side of the card's left edge (side -1).
const insideEdge = (
  card: { centerX: number; centerY: number; angle: number },
  width: number,
  p: { x: number; y: number },
  side: 1 | -1,
) => {
  const rad = (card.angle * Math.PI) / 180;
  const localX = (p.x - card.centerX) * Math.cos(rad) + (p.y - card.centerY) * Math.sin(rad);
  return side === 1 ? localX <= width / 2 + 0.01 : localX >= -width / 2 - 0.01;
};

const expectNeighboursTouch = (layout: ArcLayout) => {
  const { cardWidth: w, cardHeight: h, cards } = layout;
  for (let i = 0; i + 1 < cards.length; i++) {
    // The facing edges cross at or above both top corners, so no gap shows below them.
    expect(insideEdge(cards[i], w, corner(cards[i + 1], -w / 2, -h / 2), 1)).toBe(true);
    expect(insideEdge(cards[i + 1], w, corner(cards[i], w / 2, -h / 2), -1)).toBe(true);
    // The visible tops overlap: the top-right corner of a card is right of its neighbour's top-left.
    expect(corner(cards[i], w / 2, -h / 2).x).toBeGreaterThanOrEqual(corner(cards[i + 1], -w / 2, -h / 2).x);
  }
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
    expect(cards[1].centerX - cards[0].centerX).toBeLessThanOrEqual(116);
    // A small maxStep still wins over the touching step.
    const tight = handArcLayout({
      count: 3,
      cardWidth: 108,
      maxStep: 50,
      left: 100,
      right: 1100,
      bottom: 600,
    });
    expect(tight.cards[1].centerX - tight.cards[0].centerX).toBe(50);
  });

  it('spaces a small hand no wider than a card, so no gap shows between neighbours (#1153)', () => {
    for (let count = 2; count <= 7; count++) {
      // About the open card width at 667 x 375, and its old largest step, in a gap too wide to limit it.
      const layout = handArcLayout({
        count,
        cardWidth: 97,
        maxStep: 104,
        left: 0,
        right: 2000,
        bottom: 375,
      });
      expect(layout.cardWidth).toBe(97);
      const step = layout.cards[1].centerX - layout.cards[0].centerX;
      expect(step).toBeLessThanOrEqual(layout.cardWidth);
      expect(step).toBeGreaterThan(0.8 * layout.cardWidth);
      expectNeighboursTouch(layout);
    }
  });

  it('caps the step by the width it draws, not the width it was asked for (#1153)', () => {
    // A turned card of 126 px does not fit in 100 px, so the arc draws a narrower one.
    const layout = handArcLayout({
      count: 2,
      cardWidth: 126,
      maxStep: 135,
      left: 0,
      right: 100,
      bottom: 375,
    });
    expect(layout.cardWidth).toBeLessThan(126);
    const step = layout.cards[1].centerX - layout.cards[0].centerX;
    expect(step).toBeLessThanOrEqual(layout.cardWidth);
    expectNeighboursTouch(layout);
  });

  it('spaces a long hand in a narrow gap by the gap, as before (#1153)', () => {
    const layout = handArcLayout({
      count: 7,
      cardWidth: 126,
      maxStep: 135,
      left: 230,
      right: 590,
      bottom: 375,
    });
    const extent = halfExtent(layout.cardWidth, layout.cardHeight, ARC_MAX_ANGLE);
    expect(layout.cards[1].centerX - layout.cards[0].centerX).toBeCloseTo((360 - 2 * extent) / 6);
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

describe('handArcLayout lower (#1149)', () => {
  it('moves every card down by a part of the visible height, and nothing else', () => {
    const input = { count: 7, cardWidth: 126, maxStep: 135, left: 230, right: 590, bottom: 375 };
    const plain = handArcLayout(input);
    const lowered = handArcLayout({ ...input, lower: ARC_TOUCH_LOWER });
    const drop = ARC_TOUCH_LOWER * plain.visibleHeight;
    expect(drop).toBeGreaterThan(0);
    expect(lowered.cardWidth).toBe(plain.cardWidth);
    expect(lowered.cardHeight).toBe(plain.cardHeight);
    lowered.cards.forEach((card, i) => {
      expect(card.centerX).toBeCloseTo(plain.cards[i].centerX);
      expect(card.angle).toBeCloseTo(plain.cards[i].angle);
      expect(card.centerY).toBeCloseTo(plain.cards[i].centerY + drop);
    });
    expect(lowered.visibleHeight).toBeCloseTo(0.8 * plain.visibleHeight);
  });
});

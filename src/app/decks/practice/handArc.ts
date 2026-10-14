// Issue #1125: the open hand drawn as an arc along the bottom edge of the screen, the way a
// player holds a fanned hand of cards. Each card's centre sits near the bottom edge, so about half
// of each card is below the screen. The cards near the ends of the arc turn outward and sit lower
// than the ones in the middle. The arc stays between `left` and `right`, the right edge of the draw
// deck and the left edge of the dilemma pile, so it never covers either pile.

// The angle of a card at either end of the arc, at most, in degrees.
export const ARC_MAX_ANGLE = 14;
// The angle the arc adds per card, so a short hand turns less than a long one.
export const ARC_ANGLE_PER_CARD = 3;
// How much lower the cards at the ends sit than the card in the middle, as a part of the card's
// height.
export const ARC_SAG = 0.12;

const IMAGE_RATIO = 167 / 120;

export type ArcCard = {
  // The centre of the card, in viewport coordinates, before it turns.
  centerX: number;
  centerY: number;
  // The turn of the card around its centre, in degrees; positive turns clockwise.
  angle: number;
};

export type ArcLayout = {
  cardWidth: number;
  cardHeight: number;
  cards: ArcCard[];
  // The height of the arc above the bottom edge, the highest point of any card.
  visibleHeight: number;
};

// Half the width a card covers once turned by `angle` degrees around its centre.
function halfExtent(width: number, height: number, angle: number): number {
  const rad = (Math.abs(angle) * Math.PI) / 180;
  return (width / 2) * Math.cos(rad) + (height / 2) * Math.sin(rad);
}

export function handArcLayout({
  count,
  cardWidth,
  maxStep,
  left,
  right,
  bottom,
}: {
  count: number;
  // The card width the hand wants; the arc draws narrower cards when the gap is too small.
  cardWidth: number;
  // The largest distance between the centres of two neighbouring cards.
  maxStep: number;
  // The free gap the arc must stay inside, and the bottom edge of the screen.
  left: number;
  right: number;
  bottom: number;
}): ArcLayout {
  const endAngle = count > 1 ? Math.min(ARC_MAX_ANGLE, ARC_ANGLE_PER_CARD * (count - 1)) : 0;
  const rad = (endAngle * Math.PI) / 180;
  const gap = Math.max(0, right - left);
  // A single turned card must fit in the gap.
  const fitWidth = gap / (Math.cos(rad) + IMAGE_RATIO * Math.sin(rad));
  const width = Math.max(1, Math.min(cardWidth, Math.floor(fitWidth)));
  const height = Math.round(width * IMAGE_RATIO);
  const extent = halfExtent(width, height, endAngle);
  const range = Math.max(0, gap - 2 * extent);
  const step = count > 1 ? Math.min(maxStep, range / (count - 1)) : 0;
  const span = step * (count - 1);
  const middle = (left + right) / 2;

  const ts = Array.from({ length: count }, (_, i) => (count > 1 ? (2 * i) / (count - 1) - 1 : 0));
  // The sag is shifted so the cards are, on average, half below the bottom edge.
  const meanSquare = count > 0 ? ts.reduce((sum, t) => sum + t * t, 0) / count : 0;
  const sag = height * ARC_SAG;
  const cards = ts.map((t, i) => ({
    centerX: middle - span / 2 + i * step,
    centerY: bottom + sag * (t * t - meanSquare),
    angle: t * endAngle,
  }));
  const visibleHeight = cards.reduce((max, card) => {
    const turned = (Math.abs(card.angle) * Math.PI) / 180;
    const top = card.centerY - ((height / 2) * Math.cos(turned) + (width / 2) * Math.sin(turned));
    return Math.max(max, bottom - top);
  }, 0);
  return { cardWidth: width, cardHeight: height, cards, visibleHeight };
}

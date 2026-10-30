// Issue #1125: the open hand drawn as an arc along the bottom edge of the screen, the way a
// player holds a fanned hand of cards. Each card's centre sits near the bottom edge, so about half
// of each card is below the screen, and on a touch screen the arc sits lower still (#1149). The cards near the ends of the arc turn outward and sit lower
// than the ones in the middle. On a touch screen the arc is flatter, with no sag and half the turn,
// and every card's lowest top corner stays at least `ARC_TOUCH_MIN_VISIBLE` above the bottom edge,
// clear of the iOS edge gesture (#1380). The arc stays between `left` and `right`, the right edge of the draw
// deck and the left edge of the dilemma pile, so it never covers either pile.

// The angle of a card at either end of the arc, at most, in degrees.
export const ARC_MAX_ANGLE = 14;
// The angle the arc adds per card, so a short hand turns less than a long one.
export const ARC_ANGLE_PER_CARD = 3;
// How much lower the cards at the ends sit than the card in the middle, as a part of the card's
// height. Issue #1132 halved it from 0.12, so the arc is flatter.
export const ARC_SAG = 0.06;

// Issue #1153: how far the top corners of two neighbouring cards overlap at the largest step, as a
// part of the card's width, so no strip of the table shows between them.
export const ARC_TOP_OVERLAP = 0.04;

// Issue #1149: how far the arc sits lower on a touch screen, as a part of its visible height, so
// each card shows 20% less of itself above the bottom edge.
// Issue #1380 caps that drop, so it never takes a card below `ARC_TOUCH_MIN_VISIBLE`.
export const ARC_TOUCH_LOWER = 0.2;

// Issue #1380: the touch arc. The ends sit no lower than the middle and turn half as far, so an
// outer card shows about as much of itself as the middle card does.
export const ARC_TOUCH_SAG = 0;
export const ARC_TOUCH_MAX_ANGLE = 7;
// Issue #1380: how far above the bottom edge the lowest top corner of every card sits, at least, on
// a touch screen: a band of 20 px for the iOS edge gesture plus the 44 px of a touch target.
export const ARC_TOUCH_MIN_VISIBLE = 64;

// The options `CardHand` passes to `handArcLayout` with a coarse pointer.
export const ARC_TOUCH_OPTIONS = {
  lower: ARC_TOUCH_LOWER,
  sag: ARC_TOUCH_SAG,
  maxAngle: ARC_TOUCH_MAX_ANGLE,
  minVisible: ARC_TOUCH_MIN_VISIBLE,
};

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

// Issue #1153: the largest distance between the centres of two neighbouring cards at which their
// facing edges still cross at or above both top corners, less `ARC_TOP_OVERLAP`. The edges of a fan
// part toward the top, so cards that cross at their top corners touch along their whole visible
// height. `dy` is how much lower the right card's centre sits than the left one's.
function touchingStep(width: number, height: number, left: number, right: number, dy: number): number {
  const a = (left * Math.PI) / 180;
  const b = (right * Math.PI) / 180;
  // The top-right corner of the left card and the top-left corner of the right card, from each
  // card's centre, once turned clockwise by its angle.
  const leftCornerX = (width / 2) * Math.cos(a) + (height / 2) * Math.sin(a);
  const leftCornerY = (width / 2) * Math.sin(a) - (height / 2) * Math.cos(a);
  const rightCornerX = -(width / 2) * Math.cos(b) + (height / 2) * Math.sin(b);
  const rightCornerY = -(width / 2) * Math.sin(b) - (height / 2) * Math.cos(b);
  // The right card's top-left corner lies inside the left card's right edge, and the left card's
  // top-right corner lies inside the right card's left edge.
  const byLeftEdge = (width / 2 - rightCornerX * Math.cos(a) - (dy + rightCornerY) * Math.sin(a)) / Math.cos(a);
  const byRightEdge = (width / 2 + leftCornerX * Math.cos(b) + (leftCornerY - dy) * Math.sin(b)) / Math.cos(b);
  return Math.min(byLeftEdge, byRightEdge) - ARC_TOP_OVERLAP * width;
}

export function handArcLayout({
  count,
  cardWidth,
  maxStep,
  left,
  right,
  bottom,
  lower = 0,
  sag: sagShare = ARC_SAG,
  maxAngle = ARC_MAX_ANGLE,
  minVisible = 0,
}: {
  count: number;
  // The card width the hand wants; the arc draws narrower cards when the gap is too small.
  cardWidth: number;
  // The largest distance between the centres of two neighbouring cards. The arc spaces its cards
  // no wider than the step at which neighbours still touch, whatever this says (#1153).
  maxStep: number;
  // The free gap the arc must stay inside, and the bottom edge of the screen.
  left: number;
  right: number;
  bottom: number;
  // How far to move the whole arc down, as a part of its visible height (#1149). Every card moves
  // the same distance, so the sag, the turns and the spacing do not change.
  lower?: number;
  // How much lower the ends sit than the middle, as a part of the card's height, and the angle of a
  // card at either end, at most, in degrees. A touch screen draws a flatter arc (#1380).
  sag?: number;
  maxAngle?: number;
  // How far above the bottom edge the lowest top corner of every card stays, at least (#1380). It
  // caps the drop of `lower`, and it lifts the arc when the cards are small, but never so far that
  // the bottom edge of a card rises above the bottom edge of the screen.
  minVisible?: number;
}): ArcLayout {
  const endAngle = count > 1 ? Math.min(maxAngle, ARC_ANGLE_PER_CARD * (count - 1)) : 0;
  const rad = (endAngle * Math.PI) / 180;
  const gap = Math.max(0, right - left);
  // A single turned card must fit in the gap.
  const fitWidth = gap / (Math.cos(rad) + IMAGE_RATIO * Math.sin(rad));
  const width = Math.max(1, Math.min(cardWidth, Math.floor(fitWidth)));
  const height = Math.round(width * IMAGE_RATIO);
  const extent = halfExtent(width, height, endAngle);
  const range = Math.max(0, gap - 2 * extent);
  const ts = Array.from({ length: count }, (_, i) => (count > 1 ? (2 * i) / (count - 1) - 1 : 0));
  // The sag is shifted so the cards are, on average, half below the bottom edge.
  const meanSquare = count > 0 ? ts.reduce((sum, t) => sum + t * t, 0) / count : 0;
  const sag = height * sagShare;
  const touching = ts
    .slice(1)
    .reduce(
      (min, t, i) =>
        Math.min(min, touchingStep(width, height, ts[i] * endAngle, t * endAngle, sag * (t * t - ts[i] * ts[i]))),
      Infinity,
    );
  const step = count > 1 ? Math.max(0, Math.min(maxStep, touching, range / (count - 1))) : 0;
  const span = step * (count - 1);
  const middle = (left + right) / 2;

  const cards = ts.map((t, i) => ({
    centerX: middle - span / 2 + i * step,
    centerY: bottom + sag * (t * t - meanSquare),
    angle: t * endAngle,
  }));
  const fullHeight = cards.reduce((max, card) => {
    const turned = (Math.abs(card.angle) * Math.PI) / 180;
    const top = card.centerY - ((height / 2) * Math.cos(turned) + (width / 2) * Math.sin(turned));
    return Math.max(max, bottom - top);
  }, 0);
  let drop = lower * fullHeight;
  if (minVisible > 0 && cards.length > 0) {
    // The lowest point of each card's top edge, and the highest point of its bottom edge.
    const reach = (card: ArcCard) => {
      const turned = (Math.abs(card.angle) * Math.PI) / 180;
      return (width / 2) * Math.sin(turned) - (height / 2) * Math.cos(turned);
    };
    const lowestTop = Math.max(...cards.map((card) => card.centerY + reach(card)));
    const highestBottom = Math.min(...cards.map((card) => card.centerY - reach(card)));
    drop = Math.max(Math.min(drop, bottom - minVisible - lowestTop), bottom - highestBottom);
  }
  return {
    cardWidth: width,
    cardHeight: height,
    cards: drop ? cards.map((card) => ({ ...card, centerY: card.centerY + drop })) : cards,
    visibleHeight: fullHeight - drop,
  };
}

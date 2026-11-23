// The layout of the pile carousel (#1898, #1899): one large card in the middle, and its neighbours
// on each side smaller, turned away and fainter, as many as fit the width. Pure, so the tests can
// check it without a browser.

import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH } from './viewerCardSize';
import { PREVIEW_MAX_HEIGHT } from './previewSize';

// The most neighbours on each side of the middle card.
export const MAX_CAROUSEL_NEIGHBOURS = 4;
// The middle card never takes more than this share of the carousel's width, so at least one
// neighbour shows on each side.
const MAX_MIDDLE_WIDTH_SHARE = 0.46;
// The centre of the first neighbour sits this many middle-card widths from the middle card's
// centre, and each further neighbour this many more.
const FIRST_STEP = 0.66;
const NEXT_STEP = 0.36;
// The angle a neighbour turns away from the middle, in degrees.
const NEIGHBOUR_TURN = 30;

export type CarouselSlot = {
  // The card's place in the pile.
  index: number;
  // Its distance from the middle card: 0 is the middle card.
  distance: number;
  // The offset of its centre from the carousel's centre, in px.
  x: number;
  scale: number;
  // rotateY, in degrees: a card left of the middle turns its face to the right.
  rotate: number;
  opacity: number;
  zIndex: number;
};

export type CarouselLayout = {
  cardWidth: number;
  cardHeight: number;
  slots: CarouselSlot[];
};

export function carouselScale(distance: number): number {
  return distance === 0 ? 1 : Math.max(0.55, 0.82 - (distance - 1) * 0.08);
}

export function carouselOffset(distance: number, cardWidth: number): number {
  if (distance === 0) return 0;
  return cardWidth * (FIRST_STEP + (distance - 1) * NEXT_STEP);
}

// The size of the middle card: as tall as the carousel allows, never taller than the card images
// (`PREVIEW_MAX_HEIGHT`), and never wider than its share of the width.
export function carouselCardSize(width: number, height: number): { cardWidth: number; cardHeight: number } {
  const ratio = CARD_IMAGE_WIDTH / CARD_IMAGE_HEIGHT;
  let cardHeight = Math.max(0, Math.min(height, PREVIEW_MAX_HEIGHT));
  let cardWidth = cardHeight * ratio;
  const maxWidth = width * MAX_MIDDLE_WIDTH_SHARE;
  if (cardWidth > maxWidth) {
    cardWidth = maxWidth;
    cardHeight = cardWidth / ratio;
  }
  return { cardWidth: Math.floor(cardWidth), cardHeight: Math.floor(cardHeight) };
}

// How many neighbours fit on each side: the outer edge of the last one stays inside the carousel.
export function carouselNeighbours(width: number, cardWidth: number): number {
  let neighbours = 0;
  for (let distance = 1; distance <= MAX_CAROUSEL_NEIGHBOURS; distance += 1) {
    const outerEdge = carouselOffset(distance, cardWidth) + (cardWidth * carouselScale(distance)) / 2;
    if (outerEdge > width / 2) break;
    neighbours = distance;
  }
  return neighbours;
}

export function carouselLayout(width: number, height: number, count: number, index: number): CarouselLayout {
  const { cardWidth, cardHeight } = carouselCardSize(width, height);
  if (count === 0 || cardWidth === 0) return { cardWidth, cardHeight, slots: [] };
  const middle = Math.max(0, Math.min(count - 1, index));
  const neighbours = carouselNeighbours(width, cardWidth);
  const slots: CarouselSlot[] = [];
  for (let i = Math.max(0, middle - neighbours); i <= Math.min(count - 1, middle + neighbours); i += 1) {
    const signed = i - middle;
    const distance = Math.abs(signed);
    const side = signed < 0 ? -1 : 1;
    slots.push({
      index: i,
      distance,
      x: side * carouselOffset(distance, cardWidth),
      scale: carouselScale(distance),
      rotate: distance === 0 ? 0 : -side * NEIGHBOUR_TURN,
      opacity: distance === 0 ? 1 : Math.max(0.35, 0.9 - (distance - 1) * 0.18),
      zIndex: MAX_CAROUSEL_NEIGHBOURS + 1 - distance,
    });
  }
  return { cardWidth, cardHeight, slots };
}

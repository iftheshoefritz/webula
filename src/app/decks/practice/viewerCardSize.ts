// Kept apart from `tableScale.ts`, which imports the reducer: `CardListPanel` and `CardHand` read this
// size, and their tests mock `@dnd-kit/core` too thinly for the reducer's imports to load.
import { TABLE_CARD_WIDTH } from './TableCard';

// Issue #802: every viewer — a card list panel's grid, the dilemma stack's row, and the open fan of
// the hand and of the dilemma hand — draws its card at this multiple of the shared table card.
// The size is fixed: it does not depend on the card count and does not shrink to fit. The extra
// height of a full-height panel only adds rows, and a pile that still does not fit scrolls.
export const VIEWER_CARD_SCALE = 1.5;

// How far a viewer sits from the top of the game layer. A card list panel's own box starts this
// many pixels down (`CardListPanel.tsx`), and the open fan (`CardHand.tsx`) takes the same top. A
// panel anchors its bottom just above the bottom row (#828) and grows upward, so only a panel
// that fills its area starts at the same height as a fan. The fan sat at the bottom of the screen
// before, where it covered the draw pile and the dilemma pile, the two taps the player needs
// while a hand is open.
export const VIEWER_TOP_INSET = 8; // px, Tailwind's `inset-2`

// The card image is 120 x 167. A viewer draws the whole image, frame and text included, so its
// height follows its width at that ratio.
export const CARD_IMAGE_WIDTH = 120;
export const CARD_IMAGE_HEIGHT = 167;

export function fullCardHeight(width: number): number {
  return Math.round((width * CARD_IMAGE_HEIGHT) / CARD_IMAGE_WIDTH);
}

// The viewer card's width and height at a given table `scale`: 108 x 150 at scale 1. Every
// viewer shows the full card, not the cropped art the table card shows, so a player who opens a
// panel reads the card's own text there (#806).
export function viewerCardSize(scale: number): { width: number; height: number } {
  const width = Math.round(TABLE_CARD_WIDTH * scale * VIEWER_CARD_SCALE);
  return { width, height: fullCardHeight(width) };
}

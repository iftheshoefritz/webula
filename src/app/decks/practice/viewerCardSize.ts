// Kept apart from `tableScale.ts`, which imports the reducer: `PilePanel` and `CardHand` read this
// size, and their tests mock `@dnd-kit/core` too thinly for the reducer's imports to load.
import { TABLE_CARD_WIDTH, TABLE_CARD_ART_HEIGHT } from './TableCard';

// Issue #802: every viewer — a pile panel's grid, the dilemma stack's row, and the open fan of
// the hand and of the dilemma hand — draws its card at this multiple of the shared table card.
// The size is fixed: it does not depend on the card count and does not shrink to fit. The extra
// height of a full-height panel only adds rows, and a pile that still does not fit scrolls.
export const VIEWER_CARD_SCALE = 1.5;

// The viewer card's width and cropped-art height at a given table `scale`: 108 x 96 at scale 1.
export function viewerCardSize(scale: number): { width: number; artHeight: number } {
  return {
    width: Math.round(TABLE_CARD_WIDTH * scale * VIEWER_CARD_SCALE),
    artHeight: Math.round(TABLE_CARD_ART_HEIGHT * scale * VIEWER_CARD_SCALE),
  };
}

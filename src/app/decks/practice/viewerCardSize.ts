// Kept apart from `tableScale.ts`, which imports the reducer: `CardListPanel` and `CardHand` read this
// size, and their tests mock `@dnd-kit/core` too thinly for the reducer's imports to load.
import { TABLE_CARD_ART_HEIGHT, TABLE_CARD_WIDTH } from './TableCard';

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

// The height of the art crop the table card shows (`TableCard`), at a given width: the top of
// the card image at the ratio of `TABLE_CARD_ART_HEIGHT` to `TABLE_CARD_WIDTH`. 96 px at 108 px.
export function artCropHeight(width: number): number {
  return Math.round((width * TABLE_CARD_ART_HEIGHT) / TABLE_CARD_WIDTH);
}

// Issue #946: on a desktop (`(pointer: fine)`, see `useFinePointer.ts`) a viewer card is no wider
// than this, however big the monitor. The table scale has no upper limit, and at 1440 x 800 it
// drew a panel card 270 px wide. At 170 px the player still reads the name, the cost and the
// icons, and the hover preview (`CardPreview.tsx`) shows the game text.
export const DESKTOP_VIEWER_CARD_MAX_WIDTH = 170;

// The viewer card's width and height at a given table `scale`: 108 x 150 at scale 1. Every
// viewer shows the full card, not the cropped art the table card shows, so a player who opens a
// panel reads the card's own text there (#806). The one exception (#1071): on a phone or a tablet
// the crew panel and the away team panel draw their cards as the art crop (`artCropHeight`).
// `finePointer` caps the width on a desktop (#946); a touch device keeps the size of the table scale.
export function viewerCardSize(scale: number, finePointer = false): { width: number; height: number } {
  const scaled = Math.round(TABLE_CARD_WIDTH * scale * VIEWER_CARD_SCALE);
  const width = finePointer ? Math.min(scaled, DESKTOP_VIEWER_CARD_MAX_WIDTH) : scaled;
  return { width, height: fullCardHeight(width) };
}

// The size of the large card preview (`CardPreview`), and the rule for when it may open (#1458).
// Kept apart from `CardPreview.tsx` and `useCardHold.ts`, so the rule is a pure function a test
// calls with plain numbers.
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH, fullCardHeight } from './viewerCardSize';
import { FINE_POINTER_QUERY } from './useFinePointer';

// Issue #946, #1458: on a desktop (`(pointer: fine)`) the preview is no taller than the native
// height of the files in `public/cardimages/`, 357 x 499 px, so the browser never scales the image
// up until it looks soft. A touch device keeps 90% of the screen, and so does a desktop window
// shorter than the cap allows.
export const PREVIEW_MAX_HEIGHT = 499; // px
// The width of the desktop preview at that height. A function, not a constant: `viewerCardSize.ts`
// imports `TableCard.tsx`, which imports `useCardHold.ts`, which imports this file, so the card
// ratio is not yet defined while this module loads.
export function previewMaxWidth(): number {
  return Math.round((PREVIEW_MAX_HEIGHT * CARD_IMAGE_WIDTH) / CARD_IMAGE_HEIGHT);
}
// The share of the screen's height the preview takes, below the cap.
export const PREVIEW_SCREEN_SHARE = 0.9;

// With a fine pointer, a preview opens only when it is at least this many times as tall as the
// whole card at the on-screen card's width. A preview no larger than the card already on the
// screen shows nothing new, and the cap above means it cannot grow to fix that.
export const PREVIEW_MIN_ENLARGEMENT = 1.25;

// The height the preview draws at, in a window of this height.
export function previewHeightFor(viewportHeight: number, finePointer: boolean): number {
  const share = viewportHeight * PREVIEW_SCREEN_SHARE;
  return finePointer ? Math.min(share, PREVIEW_MAX_HEIGHT) : share;
}

// The card under the pointer, as its bounding rectangle on the screen. `turned` marks a card drawn
// turned 90° (a completed mission, #1060), whose rectangle lies on its long side.
export type OnScreenCard = { width: number; height: number; turned?: boolean };

// The height of the whole card the on-screen card stands for. A card drawn whole is its own
// height; an art crop (`TableCard`) is the whole card at its width; a turned card is its long side.
export function wholeCardHeight({ width, height, turned = false }: OnScreenCard): number {
  if (turned) return Math.max(width, height);
  return Math.max(height, fullCardHeight(width));
}

// Whether the preview may open over this card. A coarse pointer always opens it. With a fine
// pointer it opens only when it is at least `PREVIEW_MIN_ENLARGEMENT` times as tall as the whole
// card: a card at the threshold, or larger, gets none.
export function previewEnlarges(card: OnScreenCard, previewHeight: number, finePointer: boolean): boolean {
  if (!finePointer) return true;
  return wholeCardHeight(card) * PREVIEW_MIN_ENLARGEMENT < previewHeight;
}

// The on-screen card of an element. A transform on the element or above it (the turn of a
// completed mission, a scale) changes the bounding rectangle but not `offsetWidth` and
// `offsetHeight`, so the two together say whether the card lies on its side. Null when the element
// has no layout (a test's DOM).
export function onScreenCardOf(element: Element): OnScreenCard | null {
  if (!(element instanceof HTMLElement)) return null;
  const { offsetWidth: w, offsetHeight: h } = element;
  const rect = element.getBoundingClientRect();
  if (!w || !h || !rect.width || !rect.height) return null;
  const scale = Math.sqrt((rect.width * rect.height) / (w * h));
  const turned = w !== h && Math.abs(rect.width - h * scale) < Math.abs(rect.width - w * scale);
  return { width: rect.width, height: rect.height, turned };
}

// The rule for a live element, read when the hover or the hold starts.
export function previewEnlargesElement(element: Element | null): boolean {
  if (!element || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  const finePointer = window.matchMedia(FINE_POINTER_QUERY).matches;
  if (!finePointer) return true;
  const card = onScreenCardOf(element);
  if (!card) return true;
  return previewEnlarges(card, previewHeightFor(window.innerHeight, true), true);
}

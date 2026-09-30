'use client';

// Compact "table card" presentation (see the parent design in issue #130): shows only a
// slice of the card image (the art), rather than the full card art+frame used in the hand and
// the piles. The vertical crop starts at the top of the image (`object-top`) and runs down far
// enough to keep the same bottom edge #665 set: centering (#633) cut too much off the top and
// left too much of the bottom, #665 moved the crop window down to fix the bottom edge but then
// cut off the top of the art itself, and #673 grows the crop window upward, to the top of the
// image, instead of moving it, so the bottom edge stays exactly where #665 left it. The card's
// name is not
// shown as text below the art — the art already carries the card's title, and the player
// recognises the image (#634) — but it stays on the button's `aria-label`, so a screen reader
// still reads it. Reused for any card that sits on the table rather than in a hand or a pile
// (missions, #599 ships).
//
// A face-down card shows the card back instead of the art, and its title is blank: the face-down
// state is exactly what must not be visible on the table (the preview is the only place the
// owner reads the card while it is down).
//
// The whole card is a `<button>`. The tap acts, the hold looks: a press and hold shows the large
// preview (`useCardHold`), and a tap calls `onClick`, if the caller gives one (a ship opens its
// crew panel; a tap on the top half of a mission opens the cards under it, #917). A ship in a ship row is also draggable (#599), so the
// same `<button>` also joins `useDraggable`, following `CardHand`'s `DraggableFanCard` pattern:
// `listeners`/`attributes`/`setNodeRef` on the same element that has the `onClick`. dnd-kit only returns `listeners` when the draggable is enabled, so a
// non-draggable table card (a mission) can spread them unconditionally with no effect.

import { useDraggable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import { NO_CALLOUT_STYLE, useCardHold } from './useCardHold';

export const TABLE_CARD_WIDTH = 72; // px
// px, crops the card image down to roughly its art box. At this width the full card image is
// about 100px high; the crop starts at its top edge (`object-top` below) and runs to the same
// bottom edge #665 set (12px down from the top, so 64px tall keeps that same bottom edge, #673).
export const TABLE_CARD_ART_HEIGHT = 64; // px

// The small card size. It is not a ship's size: it sizes a ship in a mission's ship row
// (`MissionRow.tsx`, which grows it with `scale`), every card of any type in the core and the brig
// (`FlatCardRow.tsx`, which does not grow it, #717), a ship preview's crew row (#600), and part of
// the height of the dilemma stack (`page.tsx`). Given at its base (scale-1) size.
export const SMALL_CARD_WIDTH = 34; // px
export const SMALL_CARD_ART_HEIGHT = 32; // px, scaled down from TABLE_CARD_ART_HEIGHT to match

// The card image is 120x167. The height of the whole, uncropped card at a given width (#926).
export const fullCardHeight = (width: number): number => Math.round((width * 167) / 120);

// The shared "stopped" look (#679): a stopped personnel card's image shows greyed out, like a
// disabled UI element, everywhere it appears — here, in a card list panel (`CardListPanel.tsx`, which
// also covers a ship's crew panel), and in the large preview (`CardPreview.tsx`). A face-down
// stopped card shows the card back with this same style, since it applies to the `<img>`
// regardless of which image it renders.
export const STOPPED_IMAGE_CLASSNAME = 'grayscale opacity-50';

// The image of a card's face-up side (#765): the back face of a flipped double-sided mission, or
// the front of every other card. This is never `cardback.jpg`; a caller that shows a face-down
// card as face down checks `face` itself.
export function faceUpImageSrc(instance: CardInstance): string {
  const { card } = instance;
  const imagefile = instance.flipped && card.backimagefile ? card.backimagefile : card.imagefile;
  return `/cardimages/${imagefile}.jpg`;
}

export default function TableCard({
  instance,
  onClick,
  width = TABLE_CARD_WIDTH,
  artHeight = TABLE_CARD_ART_HEIGHT,
  draggable = false,
  holdable = true,
  uncropped = false,
  draggableId,
}: {
  instance: CardInstance;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  width?: number;
  artHeight?: number;
  draggable?: boolean;
  // Press and hold opens the preview (#763). Off for a card that has no preview, such as the
  // dilemma under a mission.
  holdable?: boolean;
  // Shows the whole card, frame and all, instead of the art crop (#926). Used by the core and the
  // brig. `artHeight` is ignored: the height follows from the width.
  uncropped?: boolean;
  // The id the card drags under, when it is not the card's own id: a card shown in a card list
  // panel drags under `panelDraggableId` (#913), such as a tiny card placed on a ship (#963).
  draggableId?: string;
}) {
  const { card, face } = instance;
  const isFaceDown = face === 'down';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId ?? instance.id,
    disabled: !draggable,
  });
  const holdListeners = useCardHold(instance.id, listeners);

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-card-id={instance.id}
      onClick={onClick}
      {...attributes}
      {...(holdable ? holdListeners : listeners)}
      className={`flex flex-col items-center focus:outline-none ${draggable ? 'touch-none' : 'touch-manipulation'}`}
      style={{
        ...NO_CALLOUT_STYLE,
        width,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      aria-label={isFaceDown ? 'Face-down card' : card.name}
    >
      <div className="relative w-full" style={{ height: uncropped ? fullCardHeight(width) : artHeight }}>
        <div className="w-full h-full rounded-md overflow-hidden bg-black/20">
          <img
            src={isFaceDown ? '/cardimages/cardback.jpg' : faceUpImageSrc(instance)}
            alt={isFaceDown ? 'Face-down card' : card.name}
            className={`w-full h-full ${uncropped ? 'object-contain' : 'object-cover object-top'} ${instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''}`}
            style={NO_CALLOUT_STYLE}
          />
        </div>
      </div>
    </button>
  );
}

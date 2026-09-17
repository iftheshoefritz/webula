'use client';

// Compact "table card" presentation (see the parent design in issue #130): shows only the top
// portion of the card image (the art) with the title in small text below, rather than the full
// card art+frame used in the hand and the piles. The title stays separate from the cropped art,
// which would be illegible at this width. Reused by later slices for any card that sits on the
// table rather than in a hand or a pile (#598 tap preview and flip, #599 ships).
//
// A face-down card shows the card back instead of the art, and its title is blank: the face-down
// state is exactly what must not be visible on the table (the preview is the only place the
// owner reads the card while it is down; see #598).
//
// A tap opens the large preview (#598): the whole card is a `<button>`, following the same
// tappable-card convention as `CardHand`'s fan cards. A ship in a ship row is also draggable
// (#599), so the same `<button>` also joins `useDraggable`, following `CardHand`'s
// `DraggableFanCard` pattern: `listeners`/`attributes`/`setNodeRef` on the same element that has
// the `onClick`. dnd-kit only returns `listeners` when the draggable is enabled, so a
// non-draggable table card (a mission) can spread them unconditionally with no effect.
//
// An optional count badge (a ship's crew count, #600) sits on the art's top-right corner,
// reusing the same small badge the discard pile and the draw pile draw. It is omitted entirely
// when the count is 0 or absent, so a ship with no crew shows no badge.

import { useDraggable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import CountBadge from './CountBadge';

export const TABLE_CARD_WIDTH = 72; // px
export const TABLE_CARD_ART_HEIGHT = 52; // px, crops the card image down to roughly its art box

export default function TableCard({
  instance,
  onClick,
  width = TABLE_CARD_WIDTH,
  artHeight = TABLE_CARD_ART_HEIGHT,
  draggable = false,
  badge,
}: {
  instance: CardInstance;
  onClick: () => void;
  width?: number;
  artHeight?: number;
  draggable?: boolean;
  badge?: number;
}) {
  const { card, face } = instance;
  const isFaceDown = face === 'down';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: instance.id,
    disabled: !draggable,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-card-id={instance.id}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={`flex flex-col items-center gap-0.5 focus:outline-none ${draggable ? 'touch-none' : ''}`}
      style={{
        width,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      aria-label={isFaceDown ? 'Face-down card' : card.name}
    >
      <div className="relative w-full" style={{ height: artHeight }}>
        <div className="w-full h-full rounded-md overflow-hidden bg-black/20">
          <img
            src={isFaceDown ? '/cardimages/cardback.jpg' : `/cardimages/${card.imagefile}.jpg`}
            alt={isFaceDown ? 'Face-down card' : card.name}
            className="w-full h-full object-cover object-top"
          />
        </div>
        {!!badge && <CountBadge count={badge} />}
      </div>
      <span className="w-full text-[8px] leading-tight text-center text-text-primary truncate">
        {isFaceDown ? '' : card.name}
      </span>
    </button>
  );
}

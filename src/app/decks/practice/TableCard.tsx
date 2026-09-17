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
// tappable-card convention as `CardHand`'s fan cards.

import { CardInstance } from './tableReducer';

export const TABLE_CARD_WIDTH = 72; // px
export const TABLE_CARD_ART_HEIGHT = 52; // px, crops the card image down to roughly its art box

export default function TableCard({ instance, onClick }: { instance: CardInstance; onClick: () => void }) {
  const { card, face } = instance;
  const isFaceDown = face === 'down';

  return (
    <button
      type="button"
      data-card-id={instance.id}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 focus:outline-none"
      style={{ width: TABLE_CARD_WIDTH }}
      aria-label={isFaceDown ? 'Face-down card' : card.name}
    >
      <div className="w-full rounded-md overflow-hidden bg-black/20" style={{ height: TABLE_CARD_ART_HEIGHT }}>
        <img
          src={isFaceDown ? '/cardimages/cardback.jpg' : `/cardimages/${card.imagefile}.jpg`}
          alt={isFaceDown ? 'Face-down card' : card.name}
          className="w-full h-full object-cover object-top"
        />
      </div>
      <span className="w-full text-[8px] leading-tight text-center text-text-primary truncate">
        {isFaceDown ? '' : card.name}
      </span>
    </button>
  );
}

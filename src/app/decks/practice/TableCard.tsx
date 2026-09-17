'use client';

// Compact "table card" presentation (see the parent design in issue #130): shows only the top
// portion of the card image (the art) with the title in small text below, rather than the full
// card art+frame used in the hand and the piles. The title stays separate from the cropped art,
// which would be illegible at this width. Reused by later slices for any card that sits on the
// table rather than in a hand or a pile (#598 tap preview and flip, #599 ships).

export const TABLE_CARD_WIDTH = 72; // px
export const TABLE_CARD_ART_HEIGHT = 52; // px, crops the card image down to roughly its art box

export default function TableCard({ card }: { card: any }) {
  return (
    <div className="flex flex-col items-center gap-0.5" style={{ width: TABLE_CARD_WIDTH }}>
      <div className="w-full rounded-md overflow-hidden bg-black/20" style={{ height: TABLE_CARD_ART_HEIGHT }}>
        <img
          src={`/cardimages/${card.imagefile}.jpg`}
          alt={card.name}
          className="w-full h-full object-cover object-top"
        />
      </div>
      <span className="w-full text-[8px] leading-tight text-center text-text-primary truncate">
        {card.name}
      </span>
    </div>
  );
}

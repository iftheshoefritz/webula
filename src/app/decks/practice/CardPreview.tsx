'use client';

// A reusable large card preview (see the parent design in issue #130). A tap anywhere on the
// backdrop or the enlarged image closes it; an optional "Flip" button sits on top of the image
// as a sibling of the closing button (not nested inside it, which would be invalid HTML and
// would let the outer tap handler fire first), so tapping it flips the card without closing the
// preview. The preview always shows the card's true face, even when it sits face down on the
// table, because the player owns every card on their own table; a "Face down" label says so.
//
// This same component drives the hand card preview (#598), the crew row preview (#600), and the
// pile panel previews (#602).

import { CardInstance } from './tableReducer';

export default function CardPreview({
  instance,
  onClose,
  onFlip,
}: {
  instance: CardInstance;
  onClose: () => void;
  onFlip?: () => void;
}) {
  const { card, face } = instance;

  return (
    <div className="fixed inset-0 z-[200]">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label={`${card.name}, tap to shrink`}
      >
        <img
          src={`/cardimages/${card.imagefile}.jpg`}
          alt={card.name}
          className="absolute right-4 top-1/2 -translate-y-1/2 h-[90%] w-auto rounded-lg shadow-2xl"
        />
      </button>

      {face === 'down' && (
        <span className="absolute right-4 top-[6%] bg-black/70 text-text-primary text-xs font-medium px-2 py-1 rounded">
          Face down
        </span>
      )}

      {onFlip && (
        <button
          type="button"
          onClick={onFlip}
          className="btn-primary absolute right-4 bottom-[6%]"
        >
          Flip
        </button>
      )}
    </div>
  );
}

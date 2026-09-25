'use client';

// The large card preview. The tap acts, the hold looks: a press and hold on a card (`useCardHold`)
// shows it here, and the release hides it. A tap never opens it. The preview is read-only: it has
// no buttons and takes no pointer events, so every control stays on the table and in the panels
// (the panels' own Stop/Unstop and Flip buttons act on the selection).
//
// The preview always shows the card's true face, even when it sits face down on the table,
// because the player owns every card on their own table; a "Face down" label says so. `hidden`
// hides it for the duration of a drag.

import { CardInstance } from './tableReducer';
import { STOPPED_IMAGE_CLASSNAME } from './TableCard';

export default function CardPreview({
  instance,
  hidden = false,
}: {
  instance: CardInstance;
  hidden?: boolean;
}) {
  const { card, face } = instance;

  return (
    <div
      data-testid="card-preview"
      className="fixed inset-0 z-[200] pointer-events-none animate-fade-in bg-black/50"
      style={{ visibility: hidden ? 'hidden' : 'visible' }}
    >
      <img
        data-testid="card-preview-enlarged"
        src={`/cardimages/${card.imagefile}.jpg`}
        alt={card.name}
        className={`absolute right-4 top-1/2 -translate-y-1/2 h-[90%] w-auto rounded-lg shadow-2xl ${
          instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''
        }`}
      />

      {face === 'down' && (
        <span className="absolute right-4 top-[6%] bg-black/70 text-text-primary text-xs font-medium px-2 py-1 rounded">
          Face down
        </span>
      )}
    </div>
  );
}

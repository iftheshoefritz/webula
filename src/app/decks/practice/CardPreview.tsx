'use client';

// The large card preview. The tap acts, the hold looks: a press and hold on a card (`useCardHold`)
// shows it here, and the release hides it. A tap never opens it. The preview is read-only: it has
// no buttons and takes no pointer events, so every control stays on the table and in the panels
// (the panels' own Stop/Unstop and Flip buttons act on the selection).
//
// The preview always shows the card's true face, even when it sits face down on the table,
// because the player owns every card on their own table; a "Face down" label says so. `hidden`
// hides it for the duration of a drag. `side` is the edge it takes, the one away from the press
// point (#879); the badge takes the same edge, so it stays over the image.

import { CardInstance } from './tableReducer';
import { LAYER_CARD_PREVIEW } from '../../../lib/layers';
import { STOPPED_IMAGE_CLASSNAME, faceUpImageSrc } from './TableCard';
import type { PreviewSide } from './useCardHold';

// The "Face down" badge, shared with the card list panel's mark on a face-down card (#826).
export const FACE_DOWN_LABEL = 'Face down';
export const FACE_DOWN_BADGE_CLASSNAME = 'bg-black/70 text-text-primary text-xs font-medium px-2 py-1 rounded';

export default function CardPreview({
  instance,
  hidden = false,
  side = 'right',
}: {
  instance: CardInstance;
  hidden?: boolean;
  side?: PreviewSide;
}) {
  const { card, face } = instance;
  const edge = side === 'left' ? 'left-4' : 'right-4';

  return (
    <div
      data-testid="card-preview"
      className={`fixed inset-0 ${LAYER_CARD_PREVIEW} pointer-events-none animate-fade-in bg-black/50`}
      style={{ visibility: hidden ? 'hidden' : 'visible' }}
    >
      <img
        data-testid="card-preview-enlarged"
        src={faceUpImageSrc(instance)}
        alt={card.name}
        className={`absolute ${edge} top-1/2 -translate-y-1/2 h-[90%] w-auto rounded-lg shadow-2xl ${
          instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''
        }`}
      />

      {face === 'down' && (
        <span className={`absolute ${edge} top-[6%] ${FACE_DOWN_BADGE_CLASSNAME}`}>
          {FACE_DOWN_LABEL}
        </span>
      )}
    </div>
  );
}

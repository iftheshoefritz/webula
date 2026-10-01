'use client';

// The large card preview. The tap acts, the hold looks: a press and hold on a card (`useCardHold`)
// shows it here, and the release hides it. A tap never opens it. The preview is read-only: it has
// no buttons and takes no pointer events, so every control stays on the table and in the panels
// (the panels' own Stop/Unstop and Flip buttons act on the selection).
//
// The preview always shows the card's true face, even when it sits face down on the table,
// because the player owns every card on their own table; a "Face down" label says so, except on
// a card of an away team (#964), which is face down by default and needs no label. `hidden`
// hides it for the duration of a drag. `side` is the edge it takes, the one away from the press
// point (#879); the badge takes the same edge, so it stays over the image. `dim` darkens the
// table behind the preview. A hold dims it; a mouse hover does not (#985), so the player still
// sees the table while the hover preview shows.

import { CardInstance } from './tableReducer';
import { LAYER_CARD_PREVIEW } from '../../../lib/layers';
import { STOPPED_IMAGE_CLASSNAME, cardBorderStyle, faceUpImageSrc } from './TableCard';
import type { PreviewSide } from './useCardHold';

// The "Face down" badge, shared with the card list panel's mark on a face-down card (#826).
export const FACE_DOWN_LABEL = 'Face down';
export const FACE_DOWN_BADGE_CLASSNAME = 'bg-black/70 text-text-primary text-xs font-medium px-2 py-1 rounded';

// Issue #946: on a desktop (`(pointer: fine)`) the preview is no taller than 450 px. At 90% of a
// desktop window it drew the 499 px card image at 720 px and more, and the browser scaled it up
// until it looked soft. A touch device keeps 90% of the screen. The badge moves down with the
// top of the smaller card, 225 px above the middle, so it stays over the image.
export const PREVIEW_IMAGE_SIZE_CLASSNAME = 'h-[90%] [@media(pointer:fine)]:max-h-[450px]';
// The black card border (#983), at the width of the 450 px tall desktop preview.
const PREVIEW_BORDER_STYLE = cardBorderStyle(Math.round((450 * 120) / 167));
export const PREVIEW_BADGE_TOP_CLASSNAME =
  'top-[6%] [@media(pointer:fine)]:top-[max(6%,calc(50%_-_217px))]';

export default function CardPreview({
  instance,
  hidden = false,
  side = 'right',
  markFaceDown = true,
  dim = true,
}: {
  instance: CardInstance;
  hidden?: boolean;
  side?: PreviewSide;
  // False for a card of an away team (#964): it shows no "Face down" badge.
  markFaceDown?: boolean;
  // False for a hover preview (#985): the table behind it stays undimmed.
  dim?: boolean;
}) {
  const { card, face } = instance;
  const edge = side === 'left' ? 'left-4' : 'right-4';

  return (
    <div
      data-testid="card-preview"
      className={`fixed inset-0 ${LAYER_CARD_PREVIEW} pointer-events-none animate-fade-in ${dim ? 'bg-black/50' : ''}`}
      style={{ visibility: hidden ? 'hidden' : 'visible' }}
    >
      <img
        data-testid="card-preview-enlarged"
        src={faceUpImageSrc(instance)}
        alt={card.name}
        className={`absolute ${edge} top-1/2 -translate-y-1/2 ${PREVIEW_IMAGE_SIZE_CLASSNAME} w-auto rounded-lg shadow-2xl ${
          instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''
        }`}
        style={PREVIEW_BORDER_STYLE}
      />

      {markFaceDown && face === 'down' && (
        <span className={`absolute ${edge} ${PREVIEW_BADGE_TOP_CLASSNAME} ${FACE_DOWN_BADGE_CLASSNAME}`}>
          {FACE_DOWN_LABEL}
        </span>
      )}
    </div>
  );
}

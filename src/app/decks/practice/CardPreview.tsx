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
import { cardDisplayName } from '../../../lib/cardCount';
import { cardBorderStyle, faceUpImageSrc } from './TableCard';
import type { PreviewSide } from './useCardHold';
import { safeAreaMargins } from './useSafeAreaInsets';
import { PREVIEW_MAX_HEIGHT, previewMaxWidth } from './previewSize';
import type { CSSProperties } from 'react';

// The "Face down" badge, shared with the card list panel's mark on a face-down card (#826).
export const FACE_DOWN_LABEL = 'Face down';
export const FACE_DOWN_BADGE_CLASSNAME = 'bg-black/70 text-text-primary text-xs font-medium px-2 py-1 rounded';

// Issue #946, #1458: on a desktop (`(pointer: fine)`) the preview is no taller than
// `PREVIEW_MAX_HEIGHT`, 499 px, the native height of the card image. At 90% of a desktop window it
// drew the image at 720 px and more, and the browser scaled it up until it looked soft. A touch
// device keeps 90% of the screen. The cap reaches the classes through `--preview-max-h`, set on the
// preview's root, so the one constant sizes the image, its border and the badge. The badge moves
// down with the top of the smaller card, 8 px inside it, so it stays over the image.
export const PREVIEW_MAX_HEIGHT_VAR = '--preview-max-h';
export const PREVIEW_IMAGE_SIZE_CLASSNAME = 'h-[90%] [@media(pointer:fine)]:max-h-(--preview-max-h)';
// The black card border (#983), at the width of the desktop preview.
const PREVIEW_BORDER_STYLE = cardBorderStyle(previewMaxWidth());
export const PREVIEW_BADGE_TOP_CLASSNAME =
  'top-[6%] [@media(pointer:fine)]:top-[max(6%,calc(50%_-_var(--preview-max-h)/2_+_8px))]';
const PREVIEW_ROOT_STYLE = { [PREVIEW_MAX_HEIGHT_VAR]: `${PREVIEW_MAX_HEIGHT}px` } as CSSProperties;

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
  // Issue #1384: the image and the badge keep 1rem clear of the safe-area inset of their side.
  const edgeInset = safeAreaMargins(side === 'left' ? 'left' : 'right');

  return (
    <div
      data-testid="card-preview"
      className={`fixed inset-0 ${LAYER_CARD_PREVIEW} pointer-events-none animate-fade-in ${dim ? 'bg-black/50' : ''}`}
      style={{ ...PREVIEW_ROOT_STYLE, visibility: hidden ? 'hidden' : 'visible' }}
    >
      {/* Issue #1535: the preview shows a stopped card plain, in colour and at full opacity, so it
          stays readable; the card on the table and in the panels keeps the stopped look. */}
      <img
        data-testid="card-preview-enlarged"
        src={faceUpImageSrc(instance)}
        alt={cardDisplayName(card)}
        className={`absolute ${edge} top-1/2 -translate-y-1/2 ${PREVIEW_IMAGE_SIZE_CLASSNAME} w-auto rounded-lg shadow-2xl`}
        style={{ ...PREVIEW_BORDER_STYLE, ...edgeInset }}
      />

      {markFaceDown && face === 'down' && (
        <span className={`absolute ${edge} ${PREVIEW_BADGE_TOP_CLASSNAME} ${FACE_DOWN_BADGE_CLASSNAME}`} style={edgeInset}>
          {FACE_DOWN_LABEL}
        </span>
      )}
    </div>
  );
}

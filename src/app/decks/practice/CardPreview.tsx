'use client';

// A reusable large card preview (see the parent design in issue #130). A tap anywhere on the
// backdrop or the enlarged image closes it; an optional "Flip" button sits on top of the image
// as a sibling of the closing button (not nested inside it, which would be invalid HTML and
// would let the outer tap handler fire first), so tapping it flips the card without closing the
// preview. The preview always shows the card's true face, even when it sits face down on the
// table, because the player owns every card on their own table; a "Face down" label says so.
//
// This same component drives the hand card preview (#598) and the pile panel previews (#602),
// including a ship's crew panel (#664; a ship's own preview used to also show a crew row below
// the enlarged art, but that panel replaced it).
//
// Since #678, a tap on a ship opens its own preview and its crew panel together, side by side —
// this preview stays anchored to the right, and the crew panel takes the left half of the
// screen. `reserveLeft` shrinks this preview's own full-screen tap-to-close backdrop and enlarged
// card button down to the right half too (`page.tsx` sets it whenever a crew panel is open, not
// just for a ship's own preview, since the crew panel can stay open while a tap on one of its
// cards swaps the preview to show that card instead), so this preview never sits on top of the
// crew panel's own cards and swallows taps meant for them.
//
// #696: `reserveLeft` shrinks the two tap-target buttons, but the outer `fixed inset-0` container
// they sit in keeps the whole screen, and a transparent element still takes a tap. That container
// carries `pointer-events-none`, and each interactive child (the backdrop button, the enlarged
// card button, the Flip/Stop row) carries `pointer-events-auto` back, so a tap on the left half —
// where the crew panel sits — now falls through to the panel instead of hitting the container.
//
// The enlarged card is itself draggable to another zone (#643), following the same
// `useDraggable` + shared-node pattern every other table card already uses (`TableCard`,
// `PilePanelCard`, `DraggableFanCard`): its `<button>` carries both the tap-to-close `onClick`
// and the drag `attributes`/`listeners`. A mission card has no on-table draggable of its own
// (`TableCard` in `MissionRow.tsx` renders it non-draggable), so `draggable` is false for it
// too, matching that. The card's home representation (the hand fan card, the ship's `TableCard`,
// the pile-panel card) stays mounted underneath the preview the whole time it is open, so this
// draggable cannot reuse `instance.id` — dnd-kit does not support two draggables sharing one id
// — and instead registers under `previewDraggableId(instance.id)`, a distinct id `page.tsx`
// normalizes back to the real card id (`cardIdFromDraggableId`) before doing anything else with
// a drag's `active.id`.

import { useDraggable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import { STOPPED_IMAGE_CLASSNAME } from './TableCard';

// The enlarged card's own draggable id is distinct from the card's home draggable id (its plain
// `instance.id`), since both can be mounted, and registered with dnd-kit, at the same time.
// `cardIdFromDraggableId` reverses this: `page.tsx` calls it on every drag's `active.id` before
// doing anything else, so the rest of that code never needs to know a prefix exists.
const PREVIEW_DRAGGABLE_PREFIX = 'preview-';

export const previewDraggableId = (id: string): string => `${PREVIEW_DRAGGABLE_PREFIX}${id}`;

export function cardIdFromDraggableId(draggableId: string): string {
  return draggableId.startsWith(PREVIEW_DRAGGABLE_PREFIX)
    ? draggableId.slice(PREVIEW_DRAGGABLE_PREFIX.length)
    : draggableId;
}

export default function CardPreview({
  instance,
  onClose,
  onFlip,
  onStop,
  hidden = false,
  draggable = false,
  reserveLeft = false,
}: {
  instance: CardInstance;
  onClose: () => void;
  onFlip?: () => void;
  // Toggles a personnel card's `stopped` flag (#679); shown as a "Stop"/"Unstop" button next to
  // "Flip", for a personnel card only (the caller passes it only then, the same convention
  // `onFlip` already follows for the zones that get a "Flip" button).
  onStop?: () => void;
  hidden?: boolean;
  draggable?: boolean;
  reserveLeft?: boolean;
}) {
  const { card, face } = instance;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: previewDraggableId(instance.id),
    disabled: !draggable,
  });
  // Hidden by the same rule as the rest of the preview, except while this card is itself being
  // dragged: a drag it started stays visible for its own whole duration.
  const cardHidden = hidden && !isDragging;
  // The backdrop and the enlarged card button are normally the whole screen, so a tap anywhere
  // closes the preview; `reserveLeft` (#678) pulls their left edge in to the middle, leaving the
  // left half free for a crew panel open alongside this preview.
  const tapAreaClassName = reserveLeft ? 'absolute inset-y-0 left-1/2 right-0' : 'absolute inset-0';

  return (
    <div
      className="fixed inset-0 z-[200] pointer-events-none"
      style={{ visibility: hidden ? 'hidden' : 'visible' }}
    >
      <button
        type="button"
        className={`${tapAreaClassName} bg-black/50 pointer-events-auto`}
        onClick={onClose}
        aria-label="Close preview"
      />

      <button
        ref={setNodeRef}
        type="button"
        data-testid="card-preview-enlarged"
        className={`${tapAreaClassName} pointer-events-auto ${draggable ? 'touch-none' : ''}`}
        style={{
          visibility: cardHidden ? 'hidden' : 'visible',
          pointerEvents: cardHidden ? 'none' : undefined,
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.5 : 1,
        }}
        onClick={onClose}
        {...attributes}
        {...listeners}
        aria-label={`${card.name}, tap to shrink`}
      >
        <img
          src={`/cardimages/${card.imagefile}.jpg`}
          alt={card.name}
          className={`absolute right-4 top-1/2 -translate-y-1/2 h-[90%] w-auto rounded-lg shadow-2xl ${
            instance.stopped ? STOPPED_IMAGE_CLASSNAME : ''
          }`}
        />
      </button>

      {face === 'down' && (
        <span className="absolute right-4 top-[6%] bg-black/70 text-text-primary text-xs font-medium px-2 py-1 rounded">
          Face down
        </span>
      )}

      {(onFlip || onStop) && (
        <div className="absolute right-4 bottom-[6%] flex gap-2 pointer-events-auto">
          {onFlip && (
            <button type="button" onClick={onFlip} className="btn-primary">
              Flip
            </button>
          )}
          {onStop && (
            <button type="button" onClick={onStop} className="btn-primary">
              {instance.stopped ? 'Unstop' : 'Stop'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

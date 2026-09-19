'use client';

// A reusable large card preview (see the parent design in issue #130). A tap anywhere on the
// backdrop or the enlarged image closes it; an optional "Flip" button sits on top of the image
// as a sibling of the closing button (not nested inside it, which would be invalid HTML and
// would let the outer tap handler fire first), so tapping it flips the card without closing the
// preview. The preview always shows the card's true face, even when it sits face down on the
// table, because the player owns every card on their own table; a "Face down" label says so.
//
// This same component drives the hand card preview (#598), the ship's crew row preview (#600),
// and the pile panel previews (#602).
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
//
// A ship's preview also shows its crew (#600), face up, in a row below the enlarged art. A tap
// on a crew card opens that card's own preview, the same tap-to-focus mechanism every other
// tappable table card uses. Dragging a crew card out of the row starts a normal drag: the crew
// card's drag begins while its ship's preview is still open (the crew row is the only place a
// crew card appears), so `hidden` (true whenever any drag is active, set by the page) hides the
// backdrop, the enlarged image and the Flip control without unmounting the crew row itself — an
// element removed from the document mid-drag stops receiving the rest of a touch drag's events
// on WebKit (the same hazard `CardHand`'s fan already solves, #611). The enlarged card follows
// that same `hidden` rule, except while it is itself the thing being dragged (`isDragging`),
// so a drag it started stays visible for its own whole duration the same way the crew row does.

import { useDraggable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import TableCard, { TABLE_CARD_WIDTH } from './TableCard';
import { SHIP_CARD_WIDTH, SHIP_CARD_ART_HEIGHT } from './MissionRow';
import { offsetFor } from './overlapOffset';

const CREW_ROW_MAX_WIDTH = TABLE_CARD_WIDTH * 3;
const CREW_MAX_OFFSET = SHIP_CARD_WIDTH + 2;

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
  crew,
  onCardClick,
  hidden = false,
  draggable = false,
}: {
  instance: CardInstance;
  onClose: () => void;
  onFlip?: () => void;
  crew?: CardInstance[];
  onCardClick?: (id: string) => void;
  hidden?: boolean;
  draggable?: boolean;
}) {
  const { card, face } = instance;
  const crewCount = crew?.length ?? 0;
  const crewOffset = offsetFor(crewCount, SHIP_CARD_WIDTH, CREW_ROW_MAX_WIDTH, CREW_MAX_OFFSET);
  const crewRowWidth = crewCount <= 1 ? SHIP_CARD_WIDTH : SHIP_CARD_WIDTH + crewOffset * (crewCount - 1);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: previewDraggableId(instance.id),
    disabled: !draggable,
  });
  // Hidden by the same rule as the rest of the preview, except while this card is itself being
  // dragged: a drag it started stays visible for its own whole duration, the same reasoning that
  // already keeps the crew row visible throughout any drag.
  const cardHidden = hidden && !isDragging;

  return (
    <>
      <div
        className="fixed inset-0 z-[200]"
        style={{ visibility: hidden ? 'hidden' : 'visible', pointerEvents: hidden ? 'none' : undefined }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
          aria-label="Close preview"
        />

        <button
          ref={setNodeRef}
          type="button"
          data-testid="card-preview-enlarged"
          className={`absolute inset-0 ${draggable ? 'touch-none' : ''}`}
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

      {/* The ship's crew row (#600): stays mounted, and interactive, even while `hidden` hides
          the rest of the preview, so a drag started here survives the preview visually closing. */}
      {crew && crew.length > 0 && (
        <div
          className="fixed left-4 bottom-[10%] z-[200]"
          data-zone="crew"
          style={{ width: crewRowWidth, height: SHIP_CARD_ART_HEIGHT + 12 }}
        >
          {crew.map((crewCard, idx) => (
            <div key={crewCard.id} className="absolute top-0" style={{ left: idx * crewOffset, zIndex: idx + 1 }}>
              <TableCard
                instance={crewCard}
                onClick={() => onCardClick?.(crewCard.id)}
                width={SHIP_CARD_WIDTH}
                artHeight={SHIP_CARD_ART_HEIGHT}
                draggable
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

'use client';

// A mission's personnel, event, dilemma stack, or under-the-mission pile panel (#602, #605,
// #606), and, since #640, the core's and the brig's own panel too: a tap on a pile's badge (or,
// for the under-the-mission pile, the card-edge strip) (`MissionRow`), or a tap on any card
// already sitting in the core or the brig (`FlatCardRow`), opens this panel, listing that zone's
// cards face up regardless of their stored face, with a "Face down" label on any card whose
// stored face is actually down (the same true-face-to-owner convention `CardPreview` already
// uses for the enlarged preview). A tap on a card opens that card's own full preview via
// `onCardClick`, reusing `findInstanceAnywhere` + the existing preview state in `page.tsx`. Each
// card is draggable out via the same `useDraggable` + `DragOverlay` mechanism the hand and the
// crew row already use.
//
// Follows the same `hidden` convention as `CardPreview`'s crew row: the panel stays mounted (not
// unmounted) for the rest of a drag that started from a card inside it, so a touch drag begun
// there survives the panel closing (the #611 WebKit hazard: an element removed from the document
// mid-touch-drag stops receiving further touch events). `page.tsx`'s existing "any drag closing
// clears the open preview" logic (`handleDragEnd`) extends to close this panel too.

import { useDraggable } from '@dnd-kit/core';
import { CardInstance, MissionPileName } from './tableReducer';
import { TABLE_CARD_WIDTH, TABLE_CARD_ART_HEIGHT } from './TableCard';

// A mission pile is one of `MissionPileName`; the core and the brig (#640) are two more flat
// zones this same panel now lists, alongside a mission's piles.
export type PanelZone = MissionPileName | 'core' | 'brig';

const PANEL_LABEL: Record<PanelZone, string> = {
  personnel: 'Personnel',
  event: 'Event',
  dilemma: 'Dilemma',
  underMission: 'Under the mission',
  core: 'Core',
  brig: 'Brig',
};

// The core and the brig are not "piles" the way a mission's personnel/event/dilemma piles are,
// so their close button's label drops that word; a mission pile's label keeps it, unchanged from
// before #640.
const closeLabel = (zone: PanelZone): string =>
  zone === 'core' || zone === 'brig'
    ? `Close ${PANEL_LABEL[zone].toLowerCase()}`
    : `Close ${PANEL_LABEL[zone].toLowerCase()} pile`;

function PilePanelCard({ instance, onClick }: { instance: CardInstance; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });
  const { card, face } = instance;

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-card-id={instance.id}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className="flex flex-col items-center gap-0.5 focus:outline-none touch-none"
      style={{
        width: TABLE_CARD_WIDTH,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      aria-label={card.name}
    >
      <div className="relative w-full" style={{ height: TABLE_CARD_ART_HEIGHT }}>
        <div className="w-full h-full rounded-md overflow-hidden bg-black/20">
          <img
            src={`/cardimages/${card.imagefile}.jpg`}
            alt={card.name}
            className="w-full h-full object-cover object-top"
          />
        </div>
      </div>
      <span className="w-full text-[8px] leading-tight text-center text-text-primary truncate">{card.name}</span>
      {face === 'down' && (
        <span className="text-[7px] bg-black/70 text-text-primary px-1 rounded leading-tight">Face down</span>
      )}
    </button>
  );
}

export default function PilePanel({
  zone,
  cards,
  onClose,
  onCardClick,
  hidden = false,
}: {
  zone: PanelZone;
  cards: CardInstance[];
  onClose: () => void;
  onCardClick: (id: string) => void;
  hidden?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[150]"
      style={{ visibility: hidden ? 'hidden' : 'visible', pointerEvents: hidden ? 'none' : undefined }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label={closeLabel(zone)}
      />
      <div
        data-zone={`pile-panel-${zone}`}
        className="absolute left-1/2 top-8 -translate-x-1/2 flex flex-wrap items-start justify-center gap-2 rounded-lg bg-black/70 p-2 max-w-[90%]"
      >
        {cards.map((instance) => (
          <PilePanelCard key={instance.id} instance={instance} onClick={() => onCardClick(instance.id)} />
        ))}
      </div>
    </div>
  );
}

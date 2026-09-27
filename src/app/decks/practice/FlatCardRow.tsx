'use client';

// A flat drop zone whose cards show as a row of small, overlapping table cards, rather than a
// single top card (`DiscardPile` in `page.tsx`) or a positional column (`ShipRow`,
// `MissionRow.tsx`). Used by the core and the brig (#603): a card of any type dropped on either
// lands there face up, and every card already in the zone, not just the most recent one, stays
// visible, tappable, and draggable. Reuses `ShipRow`'s row layout (small `TableCard`s spaced
// with `overlapOffset.ts`) rather than the discard pile's single-card-plus-count-badge shape,
// since (unlike the discard pile) every card here needs to stay individually visible and
// reachable.
//
// A tap on any card here opens `PilePanel` for the whole zone (#640), showing every card at a
// larger size — the small size here makes a card hard to read in place. A tap on a card inside
// that panel selects it, the same as in a mission's personnel/event/dilemma piles.
//
// Each card here can take a placed card (#810): it has a droppable of its own, `onDropId`, so a drop on a
// card's art places the dragged card on that card, while a drop on the zone off any card still
// lands in the flat zone. `collisionDetection.ts` ranks the card above the zone the same way it
// ranks a ship above its ship row. A card shows a count of the cards placed on it, and a tap on it
// opens those cards in their own panel (`onOpenPlacedOn`) instead of the zone's.

import { useDroppable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import { landedBumpClassName } from './LandedZoneContext';
import TableCard from './TableCard';
import { SHIP_CARD_WIDTH, SHIP_CARD_ART_HEIGHT } from './MissionRow';
import { offsetFor } from './overlapOffset';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';
import { LandedRing, useLandedNonce } from './LandedZoneContext';

// The droppable id of the card a dropped card is placed on (#810), named after that card's own id.
// `landedZoneKey.ts` makes the same key for such a move, so the landed cue plays on the card that
// received the dropped card.
export const onDropId = (targetId: string): string => `on-${targetId}`;

export function targetIdFromOnDropId(id: string): string | null {
  const match = /^on-(.+)$/.exec(id);
  return match ? match[1] : null;
}

// The count of the cards placed on a card (#810), in the same pill style as a ship's crew badge and a
// mission's pile badges (`MissionRow.tsx`), so the same kind of thing gets the same badge. Like the
// crew badge, it takes no pointer events, so a tap on it falls through to the card's own button.
function PlacedOnBadge({ name, count, landedNonce }: { name: string; count: number; landedNonce: number | null }) {
  return (
    <span
      aria-label={`${name}, ${count} card${count === 1 ? '' : 's'} on it`}
      className="absolute -top-1 -right-1 z-10 flex items-center rounded-full bg-black/50 px-1 h-3 text-text-primary leading-none pointer-events-none"
    >
      <span key={landedNonce ?? undefined} className={`text-[8px] font-bold ${landedBumpClassName(landedNonce)}`}>
        {count}
      </span>
    </span>
  );
}

// One card of the row, and the droppable over its art that takes a placed card (#810).
function PlacedOnTargetCard({
  instance,
  onOpen,
  onOpenPlacedOn,
}: {
  instance: CardInstance;
  onOpen: () => void;
  onOpenPlacedOn: (targetId: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: onDropId(instance.id) });
  const landedNonce = useLandedNonce(onDropId(instance.id));
  const onCount = instance.placedOn?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      data-zone={onDropId(instance.id)}
      data-landed={landedNonce !== null || undefined}
      className="relative rounded"
    >
      <TableCard
        instance={instance}
        onClick={onCount > 0 ? () => onOpenPlacedOn(instance.id) : onOpen}
        width={SHIP_CARD_WIDTH}
        artHeight={SHIP_CARD_ART_HEIGHT}
        draggable
        holdable={false}
      />
      {onCount > 0 && <PlacedOnBadge name={instance.card.name} count={onCount} landedNonce={landedNonce} />}
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

export default function FlatCardRow({
  zone,
  label,
  cards,
  maxWidth,
  maxOffset,
  fixedWidth = false,
  onOpen,
  onOpenPlacedOn,
}: {
  zone: 'core' | 'brig';
  label: string;
  cards: CardInstance[];
  maxWidth: number;
  maxOffset: number;
  // Keeps the zone at maxWidth at every card count, instead of shrinking to fit the cards it
  // holds (#676). Used by the core, so the zone does not grow or shrink as cards are added or
  // removed. The brig keeps its existing width-to-cards behaviour.
  fixedWidth?: boolean;
  onOpen: () => void;
  // A tap on a card with cards on it (#810) opens those cards, not the zone's panel.
  onOpenPlacedOn: (targetId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone });
  const draggedType = useDraggedCardType();
  const highlight = highlightState(zone, draggedType, isOver);
  const dragging = draggedType !== null;
  const landedNonce = useLandedNonce(zone);

  if (cards.length === 0) {
    return (
      <div
        ref={setNodeRef}
        data-zone={zone}
        data-highlight={highlight}
        data-landed={landedNonce !== null || undefined}
        className={`relative ${fixedWidth ? '' : 'w-14'} h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1 ${highlightClassName(
          highlight
        )}`}
        style={fixedWidth ? { width: maxWidth } : undefined}
      >
        <LandedRing nonce={landedNonce} />
        {label}
      </div>
    );
  }

  const offset = offsetFor(cards.length, SHIP_CARD_WIDTH, maxWidth, maxOffset);
  const rowWidth = SHIP_CARD_WIDTH + offset * (cards.length - 1);

  // During a drag, keep the dashed outline and the full box size the empty zone uses (56x80,
  // "w-14 h-20" above), rather than shrinking to the card row's own size, so the drop target
  // does not shrink out from under the pointer (#635).
  return (
    <div
      ref={setNodeRef}
      data-zone={zone}
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      className={`relative rounded ${dragging ? 'rounded-lg border-2 border-dashed border-white/20' : ''} ${highlightClassName(highlight)}`}
      style={{
        width: fixedWidth ? maxWidth : dragging ? Math.max(rowWidth, 56) : rowWidth,
        height: dragging ? Math.max(SHIP_CARD_ART_HEIGHT, 80) : SHIP_CARD_ART_HEIGHT,
      }}
    >
      {cards.map((instance, idx) => (
        <div key={instance.id} className="absolute top-0" style={{ left: idx * offset, zIndex: idx + 1 }}>
          <PlacedOnTargetCard instance={instance} onOpen={onOpen} onOpenPlacedOn={onOpenPlacedOn} />
        </div>
      ))}
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

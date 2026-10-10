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
// A tap on any card here opens `CardListPanel` for the whole zone (#640), showing every card at a
// larger size — the small size here makes a card hard to read in place. A tap on a card inside
// that panel selects it, the same as in a mission's personnel/event/dilemma piles.
//
// Each card here can take a placed card (#810): it has a droppable of its own, `onDropId`.
// `collisionDetection.ts` ranks the card above the zone the same way it ranks a ship above its
// ship row. A drop on a card adds the dragged card to the zone, the same as a drop on the zone off
// any card, unless the drag held over that card for `PLACE_ON_HOLD_MS` first (#1029): the hold
// arms the card, and a drop then places the dragged card on it. Until the hold, the zone shows the
// highlight, and the card shows none. A card shows a count of the cards placed on it, and a tap on it
// opens those cards in their own panel (`onOpenPlacedOn`) instead of the zone's.

import { useDroppable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import { landedBumpClassName } from './LandedZoneContext';
import TableCard, { SMALL_CARD_WIDTH, fullCardHeight } from './TableCard';
import { offsetFor } from './overlapOffset';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { usePlaceOnHold } from './PlaceOnHoldContext';
import { highlightClassName, highlightState } from './zoneAccepts';
import { LandedRing, useLandedNonce } from './LandedZoneContext';
import { cardDisplayName } from '../../../lib/cardCount';

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
  const draggedType = useDraggedCardType();
  const { armedTargetId } = usePlaceOnHold();
  // Only an armed card is a target of its own (#1029), so only an armed card shows a highlight,
  // the same one as a ship's art (#812), which also takes any placed card. The player can then
  // tell a drop on this card from a drop on the zone around it before release (#831).
  const highlight = armedTargetId === instance.id && draggedType !== null ? highlightState('ship', draggedType, true) : undefined;
  const landedNonce = useLandedNonce(onDropId(instance.id));
  const onCount = instance.placedOn?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      data-zone={onDropId(instance.id)}
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      className={`relative rounded ${highlightClassName(highlight)}`}
    >
      <TableCard
        instance={instance}
        onClick={onCount > 0 ? () => onOpenPlacedOn(instance.id) : onOpen}
        width={SMALL_CARD_WIDTH}
        uncropped
        draggable
      />
      {onCount > 0 && <PlacedOnBadge name={cardDisplayName(instance.card)} count={onCount} landedNonce={landedNonce} />}
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
  onOpen,
  onOpenPlacedOn,
}: {
  zone: 'core' | 'brig';
  label: string;
  cards: CardInstance[];
  // The widest the row may grow, the share of the bottom row's free space `page.tsx` measures
  // for it (#1029). Past that width, the cards overlap more.
  maxWidth: number;
  maxOffset: number;
  onOpen: () => void;
  // A tap on a card with cards on it (#810) opens those cards, not the zone's panel.
  onOpenPlacedOn: (targetId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone });
  const draggedType = useDraggedCardType();
  const { overTargetId, armedTargetId } = usePlaceOnHold();
  // dnd-kit reports one `over`, so with the pointer on a card the zone's own `isOver` is false. A
  // drop on a card that is not armed adds the dragged card to this zone (#1029), so the zone shows
  // `over` then too.
  const overUnarmedCard =
    overTargetId !== null && overTargetId !== armedTargetId && cards.some((card) => card.id === overTargetId);
  const highlight = highlightState(zone, draggedType, isOver || overUnarmedCard);
  const dragging = draggedType !== null;
  const landedNonce = useLandedNonce(zone);

  if (cards.length === 0) {
    return (
      <div
        ref={setNodeRef}
        data-zone={zone}
        data-highlight={highlight}
        data-landed={landedNonce !== null || undefined}
        className={`relative w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1 ${highlightClassName(
          highlight
        )}`}
      >
        <LandedRing nonce={landedNonce} />
        {label}
      </div>
    );
  }

  const offset = offsetFor(cards.length, SMALL_CARD_WIDTH, maxWidth, maxOffset);
  const rowWidth = SMALL_CARD_WIDTH + offset * (cards.length - 1);
  // Each card shows whole, not cropped to its art (#926), so the row is as tall as a full card.
  const cardHeight = fullCardHeight(SMALL_CARD_WIDTH);

  // During a drag, keep the dashed outline and the full box size the empty zone uses (56x80,
  // "w-14 h-20" above), rather than shrinking to the card row's own size, so the drop target
  // does not shrink out from under the pointer (#635). The cards sit at the row's bottom edge, and
  // the table's bottom row is `items-end`, so the row grows upward away from them and each card
  // stays under the pointer (or the finger) when the drag starts (#831). Anchored at the top, the
  // cards jumped up by the growth, and the pointer that was on a card was then on the zone.
  return (
    <div
      ref={setNodeRef}
      data-zone={zone}
      data-highlight={highlight}
      data-landed={landedNonce !== null || undefined}
      className={`relative rounded ${dragging ? 'rounded-lg border-2 border-dashed border-white/20' : ''} ${highlightClassName(highlight)}`}
      style={{
        width: dragging ? Math.max(rowWidth, 56) : rowWidth,
        height: dragging ? Math.max(cardHeight, 80) : cardHeight,
      }}
    >
      {cards.map((instance, idx) => (
        <div key={instance.id} className="absolute bottom-0" style={{ left: idx * offset, zIndex: idx + 1 }}>
          <PlacedOnTargetCard instance={instance} onOpen={onOpen} onOpenPlacedOn={onOpenPlacedOn} />
        </div>
      ))}
      <LandedRing nonce={landedNonce} />
    </div>
  );
}

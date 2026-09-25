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

import { useDroppable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import TableCard from './TableCard';
import { SHIP_CARD_WIDTH, SHIP_CARD_ART_HEIGHT } from './MissionRow';
import { offsetFor } from './overlapOffset';
import { useDraggedCardType } from './DraggedCardTypeContext';
import { highlightClassName, highlightState } from './zoneAccepts';

export default function FlatCardRow({
  zone,
  label,
  cards,
  maxWidth,
  maxOffset,
  fixedWidth = false,
  onOpen,
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
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone });
  const draggedType = useDraggedCardType();
  const highlight = highlightState(zone, draggedType, isOver);
  const dragging = draggedType !== null;

  if (cards.length === 0) {
    return (
      <div
        ref={setNodeRef}
        data-zone={zone}
        data-highlight={highlight}
        className={`${fixedWidth ? '' : 'w-14'} h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1 ${highlightClassName(
          highlight
        )}`}
        style={fixedWidth ? { width: maxWidth } : undefined}
      >
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
      className={`relative rounded ${dragging ? 'rounded-lg border-2 border-dashed border-white/20' : ''} ${highlightClassName(highlight)}`}
      style={{
        width: fixedWidth ? maxWidth : dragging ? Math.max(rowWidth, 56) : rowWidth,
        height: dragging ? Math.max(SHIP_CARD_ART_HEIGHT, 80) : SHIP_CARD_ART_HEIGHT,
      }}
    >
      {cards.map((instance, idx) => (
        <div key={instance.id} className="absolute top-0" style={{ left: idx * offset, zIndex: idx + 1 }}>
          <TableCard
            instance={instance}
            onClick={onOpen}
            width={SHIP_CARD_WIDTH}
            artHeight={SHIP_CARD_ART_HEIGHT}
            draggable
            holdable={false}
          />
        </div>
      ))}
    </div>
  );
}

'use client';

// A flat drop zone whose cards show as a row of small, overlapping table cards, rather than a
// single top card (`DiscardPile` in `page.tsx`) or a positional column (`ShipRow`,
// `MissionRow.tsx`). Used by the core and the brig (#603): a card of any type dropped on either
// lands there face up, and every card already in the zone, not just the most recent one, stays
// visible, tappable, and draggable. Reuses `ShipRow`'s row layout (small `TableCard`s spaced
// with `overlapOffset.ts`) rather than the discard pile's single-card-plus-count-badge shape,
// since (unlike the discard pile) every card here needs to stay individually visible and
// reachable.

import { useDroppable } from '@dnd-kit/core';
import { CardInstance } from './tableReducer';
import TableCard from './TableCard';
import { SHIP_CARD_WIDTH, SHIP_CARD_ART_HEIGHT } from './MissionRow';
import { offsetFor } from './overlapOffset';

export default function FlatCardRow({
  zone,
  label,
  cards,
  maxWidth,
  maxOffset,
  onCardClick,
}: {
  zone: string;
  label: string;
  cards: CardInstance[];
  maxWidth: number;
  maxOffset: number;
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone });

  if (cards.length === 0) {
    return (
      <div
        ref={setNodeRef}
        data-zone={zone}
        className={`w-14 h-20 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center text-text-muted text-[10px] text-center leading-tight px-1 ${
          isOver ? 'ring-2 ring-accent' : ''
        }`}
      >
        {label}
      </div>
    );
  }

  const offset = offsetFor(cards.length, SHIP_CARD_WIDTH, maxWidth, maxOffset);
  const rowWidth = SHIP_CARD_WIDTH + offset * (cards.length - 1);

  return (
    <div
      ref={setNodeRef}
      data-zone={zone}
      className={`relative rounded ${isOver ? 'ring-2 ring-accent' : ''}`}
      style={{ width: rowWidth, height: SHIP_CARD_ART_HEIGHT + 14 }}
    >
      {cards.map((instance, idx) => (
        <div key={instance.id} className="absolute top-0" style={{ left: idx * offset, zIndex: idx + 1 }}>
          <TableCard
            instance={instance}
            onClick={() => onCardClick(instance.id)}
            width={SHIP_CARD_WIDTH}
            artHeight={SHIP_CARD_ART_HEIGHT}
            draggable
          />
        </div>
      ))}
    </div>
  );
}

// Where a card dragged inside the dilemma stack's panel lands if released now (#956).
//
// The drop dispatches `reorder`, which calls `arrayMove(from, to)` with `to` the index
// of the card under the pointer (`over`). The dragged card therefore ends at `to`: just after the
// `over` card on a move to the right, just before it on a move to the left. The indicator reads
// the same `over` the drop does, not the pointer's own position, so the two always agree.
//
// `slot` is the index the dragged card ends at. `boundary` is the place in today's row the
// indicator marks: the left edge of card `boundary`, or the right end of the row when `boundary`
// equals the card count.
export type DilemmaStackInsertPoint = { slot: number; boundary: number };

export function dilemmaStackInsertPoint(
  ids: string[],
  activeId: string | null,
  overId: string | null
): DilemmaStackInsertPoint | null {
  if (activeId === null || overId === null || activeId === overId) return null;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1) return null;
  return { slot: to, boundary: from < to ? to + 1 : to };
}

// The face-up row of the dilemma choice (#1190) gives each of its cards a drop target of its own
// (#1204). The stack's panel can be open over the row, and its cards already register droppables
// under the bare card ids, so the row's targets take ids of their own. A target covers the part of
// its card that no later card covers, and the last card's right half is a target of its own, the
// end of the stack, so the end stays in reach when the cards overlap.
const ROW_SLOT_PREFIX = 'stack-slot-';
export const DILEMMA_STACK_ROW_END = 'stack-slot-end';

export function dilemmaStackRowSlotId(cardId: string): string {
  return `${ROW_SLOT_PREFIX}${cardId}`;
}

// What a droppable id names in the row: a card, the end of the stack, or nothing of the row.
export function dilemmaStackRowTarget(overId: string | null): { cardId: string } | 'end' | null {
  if (overId === null) return null;
  if (overId === DILEMMA_STACK_ROW_END) return 'end';
  return overId.startsWith(ROW_SLOT_PREFIX) ? { cardId: overId.slice(ROW_SLOT_PREFIX.length) } : null;
}

// Where a card dragged over the row lands if released now (#1204). The marker and the drop both
// read it. A card of the stack moves as it does in the panel (`dilemmaStackInsertPoint`), and the
// end, or the zone itself right of the last card, moves it last. A card from outside the stack goes
// in before the card it is over, or last over the end or the zone.
export function dilemmaStackRowInsertPoint(
  ids: string[],
  activeId: string | null,
  overId: string | null
): DilemmaStackInsertPoint | null {
  if (activeId === null) return null;
  const target = overId === 'dilemmaStack' ? 'end' : dilemmaStackRowTarget(overId);
  if (target === null) return null;
  if (ids.includes(activeId)) {
    return dilemmaStackInsertPoint(ids, activeId, target === 'end' ? ids[ids.length - 1] ?? null : target.cardId);
  }
  const index = target === 'end' ? ids.length : ids.indexOf(target.cardId);
  return index === -1 ? null : { slot: index, boundary: index };
}

// The words at the two ends of the stack while the dilemmas are chosen (#1204): on the row of the
// choice layout, and on the stack's panel in that phase.
export const DILEMMA_STACK_CHOICE_END_LABELS = { first: 'Faced first', last: 'Faced last' } as const;

// Where a card dragged inside the dilemma stack's panel lands if released now (#956).
//
// The drop dispatches `reorderDilemmaStack`, which calls `arrayMove(from, to)` with `to` the index
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

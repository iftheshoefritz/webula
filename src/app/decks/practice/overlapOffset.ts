// Shared overlap-offset calculation (originally `CardHand`'s closed/open hand layout, issue
// #596): packs `count` cards, each `cardWidth` wide, into a bounded total width by shrinking
// the offset between overlapping card edges as the count grows, rather than letting the row
// grow without bound. Used by the hand (#596) and the ship row (#599).
export function offsetFor(count: number, cardWidth: number, maxWidth: number, maxOffset: number): number {
  if (count <= 1) return 0;
  const bounded = Math.floor((maxWidth - cardWidth) / (count - 1));
  return Math.max(2, Math.min(maxOffset, bounded));
}

// The Play drop target (#1729): during a drag of an event that resolves at once, from the hand, a
// target over the area above the bottom row plays it into the resolving zone (#1727), whose panel
// (#1728) then shows it. It shows only once the pointer rises `PLAY_TARGET_MARGIN` above the line,
// the higher of the bottom row's top and the closed hand fan's top, so a drag to the core that wanders
// up a little stays a drag to the core. Below the line every drop works as before, uncharged.

import { resolvesOnPlay } from '../../../lib/playCost';
import type { CardInstance, TableState } from './tableReducer';

// The droppable's id: the zone it plays into.
export const PLAY_TARGET_ID = 'resolving';

// How far above the line the pointer must rise before the target shows, in px.
export const PLAY_TARGET_MARGIN = 16;

// Whether this drag may show the target, apart from where the pointer is: the setting is on, the turn
// is in play and draw, no attempt is in progress, nothing is resolving, and the drag carries one card
// from the hand that resolves on play. A group drag (#677) never shows it: the zone holds one card.
export function playTargetEligible({
  resolveEvents,
  table,
  group,
  fromHand,
}: {
  resolveEvents: boolean;
  table: Pick<TableState, 'segment' | 'attempt' | 'resolving'>;
  group: readonly CardInstance[];
  fromHand: boolean;
}): boolean {
  return (
    resolveEvents &&
    table.segment === 'playAndDraw' &&
    !table.attempt &&
    !table.resolving &&
    fromHand &&
    group.length === 1 &&
    resolvesOnPlay(group[0].card)
  );
}

// The y above which the target shows: `PLAY_TARGET_MARGIN` above the highest of the given tops, the
// bottom row's and the closed fan's. A missing top counts for nothing; with none, null.
export function playTargetLine(tops: readonly (number | null | undefined)[]): number | null {
  const known = tops.filter((top): top is number => typeof top === 'number' && Number.isFinite(top));
  return known.length > 0 ? Math.min(...known) - PLAY_TARGET_MARGIN : null;
}

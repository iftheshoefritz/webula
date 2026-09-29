// The key of the zone a card lands in after a drop (#778), read by `LandedZoneContext.tsx`'s
// zones to decide whether to play the landed cue. Kept apart from that context so the context
// does not import `MissionRow.tsx`, which imports it.

import type { MoveTarget } from './tableReducer';
import { crewDropId, missionPileDropId, shipRowDropId } from './MissionRow';

// One stable key per destination, the key of the element that shows it. The drop ids fit: a flat
// zone's own name, which also covers the draw pile and the dilemma pile as a whole (not their
// top/bottom drop halves), a mission pile's key, the `data-testid` of the away team badge (#924), which also covers the under-the-mission
// stack (it has no droppable of its own), a ship row's id, and a ship's crew id.
export function landedZoneKey(target: MoveTarget): string {
  if (typeof target === 'string') return target;
  if (target.zone === 'shipRow') return shipRowDropId(target.missionIndex);
  if (target.zone === 'crew') return crewDropId(target.shipId);
  // The placed cards (#809) show on the droppable of the card they sit on (#810, `onDropId`).
  if (target.zone === 'on') return `on-${target.targetId}`;
  return missionPileDropId(target.missionIndex, target.pile);
}

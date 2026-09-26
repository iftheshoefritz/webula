'use client';

// The after-drop counterpart of the drag-time highlight (#778): once a drop moves at least one
// card, every zone that received a card plays a short "landed" cue, so a card dropped into a pile
// that shows only a count is not lost from sight. `page.tsx`'s `handleDragEnd` records the keys
// of those zones (`landedZoneKey`, below) and shares them through this context, the same way
// `DraggedCardTypeContext` shares the dragged card's type, so no prop is threaded through
// `MissionRow`'s nested components or `CardHand`.
//
// `nonce` changes on every drop that moves a card, so a second drop on the same zone restarts
// the cue: each zone renders its cue with the nonce as a React `key`, which remounts the element
// and so restarts its CSS animation.

import { createContext, useContext } from 'react';
import type { MoveTarget } from './tableReducer';
import { crewDropId, missionPileDropId, shipRowDropId } from './MissionRow';

// How long the cue shows. Matches the `landed-ring` and `landed-bump` animations in
// `tailwind.config.js`; under reduced motion the static ring shows for this long instead.
export const LANDED_CUE_MS = 450;

export interface LandedZones {
  keys: ReadonlySet<string>;
  nonce: number;
}

// One stable key per destination, the key of the element that shows it. The drop ids fit: a flat
// zone's own name, which also covers the draw pile and the dilemma pile as a whole (not their
// top/bottom drop halves), a mission pile's badge id, which also covers the under-the-mission
// stack (it has no droppable of its own), a ship row's id, and a ship's crew id.
export function landedZoneKey(target: MoveTarget): string {
  if (typeof target === 'string') return target;
  if (target.zone === 'shipRow') return shipRowDropId(target.missionIndex);
  if (target.zone === 'crew') return crewDropId(target.shipId);
  return missionPileDropId(target.missionIndex, target.pile);
}

const LandedZoneContext = createContext<LandedZones | null>(null);

export const LandedZoneProvider = LandedZoneContext.Provider;

// The current drop's nonce if the zone with this key just received a card, else `null`.
export function useLandedNonce(key: string): number | null {
  const landed = useContext(LandedZoneContext);
  return landed && landed.keys.has(key) ? landed.nonce : null;
}

// The ring of the cue: an extra layer over the zone's own box, so the zone's own classes (its
// drag-time highlight ring included) stay as they are. A ring is a box-shadow, so nothing
// reflows, and `pointer-events-none` keeps it from catching the next drag. The caller gives the
// zone a positioned box of its own for `inset-0` to fill. Under reduced motion the ring is static
// and goes away when `page.tsx` clears the landed zones.
export function LandedRing({ nonce }: { nonce: number | null }) {
  if (nonce === null) return null;
  return (
    <span
      key={nonce}
      aria-hidden="true"
      data-testid="landed-ring"
      className="pointer-events-none absolute inset-0 rounded-[inherit] motion-safe:animate-landed-ring motion-reduce:ring-2 motion-reduce:ring-accent"
    />
  );
}

// The class of a count that bumps when its zone receives a card. Scale only, so nothing reflows,
// and no bump at all under reduced motion.
export function landedBumpClassName(nonce: number | null): string {
  return nonce === null ? '' : 'inline-block motion-safe:animate-landed-bump';
}

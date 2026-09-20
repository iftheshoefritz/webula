// Advisory highlight lookup for a drag on the practice table (#608). Presentation only: it
// never touches how a drop resolves — `handleDragEnd` (page.tsx) keeps its own per-type routing
// (`MISSION_PILE_BY_TYPE`, the ship/dilemma special cases, `shipIdFromCrewDropId`,
// `missionPileFromDropId`) exactly as it is today, so a drop the lookup marks invalid for a zone
// still succeeds exactly as it does now (an event dropped on the brig still lands in the brig,
// `coreBrigDrop.test.tsx`).
//
// Keyed by zone kind, not by a concrete drop id: a mission's ship row and its mission card exist
// once per mission index, and the dilemma pile has two physical drop targets, but conceptually
// there is one lookup entry each. The mission card accepts every type in practice —
// `MISSION_PILE_BY_TYPE` (page.tsx) already routes personnel/equipment to the personnel pile and
// event/mission/interrupt to the event pile, and a ship or a dilemma dropped there is handled
// directly in `handleDragEnd` — so `mission` (like `core` and `discard`) accepts any type here.
// Issue #644: the hand and the dilemma hand are two more zone kinds — the hand accepts any card
// type (advisory, like `core`/`discard`), the dilemma hand only dilemmas (like `dilemmaPile`).
export type ZoneKind =
  | 'shipRow'
  | 'mission'
  | 'crew'
  | 'core'
  | 'brig'
  | 'discard'
  | 'dilemmaPile'
  | 'hand'
  | 'dilemmaHand';

// `null` means every card type highlights this zone kind.
const ZONE_ACCEPTS: Record<ZoneKind, readonly string[] | null> = {
  shipRow: ['ship'],
  mission: null,
  crew: ['personnel', 'equipment'],
  core: null,
  brig: ['personnel'],
  discard: null,
  dilemmaPile: ['dilemma'],
  hand: null,
  dilemmaHand: ['dilemma'],
};

function zoneAccepts(kind: ZoneKind, cardType: string): boolean {
  const accepted = ZONE_ACCEPTS[kind];
  return accepted === null || accepted.includes(cardType);
}

// The two highlight strengths a droppable can show during a drag, exposed as a `data-highlight`
// attribute so a test can assert on what the highlight means rather than on a class string that
// changes with the shade: `'over'` when the pointer is over this zone and the zone accepts the
// dragged card's type, `'valid'` when the zone accepts that type and the pointer is elsewhere.
// `isOver` alone does not win: dnd-kit's collision detection (`page.tsx`) is purely geometric, so
// the pointer can sit over a zone that rejects the dragged type (issue #644's acceptance check —
// a personnel card dragged over the closed dilemma hand, which only accepts dilemmas). Neither
// state applies then, so the zone shows no highlight at all.
export type HighlightState = 'over' | 'valid' | undefined;

export function highlightState(kind: ZoneKind, draggedType: string | null, isOver: boolean): HighlightState {
  const accepts = draggedType !== null && zoneAccepts(kind, draggedType);
  if (isOver) return accepts ? 'over' : undefined;
  return accepts ? 'valid' : undefined;
}

// A ring is a box-shadow, so unlike a border or padding it never affects layout. `over` keeps
// today's `ring-2 ring-accent`, unconditioned on the dragged type, unchanged; `valid` is new and
// visibly weaker.
export const HIGHLIGHT_RING_CLASS: Record<'over' | 'valid', string> = {
  over: 'ring-2 ring-accent',
  valid: 'ring-1 ring-accent/40',
};

export function highlightClassName(highlight: HighlightState): string {
  return highlight ? HIGHLIGHT_RING_CLASS[highlight] : '';
}

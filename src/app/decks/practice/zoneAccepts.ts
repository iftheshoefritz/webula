import type { PlayPlaces } from './playPlaces';

// Advisory highlight lookup for a drag on the practice table (#608). Presentation only: it
// never touches how a drop resolves — `handleDragEnd` (page.tsx) keeps its own per-type routing
// (the ship/dilemma special cases, `shipIdFromCrewDropId`) exactly as it is today, so a drop the lookup marks invalid for a zone
// still succeeds exactly as it does now (an event dropped on the brig still lands in the brig,
// `coreBrigDrop.test.tsx`). The ship row and the dilemma stack are the two zones where the two
// hold the same rule: a drop on the ship row takes only a ship (#886), and a drop on the dilemma
// stack, or on one of its row slots, only a dilemma (#1369), so their highlight and their routing agree.
//
// Keyed by zone kind, not by a concrete drop id: a mission's ship row and its mission card exist
// once per mission index, and the dilemma pile has two physical drop targets, but conceptually
// there is one lookup entry each. The mission card accepts every type in practice — an event or
// another card dropped there is placed on it (#813), a personnel or an equipment joins the away
// team (#870), and a ship or a dilemma dropped there is handled directly in `handleDragEnd` — so
// `mission` (like `core` and `discard`) accepts any type here.
// Issue #644: the hand and the dilemma hand are two more zone kinds — the hand accepts any card
// type (advisory, like `core`/`discard`), the dilemma hand only dilemmas (like `dilemmaPile`).
// Issue #743: `pile`, the draw pile, joins them — it accepts any card type, like `core`/
// `discard`/`hand`, matching its two top/bottom drop halves (`page.tsx`'s `DrawPileButton`).
export type ZoneKind =
  | 'shipRow'
  | 'mission'
  | 'ship'
  | 'core'
  | 'brig'
  | 'discard'
  | 'dilemmaPile'
  | 'hand'
  | 'dilemmaHand'
  | 'dilemmaStack'
  | 'drawDeck';

// `null` means every card type highlights this zone kind.
const ZONE_ACCEPTS: Record<ZoneKind, readonly string[] | null> = {
  shipRow: ['ship'],
  mission: null,
  // A ship's own art (#812): a personnel or an equipment boards the crew (#893), a ship goes to
  // that ship's row (#668), and any other card is placed on it.
  ship: null,
  core: null,
  brig: ['personnel'],
  discard: null,
  dilemmaPile: ['dilemma'],
  hand: null,
  dilemmaHand: ['dilemma'],
  dilemmaStack: ['dilemma'],
  drawDeck: null,
};

function zoneAccepts(kind: ZoneKind, cardType: string): boolean {
  const accepted = ZONE_ACCEPTS[kind];
  return accepted === null || accepted.includes(cardType);
}

// The highlight states a droppable can show during a drag, exposed as a `data-highlight`
// attribute so a test can assert on what the highlight means rather than on a class string that
// changes with the shade: `'over'` when the pointer is over this zone and the zone accepts the
// dragged card's type, `'valid'` when the zone accepts that type and the pointer is elsewhere.
// `isOver` alone does not win: dnd-kit's collision detection (`page.tsx`) is purely geometric, so
// the pointer can sit over a zone that rejects the dragged type (issue #644's acceptance check —
// a personnel card dragged over the closed dilemma hand, which only accepts dilemmas). Neither
// state applies then, so the zone shows no highlight at all.
// Issue #1856: during a drag of a hand card that the play-place model (`playPlaces.ts`) reads, a
// play-place target (a mission card, a ship, a ship row) passes `eligible`: `true` shows `'eligible'`
// in place of `'valid'`, `false` `'dimmed'`. Left undefined, the highlight is the one before.
export type HighlightState = 'over' | 'eligible' | 'valid' | 'dimmed' | undefined;

export function highlightState(
  kind: ZoneKind,
  draggedType: string | null,
  isOver: boolean,
  eligible?: boolean
): HighlightState {
  const accepts = draggedType !== null && zoneAccepts(kind, draggedType);
  if (!accepts) return undefined;
  if (isOver) return 'over';
  if (eligible === undefined) return 'valid';
  return eligible ? 'eligible' : 'dimmed';
}

/** The play places of a drag, or null when the model names none, so the highlight stays as before (#1856). */
export function dragPlayPlaces(places: PlayPlaces | null): PlayPlaces | null {
  if (!places) return null;
  return places.awayTeams.size + places.crews.size + places.shipRows.size > 0 ? places : null;
}

// A play-place target of the highlight (#1856): a mission card or a ship row by its slot, a ship by
// its slot and its instance id.
export type PlayPlaceTarget =
  | { kind: 'mission'; slot: number }
  | { kind: 'shipRow'; slot: number }
  | { kind: 'ship'; slot: number; shipId: string };

/**
 * Whether `target` is a place the dragged card may be played, or undefined with no play places. A ship
 * goes to the ship row of a mission card or of a ship it is dropped on, so it asks `shipRows`; a
 * personnel or an equipment asks the away team of a mission card and the crew of a ship.
 */
export function playPlaceEligible(
  places: PlayPlaces | null,
  draggedType: string | null,
  target: PlayPlaceTarget
): boolean | undefined {
  if (!places) return undefined;
  if (draggedType === 'ship') return places.shipRows.has(target.slot);
  if (target.kind === 'mission') return places.awayTeams.has(target.slot);
  if (target.kind === 'ship') return places.crews.has(target.shipId);
  return undefined;
}

// A ring is a box-shadow, so unlike a border or padding it never affects layout. `over` keeps
// today's `ring-2 ring-accent`, unconditioned on the dragged type, unchanged; `valid` is new and
// visibly weaker. `eligible` (#1856) is a strong ring with a soft glow of the accent colour, also
// box-shadows, and `dimmed` a light opacity.
export const HIGHLIGHT_RING_CLASS: Record<Exclude<HighlightState, undefined>, string> = {
  over: 'ring-2 ring-accent',
  eligible: 'ring-2 ring-accent-light shadow-[0_0_14px_4px_rgba(156,184,156,0.55)]',
  valid: 'ring-1 ring-accent/40',
  dimmed: 'opacity-50',
};

export function highlightClassName(highlight: HighlightState): string {
  return highlight ? HIGHLIGHT_RING_CLASS[highlight] : '';
}

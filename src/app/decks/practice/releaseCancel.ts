// A release near the press point cancels a drag (#774).
//
// An overlay that hides at the start of a drag (the open hand, the open dilemma hand, a pile
// panel) uncovers the zones underneath it. With only the 8 px activation distance between a
// press and a committed drag, a tiny slip then dropped the card in whichever zone lay under the
// release point, though the player never left the card they pressed. So a release still within a
// cancel radius of the press point is not a choice of a target: it cancels the drag.
//
// The radius is a straight-line distance, not a rectangle around the pressed card (#825). Since
// #804 the open fan sits at the top of the game layer, over the mission row, so the centre of a
// mission card lies under a fan card. A rectangle the size of half the card covered that centre,
// and cancelled the drop the player meant to make there. Cutting the rectangle on one side only
// moves the dead spot, because the mission can lie above or below the press point, by where on
// the fan card the finger lands. A slip is a property of a finger, not of the card, so the radius
// does not grow with the card or the table scale.
//
// 24 px is three times the 8 px activation distance, so a drag that just committed and a 9 px
// slip both still cancel.
export const CANCEL_RADIUS = 24; // px

export type PressGeometry = { x: number; y: number };

// Reads the press point from a drag's activator event. Returns null when it is missing (a
// keyboard drag, a test event with no pointer), and a release then counts as a normal drop.
export function pressGeometryFrom(activatorEvent: Event | null | undefined): PressGeometry | null {
  if (!activatorEvent) return null;
  const { clientX, clientY } = activatorEvent as PointerEvent;
  if (typeof clientX !== 'number' || typeof clientY !== 'number') return null;
  return { x: clientX, y: clientY };
}

// True when the release point (the press point plus the drag's delta) lies within the cancel
// radius of the press point.
export function isReleaseInCancelRadius(
  press: PressGeometry | null,
  delta: { x: number; y: number } | null | undefined
): boolean {
  if (!press || !delta) return false;
  return Math.hypot(delta.x, delta.y) < CANCEL_RADIUS;
}

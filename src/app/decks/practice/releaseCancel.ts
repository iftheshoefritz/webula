// A release near the press point cancels a drag (#774).
//
// An overlay that hides at the start of a drag (the open hand, the open dilemma hand, a pile
// panel) uncovers the zones underneath it. With only the 8 px activation distance between a
// press and a committed drag, a tiny slip then dropped the card in whichever zone lay under the
// release point, though the player never left the card they pressed. So a release still inside a
// "dead" rectangle around the press point is not a choice of a target: it cancels the drag.
//
// The dead rectangle is the pressed card's rectangle, as it stood at the press, shrunk to half its
// width and half its height about the press point. The full card would leave only a 10 px strip
// of the brig below the second card of the open fan, and a 10 px target is not a target. Half the
// card still covers every accidental slip. Since #802 a fan card is the viewer size, 108 x 150 px at
// 568 x 320; its bottom edge still sits 16 px above the screen's, so the strip of the brig below
// it is the same, and a press at its centre leaves the dead rectangle after about 38 px downwards.
export const DEAD_RECT_SCALE = 0.5;
// The floor, in each direction from the press point, keeps the rule useful for a small card, or
// a press near a card's edge.
export const DEAD_RECT_MIN_REACH = 24; // px

export type PressGeometry = {
  x: number;
  y: number;
  rect: { left: number; top: number; right: number; bottom: number };
};

// Reads the press point and the pressed card's rectangle from a drag's activator event. Returns
// null when either is missing (a keyboard drag, a test event with no pointer), and a release then
// counts as a normal drop.
export function pressGeometryFrom(activatorEvent: Event | null | undefined): PressGeometry | null {
  if (!activatorEvent) return null;
  const { clientX, clientY, target } = activatorEvent as PointerEvent;
  if (typeof clientX !== 'number' || typeof clientY !== 'number') return null;
  if (!(target instanceof Element)) return null;
  const card = target.closest('[data-card-id]');
  if (!card) return null;
  const { left, top, right, bottom } = card.getBoundingClientRect();
  if (right <= left || bottom <= top) return null;
  return { x: clientX, y: clientY, rect: { left, top, right, bottom } };
}

// True when the release point (the press point plus the drag's delta) lies inside the dead
// rectangle around the press point.
export function isReleaseInDeadRect(
  press: PressGeometry | null,
  delta: { x: number; y: number } | null | undefined
): boolean {
  if (!press || !delta) return false;
  const reach = (distance: number) => Math.max(distance * DEAD_RECT_SCALE, DEAD_RECT_MIN_REACH);
  const { x, y, rect } = press;
  const releaseX = x + delta.x;
  const releaseY = y + delta.y;
  return (
    releaseX >= x - reach(x - rect.left) &&
    releaseX <= x + reach(rect.right - x) &&
    releaseY >= y - reach(y - rect.top) &&
    releaseY <= y + reach(rect.bottom - y)
  );
}

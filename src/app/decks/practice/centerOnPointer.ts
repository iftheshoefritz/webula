import type { Modifier } from '@dnd-kit/core';
import { pressGeometryFrom } from './releaseCancel';

// Keeps the centre of the drag overlay under the pointer (#955).
//
// dnd-kit draws a `DragOverlay` at the top-left of the active node's rect as it was at the start
// of the drag, then adds the drag delta. The pointer's offset inside the overlay is then its offset
// inside the source card. A fan card, or a card of a card list panel, is the viewer size, much
// larger than the 56 px overlay, so a press near its right or its bottom left the overlay far from
// the finger. This moves the overlay so that its centre sits on the pointer (the press point plus
// the delta) instead. Drop targeting reads the pointer, not the overlay, so no drop changes.

type Point = { x: number; y: number };
type Size = { width: number; height: number };
type Transform = { x: number; y: number; scaleX: number; scaleY: number };

// The pure part. `origin` is the point dnd-kit draws the overlay from, `size` the overlay's size.
// Without a press point (a keyboard drag) the transform is returned unchanged.
export function centerOnPointer(
  transform: Transform,
  activatorEvent: Event | null,
  origin: Point | null,
  size: Size | null
): Transform {
  const press = pressGeometryFrom(activatorEvent);
  if (!press || !origin) return transform;
  const halfWidth = size ? size.width / 2 : 0;
  const halfHeight = size ? size.height / 2 : 0;
  return {
    ...transform,
    x: press.x + transform.x - halfWidth - origin.x,
    y: press.y + transform.y - halfHeight - origin.y,
  };
}

// The `DragOverlay` modifier. dnd-kit draws the overlay from the first `activeNodeRect` of the drag,
// though the source can move once the drag starts (the hand closes and the table reflows). So the
// origin is the first rect seen for the drag's activator event, not the rect of the moment.
export function createCenterOnPointerModifier(): Modifier {
  const origins = new WeakMap<Event, Point>();
  return ({ transform, activatorEvent, activeNodeRect, overlayNodeRect }) => {
    let origin: Point | null = null;
    if (activatorEvent) {
      origin = origins.get(activatorEvent) ?? null;
      if (!origin && activeNodeRect) {
        origin = { x: activeNodeRect.left, y: activeNodeRect.top };
        origins.set(activatorEvent, origin);
      }
    } else if (activeNodeRect) {
      origin = { x: activeNodeRect.left, y: activeNodeRect.top };
    }
    return centerOnPointer(transform, activatorEvent, origin, overlayNodeRect);
  };
}

import type { ClientRect } from '@dnd-kit/core';
import { centerOnPointer, createCenterOnPointerModifier } from '../../../app/decks/practice/centerOnPointer';

// #955: the drag overlay from a hand fan appeared far from the finger.

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

const identity = { x: 0, y: 0, scaleX: 1, scaleY: 1 };

// Where the overlay lands: dnd-kit draws it from the drag's first active rect plus the transform.
function overlayRectAfter(origin: ClientRect, t: { x: number; y: number }, overlay: ClientRect) {
  return rect(origin.left + t.x, origin.top + t.y, overlay.width, overlay.height);
}

function contains(r: ClientRect, p: { x: number; y: number }) {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

describe('centerOnPointer', () => {
  // A viewer-size fan card, grabbed near its bottom-right corner.
  const fanCard = rect(300, 500, 180, 250);
  const overlay = rect(0, 0, 56, 78);
  const press = { clientX: 470, clientY: 740 } as unknown as Event;
  const delta = { x: -120, y: -300, scaleX: 1, scaleY: 1 };
  const pointer = { x: 470 - 120, y: 740 - 300 };

  it('puts the centre of the overlay on the pointer', () => {
    const modifier = createCenterOnPointerModifier();
    const t = modifier({
      transform: delta,
      activatorEvent: press,
      activeNodeRect: fanCard,
      overlayNodeRect: overlay,
    } as any);
    const r = overlayRectAfter(fanCard, t, overlay);
    expect(contains(r, pointer)).toBe(true);
    expect(r.left + r.width / 2).toBe(pointer.x);
    expect(r.top + r.height / 2).toBe(pointer.y);
  });

  it('holds when the source card moves after the drag starts', () => {
    const modifier = createCenterOnPointerModifier();
    modifier({ transform: identity, activatorEvent: press, activeNodeRect: fanCard, overlayNodeRect: overlay } as any);
    // The hand closes and the table reflows, so the source rect shifts.
    const shifted = rect(fanCard.left + 90, fanCard.top - 140, fanCard.width, fanCard.height);
    const t = modifier({ transform: delta, activatorEvent: press, activeNodeRect: shifted, overlayNodeRect: overlay } as any);
    // dnd-kit still draws the overlay from the first rect of the drag.
    const r = overlayRectAfter(fanCard, t, overlay);
    expect(r.left + r.width / 2).toBe(pointer.x);
    expect(r.top + r.height / 2).toBe(pointer.y);
  });

  it('returns the transform unchanged for a drag with no pointer (keyboard)', () => {
    expect(centerOnPointer(delta, new Event('keydown'), { x: 300, y: 500 }, overlay)).toEqual(delta);
    expect(centerOnPointer(delta, null, { x: 300, y: 500 }, overlay)).toEqual(delta);
  });
});

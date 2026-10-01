import React, { RefObject, useEffect, useRef, useState } from 'react';
import { swallowClickOf } from './useCardHold';

// Issue #993: on a desktop the player selects more than one card at once by a drag of the mouse.
// A press on the empty space of the open card list panel, or on the backdrop around it or around
// the open hand, starts a box, and the box selects every card it touches. The selection follows
// the box while it moves. A Shift, Ctrl or Cmd press adds the cards to the selection; a plain
// press replaces it.
//
// Only a mouse draws a box. A finger on that same backdrop still closes the panel or the hand
// with a tap, and a press on a card still drags or toggles that card. A press that moves less
// than `BOX_START_DISTANCE` is a tap, and the backdrop's own click still closes. A box swallows
// the click its release makes, so the release does not close the panel.

export const BOX_START_DISTANCE = 4; // px

export type Box = { left: number; top: number; width: number; height: number };

type Rect = { left: number; top: number; right: number; bottom: number };

export function boxFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return { left, top, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function boxTouches(box: Box, rect: Rect): boolean {
  return (
    rect.left <= box.left + box.width &&
    rect.right >= box.left &&
    rect.top <= box.top + box.height &&
    rect.bottom >= box.top
  );
}

// The ids of the cards (`data-card-id`) inside `container` that the box touches, in the order of
// the DOM, which is the order the panel or the fan shows.
export function cardIdsInBox(container: HTMLElement, box: Box): string[] {
  const ids: string[] = [];
  container.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
    const id = el.dataset.cardId;
    if (id && !ids.includes(id) && boxTouches(box, el.getBoundingClientRect())) ids.push(id);
  });
  return ids;
}

// Returns the `onPointerDown` to put on each element a box may start from, and the box to draw
// while it is open. `onSelect` is left out where the zone takes no selection; no box starts then.
export function useBoxSelect(
  containerRef: RefObject<HTMLElement | null>,
  selectedIds: string[],
  onSelect: ((ids: string[]) => void) | undefined
) {
  const [box, setBox] = useState<Box | null>(null);
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!onSelectRef.current || event.pointerType !== 'mouse' || event.button !== 0) return;
    // No text selection under the box.
    event.preventDefault();
    cleanupRef.current?.();
    const down = event.nativeEvent;
    const start = { x: event.clientX, y: event.clientY };
    const base = event.shiftKey || event.ctrlKey || event.metaKey ? selectedRef.current : [];
    let open = false;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== down.pointerId) return;
      const point = { x: e.clientX, y: e.clientY };
      if (!open) {
        if (Math.hypot(point.x - start.x, point.y - start.y) < BOX_START_DISTANCE) return;
        open = true;
        swallowClickOf(down);
      }
      const next = boxFromPoints(start, point);
      setBox(next);
      const container = containerRef.current;
      const hit = container ? cardIdsInBox(container, next) : [];
      onSelectRef.current?.([...base, ...hit.filter((id) => !base.includes(id))]);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === down.pointerId) stop();
    };
    function stop() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cleanupRef.current = null;
      setBox(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    cleanupRef.current = stop;
  };

  return { box, onPointerDown };
}

// The box on screen. It takes no pointer events.
export function BoxSelectRect({ box, className = '' }: { box: Box | null; className?: string }) {
  if (!box) return null;
  return (
    <div
      data-testid="box-select"
      aria-hidden="true"
      className={`fixed pointer-events-none border border-accent bg-accent/20 ${className}`}
      style={box}
    />
  );
}

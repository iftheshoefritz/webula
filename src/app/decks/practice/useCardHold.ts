'use client';

// Press and hold a card to preview it (#763). A press on a card starts a 500 ms timer; when it
// fires, the page shows that card in the large preview (`CardPreview`) until the hold ends. The
// press stays locked to the card it started on, so a pointer that slides off the card keeps the
// same card on the screen.
//
// Before the timer fires, a move past `DRAG_ACTIVATION_DISTANCE` cancels it: that press is a
// drag, and dnd-kit's `PointerSensor` (which uses the same distance, in `page.tsx`) takes it.
//
// The events that end a hold are listened to on `window`/`document`, not on the card: with a
// mouse, the preview's full-screen backdrop sits under the pointer at release, so a `pointerup`
// listener on the card itself would never fire. A drag start ends a hold too, but `page.tsx`
// handles that one in `handleDragStart`.
//
// The page supplies the two callbacks through `CardHoldProvider`, the same pattern
// `DraggedCardTypeContext` uses, so no prop is threaded through `MissionRow` -> `MissionColumn`
// -> `ShipRow` and the others. With no provider (a component rendered on its own in a test),
// a press does nothing new.

import { createContext, useContext, useEffect, useRef } from 'react';
import type { useDraggable } from '@dnd-kit/core';

type DraggableListeners = ReturnType<typeof useDraggable>['listeners'];

export const HOLD_DELAY_MS = 500;
// Shared with the `PointerSensor`'s `activationConstraint` in `page.tsx`, so the point where a
// hold gives way to a drag and the point where the drag starts cannot drift apart.
export const DRAG_ACTIVATION_DISTANCE = 8; // px

export type CardHoldCallbacks = {
  startHold: (id: string) => void;
  endHold: () => void;
};

const CardHoldContext = createContext<CardHoldCallbacks | null>(null);

export const CardHoldProvider = CardHoldContext.Provider;

// Stops iOS Safari's image callout and text selection on a long press, on the card and its art.
export const NO_CALLOUT_STYLE = { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as const;

type PointerHandler = (event: React.PointerEvent) => void;

// Returns the handlers to spread on the card's element in place of dnd-kit's `listeners`. The
// hold's `onPointerDown` calls dnd-kit's own `onPointerDown` too, so neither replaces the other.
export function useCardHold(id: string, listeners?: DraggableListeners) {
  const callbacks = useContext(CardHoldContext);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  // Set once a hold has fired, so the `click` that can follow its release does not reopen the
  // preview through the card's tap handler. Cleared on the next press.
  const swallowClickRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const dndPointerDown = listeners?.onPointerDown as PointerHandler | undefined;

  const onPointerDown: PointerHandler = (event) => {
    dndPointerDown?.(event);
    swallowClickRef.current = false;
    cleanupRef.current?.();
    if (!callbacksRef.current) return;
    // A secondary mouse button is not a press.
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const originX = event.clientX;
    const originY = event.clientY;
    const downEvent = event.nativeEvent;
    let fired = false;

    const end = () => {
      cleanup();
      if (!fired) return;
      callbacksRef.current?.endHold();
      // A release off the card (a mouse lets go over the preview's backdrop) sends no click to
      // the card, so stop waiting for one once this release's own events are done.
      window.setTimeout(() => {
        swallowClickRef.current = false;
      }, 0);
    };
    const onMove = (e: PointerEvent) => {
      if (fired) return;
      if (Math.hypot(e.clientX - originX, e.clientY - originY) > DRAG_ACTIVATION_DISTANCE) cleanup();
    };
    // The press's own `pointerdown` bubbles on to `window` after this handler adds the listener,
    // so only a different event, a second finger, ends the hold.
    const onOtherPointerDown = (e: PointerEvent) => {
      if (e !== downEvent) end();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') end();
    };

    const timer = window.setTimeout(() => {
      fired = true;
      swallowClickRef.current = true;
      callbacksRef.current?.startHold(id);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
    }, HOLD_DELAY_MS);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('pointerdown', onOtherPointerDown);
    window.addEventListener('blur', end);
    document.addEventListener('visibilitychange', onVisibilityChange);

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('pointerdown', onOtherPointerDown);
      window.removeEventListener('blur', end);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (cleanupRef.current === endOnUnmount) cleanupRef.current = null;
    }
    // A card that unmounts mid-hold must not leave the preview stuck on the screen.
    const endOnUnmount = end;
    cleanupRef.current = endOnUnmount;
  };

  const onClickCapture = (event: React.MouseEvent) => {
    if (!swallowClickRef.current) return;
    swallowClickRef.current = false;
    event.stopPropagation();
    event.preventDefault();
  };

  const onContextMenu = (event: React.MouseEvent) => {
    if (callbacksRef.current) event.preventDefault();
  };

  return { ...listeners, onPointerDown, onClickCapture, onContextMenu };
}

'use client';

// Press and hold a card to preview it (#763). A press on a card starts a 500 ms timer; when it
// fires, the page shows that card in the large preview (`CardPreview`) until the hold ends. The
// press stays locked to the card it started on, so a pointer that slides off the card keeps the
// same card on the screen.
//
// Before the timer fires, a move past `DRAG_ACTIVATION_DISTANCE` cancels it: that press is a
// drag, and dnd-kit's `PointerSensor` (which uses the same distance, in `page.tsx`) takes it.
// After the timer fires, the sensor waits for a longer move, `HELD_DRAG_ACTIVATION_DISTANCE`
// (#925), so a twitch under the preview does not start a drag.
// Inside a card list panel whose grid scrolls, a touch or pen press goes to `PanelScrollSensor`
// instead (#788), which decides at the same distance: a vertical first move scrolls the grid,
// and the browser's `pointercancel` ends the hold.
//
// The events that end a hold are listened to on `window`/`document`, not on the card, so the
// hold ends wherever the pointer is released. The preview takes no pointer events, so it never
// stands between the release and the page. A drag start and a drag end end a hold too, but
// `page.tsx` handles those in `handleDragStart` and `handleDragEnd`.
//
// A touch device can lose the release of a press (#776): the system takes the gesture, and the
// page never sees the `pointerup`. So a hold also ends on the other signs that its pointer has
// gone (`touchend`, `touchcancel`, `lostpointercapture`, a `pointermove` with no button down).
// If none of them comes, the next press ends the hold, and the click of that press is swallowed
// wherever it lands: a press that dismisses a preview is a dismiss, not an action.
//
// The page supplies the two callbacks through `CardHoldProvider`, the same pattern
// `DraggedCardTypeContext` uses, so no prop is threaded through `MissionRow` -> `MissionColumn`
// -> `ShipRow` and the others. With no provider (a component rendered on its own in a test),
// a press does nothing new.
//
// A mouse also previews a card by hover (#766): the pointer rests on the card for 300 ms, and
// the page shows it until the pointer leaves. The hover has its own state on the page, apart
// from the hold. The end of a hold ends the hover on the same card too (#784): a pointer that
// never moves again sends no `pointerleave`, and the hover's preview would stay up for good.
// A touch or a pen ignores the hover, and so does a pointer that enters with a button held (a
// drag passing over the card).

import { createContext, useContext, useEffect, useRef } from 'react';
import type { useDraggable } from '@dnd-kit/core';
import { CANCEL_RADIUS } from './releaseCancel';

type DraggableListeners = ReturnType<typeof useDraggable>['listeners'];

export const HOLD_DELAY_MS = 500;
// The hold, during a drag, over one card in the core or the brig that places the dragged card on
// it (#1029). Longer than `HOLD_DELAY_MS`, so the player can tell the two holds apart, and so a
// drag that only passes over a card, or slows near it, does not place the card by accident.
export const PLACE_ON_HOLD_MS = 800;
// Long enough that a mouse crossing the mission row does not flash every card it passes.
export const HOVER_DELAY_MS = 300;
// Two taps on a mission card within this window are a double-tap (#1059), which toggles the
// mission's completion. A single tap waits out the window before it acts.
export const DOUBLE_TAP_MS = 250;
// Shared with the `PointerSensor`'s `activationConstraint` in `page.tsx` and with
// `PanelScrollSensor`'s direction rule, so the point where a hold gives way to a drag and the
// point where the drag starts cannot drift apart.
export const DRAG_ACTIVATION_DISTANCE = 8; // px
// Once the hold has fired, a twitch of the finger under the preview must not start a drag (#925),
// so the press needs a move as long as `CANCEL_RADIUS` before it becomes one. A shorter drag would
// be cancelled on release anyway.
export const HELD_DRAG_ACTIVATION_DISTANCE = CANCEL_RADIUS; // px

// The distance a press must move to start a drag, by whether its hold has fired.
export function dragActivationDistanceFor(held: boolean): number {
  return held ? HELD_DRAG_ACTIVATION_DISTANCE : DRAG_ACTIVATION_DISTANCE;
}

// The `pointerdown` of the press whose hold has fired and not yet ended. `PanelScrollSensor`
// compares it with the press it tracks, since dnd-kit's sensor has no other way to learn of a hold.
let heldPress: PointerEvent | null = null;

export function isHeldPress(press: Event | null | undefined): boolean {
  return press != null && press === heldPress;
}

// The side of the screen the preview takes: the one away from the press point (#879), so a
// thumb on a card of the right half does not cover the preview it asked for.
export type PreviewSide = 'left' | 'right';

export function previewSideFor(clientX: number): PreviewSide {
  return clientX > window.innerWidth / 2 ? 'left' : 'right';
}

export type CardHoldCallbacks = {
  startHold: (id: string, side: PreviewSide) => void;
  endHold: () => void;
  startHover: (id: string, side: PreviewSide) => void;
  // Ends the hover only if it is on this card.
  endHover: (id: string) => void;
};

const CardHoldContext = createContext<CardHoldCallbacks | null>(null);

export const CardHoldProvider = CardHoldContext.Provider;

// Stops iOS Safari's image callout and text selection on a long press, on the card and its art.
export const NO_CALLOUT_STYLE = { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' } as const;

type PointerHandler = (event: React.PointerEvent) => void;

// Swallows the one `click` the press `down` produces, wherever it lands (#776). The listener is
// on `window` in the capture phase, so it runs before any handler on the table. It is dropped
// once the press's release has sent its events (the same `setTimeout(..., 0)` as a hold's own
// release uses), or at the next press, so it never eats a later tap.
export function swallowClickOf(down: PointerEvent) {
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    drop();
  };
  const onRelease = (e: PointerEvent) => {
    if (e.pointerId === down.pointerId) window.setTimeout(drop, 0);
  };
  const onNextPress = (e: PointerEvent) => {
    if (e !== down) drop();
  };
  function drop() {
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('pointerup', onRelease, true);
    window.removeEventListener('pointercancel', onRelease, true);
    window.removeEventListener('pointerdown', onNextPress, true);
  }
  window.addEventListener('click', onClick, true);
  window.addEventListener('pointerup', onRelease, true);
  window.addEventListener('pointercancel', onRelease, true);
  window.addEventListener('pointerdown', onNextPress, true);
}

// Returns the handlers to spread on the card's element in place of dnd-kit's `listeners`. The
// hold's `onPointerDown` calls dnd-kit's own `onPointerDown` too, so neither replaces the other.
export function useCardHold(id: string, listeners?: DraggableListeners) {
  const callbacks = useContext(CardHoldContext);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  // Set once a hold has fired, so the `click` that can follow its release does not also run the
  // card's tap handler (a selection toggle, or a crew panel). Cleared on the next press.
  const swallowClickRef = useRef(false);
  // Ends the hold in progress, if any. Given the press that ends it, it swallows that press's
  // click when the hold has fired (#776).
  const cleanupRef = useRef<((press?: PointerEvent) => void) | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);
  const idRef = useRef(id);
  idRef.current = id;

  const cancelHoverTimer = () => {
    if (hoverTimerRef.current === null) return;
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  };

  // A card that unmounts under the pointer (a card dropped out of a panel) sends no
  // `pointerleave`, so it ends its own hover here.
  const endHover = () => {
    cancelHoverTimer();
    if (!hoveredRef.current) return;
    hoveredRef.current = false;
    callbacksRef.current?.endHover(idRef.current);
  };

  useEffect(
    () => () => {
      cleanupRef.current?.();
      endHover();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const dndPointerDown = listeners?.onPointerDown as PointerHandler | undefined;

  const onPointerDown: PointerHandler = (event) => {
    dndPointerDown?.(event);
    // A press is a tap, a hold or a drag, so a hover still pending on the card does not fire.
    cancelHoverTimer();
    swallowClickRef.current = false;
    cleanupRef.current?.(event.nativeEvent);
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
      endHover();
      // A release off the card (a mouse lets go over the preview's backdrop) sends no click to
      // the card, so stop waiting for one once this release's own events are done.
      window.setTimeout(() => {
        swallowClickRef.current = false;
      }, 0);
    };
    const onMove = (e: PointerEvent) => {
      // A mouse or a pen that moves with no button down was released where the page did not see
      // it. A touch `pointermove` always has a button down, so this never ends a touch hold.
      if (e.buttons === 0) {
        end();
        return;
      }
      if (fired) return;
      if (Math.hypot(e.clientX - originX, e.clientY - originY) > DRAG_ACTIVATION_DISTANCE) cleanup();
    };
    const onLostCapture = (e: PointerEvent) => {
      if (e.pointerId === downEvent.pointerId) end();
    };
    // The press's own `pointerdown` bubbles on to `window` after this handler adds the listener,
    // so only a different event, a second finger or a press after a lost release, ends the hold.
    const onOtherPointerDown = (e: PointerEvent) => {
      if (e !== downEvent) endBy(e);
    };
    const endBy = (press?: PointerEvent) => {
      if (press && fired) swallowClickOf(press);
      end();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') end();
    };

    const timer = window.setTimeout(() => {
      fired = true;
      heldPress = downEvent;
      swallowClickRef.current = true;
      callbacksRef.current?.startHold(id, previewSideFor(originX));
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
    }, HOLD_DELAY_MS);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('pointerdown', onOtherPointerDown);
    window.addEventListener('blur', end);
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    window.addEventListener('lostpointercapture', onLostCapture);
    document.addEventListener('visibilitychange', onVisibilityChange);

    function cleanup() {
      window.clearTimeout(timer);
      if (heldPress === downEvent) heldPress = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('pointerdown', onOtherPointerDown);
      window.removeEventListener('blur', end);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      window.removeEventListener('lostpointercapture', onLostCapture);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (cleanupRef.current === endBy) cleanupRef.current = null;
    }
    // A card that unmounts mid-hold must not leave the preview stuck on the screen, and a new
    // press on the same card ends the old hold before its own listeners would hear it.
    cleanupRef.current = endBy;
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

  const onPointerEnter: PointerHandler = (event) => {
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
    if (!callbacksRef.current) return;
    cancelHoverTimer();
    const side = previewSideFor(event.clientX);
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      hoveredRef.current = true;
      callbacksRef.current?.startHover(idRef.current, side);
    }, HOVER_DELAY_MS);
  };

  const onPointerLeave: PointerHandler = () => endHover();

  return { ...listeners, onPointerDown, onPointerEnter, onPointerLeave, onClickCapture, onContextMenu };
}

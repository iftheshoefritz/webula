// A pile panel whose card grid scrolls (#788) splits a touch into a scroll or a drag at the same
// `DRAG_ACTIVATION_DISTANCE` the hold uses. The first 8 px decide: mostly up or down scrolls the
// grid, mostly sideways starts the drag. Once a drag starts it follows the pointer in every
// direction, so a card can still go up or down to any zone.
//
// `PilePanel` marks a grid that overflows with `PANEL_SCROLLS_ATTRIBUTE`, and gives its cards
// `touch-action: pan-y` there, so the browser can pan the grid at all. `PanelScrollSensor` sits
// before the ordinary `PointerSensor` in `page.tsx`'s `useSensors`; dnd-kit gives a press to the
// first sensor whose activator returns true. This one claims only a touch or pen press on a card
// inside a marked grid. A mouse keeps the ordinary sensor and a drag in any direction, since it
// scrolls with the wheel. A panel that fits, and every other zone on the table, keep the ordinary
// sensor too.
import type { PointerEvent as ReactPointerEvent } from 'react';
import { PointerSensor, type PointerSensorOptions } from '@dnd-kit/core';
import { DRAG_ACTIVATION_DISTANCE } from './useCardHold';

export const PANEL_SCROLLS_ATTRIBUTE = 'data-panel-scrolls';

export type PanelGesture = 'pending' | 'drag' | 'scroll';

// Under the threshold nothing is decided yet. Past it, sideways wins only when it is strictly
// larger, so an exact diagonal scrolls. `>` matches dnd-kit's own distance check.
export function panelGestureFor(dx: number, dy: number): PanelGesture {
  if (Math.hypot(dx, dy) <= DRAG_ACTIVATION_DISTANCE) return 'pending';
  return Math.abs(dx) > Math.abs(dy) ? 'drag' : 'scroll';
}

export function isInScrollingPanel(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${PANEL_SCROLLS_ATTRIBUTE}="true"]`) !== null;
}

// dnd-kit declares these members private, so the subclass reaches them through this shape.
type SensorInternals = {
  activated: boolean;
  initialCoordinates: { x: number; y: number } | null;
  handleStart: () => void;
  handleMove: (event: Event) => void;
  handleCancel: () => void;
  detach: () => void;
  stopTouchScroll?: () => void;
};

export class PanelScrollSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: ReactPointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!event.isPrimary || event.button !== 0) return false;
        if (event.pointerType === 'mouse') return false;
        if (!isInScrollingPanel(event.target)) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

const base = PointerSensor.prototype as unknown as SensorInternals;
const sensor = PanelScrollSensor.prototype as unknown as SensorInternals;

// The base constructor binds `this.handleMove`, so it picks up this override.
sensor.handleMove = function (this: SensorInternals, event: Event) {
  if (!this.activated && this.initialCoordinates) {
    const { clientX, clientY } = event as MouseEvent;
    const gesture = panelGestureFor(clientX - this.initialCoordinates.x, clientY - this.initialCoordinates.y);
    if (gesture === 'scroll') return this.handleCancel();
    if (gesture === 'drag') return this.handleStart();
  }
  base.handleMove.call(this, event);
};

// With `pan-y` on the card, a drag that started sideways must not turn into a pan when it later
// moves up or down. A non-passive `touchmove` listener holds the page still for the rest of it.
sensor.handleStart = function (this: SensorInternals) {
  base.handleStart.call(this);
  if (!this.activated || this.stopTouchScroll) return;
  const preventScroll = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  document.addEventListener('touchmove', preventScroll, { passive: false });
  this.stopTouchScroll = () => document.removeEventListener('touchmove', preventScroll);
};

sensor.detach = function (this: SensorInternals) {
  this.stopTouchScroll?.();
  this.stopTouchScroll = undefined;
  base.detach.call(this);
};

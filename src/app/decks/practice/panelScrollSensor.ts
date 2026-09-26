// A pile panel whose card grid scrolls (#788) splits a touch into a scroll or a drag at the same
// `DRAG_ACTIVATION_DISTANCE` the hold uses. The first 8 px decide: mostly up or down scrolls the
// grid, mostly sideways starts the drag. Once a drag starts it follows the pointer in every
// direction, so a card can still go up or down to any zone.
//
// `PilePanel` marks a grid that overflows with `PANEL_SCROLLS_ATTRIBUTE`, and gives its cards
// `touch-action: pan-y` there, so the browser can pan the grid at all. `PanelScrollSensor` is the
// table's only pointer sensor (`page.tsx`'s `useSensors`), and it keeps `PointerSensor`'s own
// activator. It cannot sit in front of a second `PointerSensor`: dnd-kit keys a draggable's
// listeners by event name (`useSyntheticListeners`), so the later sensor's `onPointerDown`
// replaces the earlier one's and the first sensor never sees a press. The direction rule applies
// only to a touch or pen press on a card inside a marked grid. A mouse keeps a drag in any
// direction, since it scrolls with the wheel. A panel that fits, and every other zone on the
// table, keep the ordinary behaviour too. It takes the same `activationConstraint` as the
// ordinary sensor did, so a press waits for the first move instead of starting the drag at once.
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { isInScrollingPanel, panelGestureFor } from './panelGesture';
import { DRAG_ACTIVATION_DISTANCE } from './useCardHold';

// dnd-kit declares these members private, so the subclass reaches them through this shape.
type SensorInternals = {
  props: { event: Event };
  activated: boolean;
  initialCoordinates: { x: number; y: number } | null;
  handleStart: () => void;
  handleMove: (event: Event) => void;
  handleCancel: () => void;
  detach: () => void;
  stopTouchScroll?: () => void;
};

export class PanelScrollSensor extends PointerSensor {}

// The table's sensors. `PanelScrollSensor` is the only pointer sensor: dnd-kit keeps one
// `onPointerDown` per draggable, the last sensor's, so a second pointer sensor after it would
// take every press away from it.
export function useTableSensors() {
  return useSensors(useSensor(PanelScrollSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }));
}

const base = PointerSensor.prototype as unknown as SensorInternals;
const sensor = PanelScrollSensor.prototype as unknown as SensorInternals;

// Whether the press that started this sensor is a touch or pen press inside a scrolling grid.
function splitsScrollFromDrag(sensorInstance: SensorInternals): boolean {
  const press = sensorInstance.props.event as PointerEvent;
  return press.pointerType !== 'mouse' && isInScrollingPanel(press.target);
}

// The base constructor binds `this.handleMove`, so it picks up this override.
sensor.handleMove = function (this: SensorInternals, event: Event) {
  if (!this.activated && this.initialCoordinates && splitsScrollFromDrag(this)) {
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
  if (!this.activated || this.stopTouchScroll || !splitsScrollFromDrag(this)) return;
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

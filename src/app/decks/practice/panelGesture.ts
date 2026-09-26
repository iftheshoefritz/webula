// The direction rule of a scrolling pile panel (#788), apart from dnd-kit so `PilePanel` and the
// tests can import it without the sensor. `panelScrollSensor.ts` explains the rule.
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

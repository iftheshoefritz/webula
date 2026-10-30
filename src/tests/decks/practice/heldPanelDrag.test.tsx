// #1367: in a scrolling attempt row or card list panel, a touch whose first move was vertical
// always scrolled, so a card could not be dragged up to the strip or down to the bottom row. A
// press held until its preview fires now drags in any direction, and the table cancels the
// `touchmove`s of that press so the browser does not take it as a pan first.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DndContext, useDraggable } from '@dnd-kit/core';
import { PANEL_SCROLLS_ATTRIBUTE } from '../../../app/decks/practice/panelGesture';
import { blocksTouchScroll, useTableSensors } from '../../../app/decks/practice/panelScrollSensor';
import { CardHoldProvider, HOLD_DELAY_MS, useCardHold } from '../../../app/decks/practice/useCardHold';

// jsdom has no PointerEvent, so `fireEvent.pointerDown` would drop `pointerType` and `isPrimary`,
// which the sensor reads.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

function Card() {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: 'card-1' });
  const holdListeners = useCardHold('card-1', listeners);
  return (
    <button ref={setNodeRef} {...attributes} {...holdListeners}>
      card
    </button>
  );
}

const callbacks = { startHold: () => {}, endHold: () => {}, startHover: () => {}, endHover: () => {} };

function Table({ scrolls, onDragStart }: { scrolls: boolean; onDragStart: () => void }) {
  const sensors = useTableSensors();
  return (
    <CardHoldProvider value={callbacks}>
      <DndContext sensors={sensors} onDragStart={onDragStart}>
        <div {...(scrolls ? { [PANEL_SCROLLS_ATTRIBUTE]: 'true' } : {})}>
          <Card />
        </div>
      </DndContext>
    </CardHoldProvider>
  );
}

type Press = { pointerType?: string; hold: boolean; scrolls?: boolean };

const press = ({ pointerType = 'touch', hold, scrolls = true }: Press) => {
  const onDragStart = jest.fn();
  render(<Table scrolls={scrolls} onDragStart={onDragStart} />);
  const card = screen.getByRole('button', { name: 'card' });
  fireEvent.pointerDown(card, { pointerType, isPrimary: true, button: 0, buttons: 1, clientX: 100, clientY: 200 });
  if (hold) act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
  return onDragStart;
};

const moveBy = (dx: number, dy: number, pointerType = 'touch') =>
  fireEvent.pointerMove(document, { pointerType, buttons: 1, clientX: 100 + dx, clientY: 200 + dy });

// Whether the page cancels a `touchmove` sent now.
const touchMoveCancelled = () => {
  const event = new Event('touchmove', { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('a held press in a scrolling area (#1367)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    fireEvent.pointerUp(document);
    fireEvent.pointerUp(window);
    jest.useRealTimers();
  });

  it('drags on a 40 px move straight up once the hold has fired', () => {
    const onDragStart = press({ hold: true });
    moveBy(0, -40);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('drags on a 40 px move straight down once the hold has fired', () => {
    const onDragStart = press({ hold: true });
    moveBy(0, 40);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('does not drag on a 10 px twitch once the hold has fired', () => {
    const onDragStart = press({ hold: true });
    moveBy(0, -10);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('scrolls, and does not drag, on a quick vertical swipe', () => {
    const onDragStart = press({ hold: false });
    moveBy(0, -12);
    moveBy(0, -40);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('still drags on a sideways first move with no hold', () => {
    const onDragStart = press({ hold: false });
    moveBy(12, 2);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('still drags on a vertical touch outside a scrolling area', () => {
    const onDragStart = press({ hold: false, scrolls: false });
    moveBy(0, -12);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });
});

describe('the touch-scroll guard (#1367)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    fireEvent.pointerUp(document);
    fireEvent.pointerUp(window);
    jest.useRealTimers();
  });

  it('cancels a touchmove while a held touch press in a scrolling area is in force', () => {
    press({ hold: true });
    expect(blocksTouchScroll()).toBe(true);
    expect(touchMoveCancelled()).toBe(true);
  });

  it('leaves a touchmove alone before the hold fires, so a swipe scrolls', () => {
    press({ hold: false });
    expect(touchMoveCancelled()).toBe(false);
  });

  it('leaves a touchmove alone for a held press outside a scrolling area', () => {
    press({ hold: true, scrolls: false });
    expect(touchMoveCancelled()).toBe(false);
  });

  it('leaves a touchmove alone for a held mouse press', () => {
    press({ pointerType: 'mouse', hold: true });
    expect(touchMoveCancelled()).toBe(false);
  });

  it('stops cancelling once the held press is released', () => {
    press({ hold: true });
    fireEvent.pointerUp(window);
    expect(touchMoveCancelled()).toBe(false);
  });

  it('cancels a touchmove while a drag that started sideways in a scrolling area runs, and not after it', () => {
    const onDragStart = press({ hold: false });
    moveBy(12, 2);
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(touchMoveCancelled()).toBe(true);
    fireEvent.pointerUp(document);
    expect(touchMoveCancelled()).toBe(false);
  });
});

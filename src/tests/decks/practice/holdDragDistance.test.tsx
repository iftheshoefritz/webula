// #925: once the hold preview had fired, a twitch of 9 px started a drag, because the sensor kept
// its 8 px activation distance for the whole press. The preview closed and the fan snapped shut.
// A held press now needs a move as long as the release cancel radius.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DndContext, useDraggable } from '@dnd-kit/core';
import { useTableSensors } from '../../../app/decks/practice/panelScrollSensor';
import { CANCEL_RADIUS } from '../../../app/decks/practice/releaseCancel';
import {
  CardHoldProvider,
  DRAG_ACTIVATION_DISTANCE,
  HELD_DRAG_ACTIVATION_DISTANCE,
  HOLD_DELAY_MS,
  dragActivationDistanceFor,
  useCardHold,
} from '../../../app/decks/practice/useCardHold';

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

describe('dragActivationDistanceFor (#925)', () => {
  it('keeps the 8 px distance for a press with no hold', () => {
    expect(dragActivationDistanceFor(false)).toBe(DRAG_ACTIVATION_DISTANCE);
    expect(DRAG_ACTIVATION_DISTANCE).toBe(8);
  });

  it('needs the cancel radius once the hold has fired', () => {
    expect(dragActivationDistanceFor(true)).toBe(HELD_DRAG_ACTIVATION_DISTANCE);
    expect(HELD_DRAG_ACTIVATION_DISTANCE).toBe(CANCEL_RADIUS);
  });
});

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

function Table({ onDragStart }: { onDragStart: () => void }) {
  const sensors = useTableSensors();
  return (
    <CardHoldProvider value={callbacks}>
      <DndContext sensors={sensors} onDragStart={onDragStart}>
        <Card />
      </DndContext>
    </CardHoldProvider>
  );
}

// Presses the card, optionally holds it until the preview fires, then moves the pointer `dx` px.
const gesture = (dx: number, hold: boolean) => {
  const onDragStart = jest.fn();
  render(<Table onDragStart={onDragStart} />);
  const card = screen.getByRole('button', { name: 'card' });
  fireEvent.pointerDown(card, { pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: 100, clientY: 100 });
  if (hold) act(() => jest.advanceTimersByTime(HOLD_DELAY_MS));
  fireEvent.pointerMove(document, { pointerType: 'touch', buttons: 1, clientX: 100 + dx, clientY: 100 });
  return onDragStart;
};

describe('the table sensors after a hold (#925)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    fireEvent.pointerUp(document);
    fireEvent.pointerUp(window);
    jest.useRealTimers();
  });

  it('does not start a drag on a 10 px twitch after the hold fired', () => {
    expect(gesture(10, true)).not.toHaveBeenCalled();
  });

  it('starts a drag on a 40 px move after the hold fired', () => {
    expect(gesture(40, true)).toHaveBeenCalledTimes(1);
  });

  it('still starts a drag on a 9 px move with no hold', () => {
    expect(gesture(9, false)).toHaveBeenCalledTimes(1);
  });
});

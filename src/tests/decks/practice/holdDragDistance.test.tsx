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
  HAND_ARC_ATTRIBUTE,
  HAND_ARC_DRAG_ACTIVATION_DISTANCE,
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

  // #1131: a thumb on an outer card of the hand arc drifts past 8 px before the preview fires.
  it('needs a longer move on a card of the hand arc, and the cancel radius once it has held', () => {
    expect(dragActivationDistanceFor(false, true)).toBe(HAND_ARC_DRAG_ACTIVATION_DISTANCE);
    expect(HAND_ARC_DRAG_ACTIVATION_DISTANCE).toBeGreaterThan(12);
    expect(HAND_ARC_DRAG_ACTIVATION_DISTANCE).toBeLessThan(HELD_DRAG_ACTIVATION_DISTANCE);
    expect(dragActivationDistanceFor(true, true)).toBe(HELD_DRAG_ACTIVATION_DISTANCE);
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

function Table({ onDragStart, onHold, inHandArc }: { onDragStart: () => void; onHold?: () => void; inHandArc?: boolean }) {
  const sensors = useTableSensors();
  return (
    <CardHoldProvider value={onHold ? { ...callbacks, startHold: onHold } : callbacks}>
      <DndContext sensors={sensors} onDragStart={onDragStart}>
        <div {...{ [HAND_ARC_ATTRIBUTE]: inHandArc ? 'true' : undefined }}>
          <Card />
        </div>
      </DndContext>
    </CardHoldProvider>
  );
}

// Presses the card, optionally holds it until the preview fires, then moves the pointer `dx` px.
const gesture = (dx: number, hold: boolean, inHandArc = false) => {
  const onDragStart = jest.fn();
  render(<Table onDragStart={onDragStart} inHandArc={inHandArc} />);
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

describe('a press on a card of the hand arc (#1131)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    fireEvent.pointerUp(document);
    fireEvent.pointerUp(window);
    jest.useRealTimers();
  });

  it('keeps the hold and starts no drag when the thumb drifts 12 px before the preview fires', () => {
    const onDragStart = jest.fn();
    const onHold = jest.fn();
    render(<Table onDragStart={onDragStart} onHold={onHold} inHandArc />);
    const card = screen.getByRole('button', { name: 'card' });
    fireEvent.pointerDown(card, { pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: 100, clientY: 300 });
    fireEvent.pointerMove(document, { pointerType: 'touch', buttons: 1, clientX: 106, clientY: 300 });
    fireEvent.pointerMove(document, { pointerType: 'touch', buttons: 1, clientX: 112, clientY: 300 });
    act(() => jest.advanceTimersByTime(HOLD_DELAY_MS + 100));
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('starts a drag on a move past the hand arc distance with no hold', () => {
    expect(gesture(HAND_ARC_DRAG_ACTIVATION_DISTANCE + 1, false, true)).toHaveBeenCalledTimes(1);
  });

  it('starts no drag on a 12 px move with no hold', () => {
    expect(gesture(12, false, true)).not.toHaveBeenCalled();
  });

  it('keeps the 8 px distance for a card outside the arc', () => {
    expect(gesture(12, false)).toHaveBeenCalledTimes(1);
  });
});

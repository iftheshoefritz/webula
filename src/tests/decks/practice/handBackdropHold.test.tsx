// #1540: while the hand is open, its backdrop takes every press off the fan's cards, so a hold on
// a table card under it previewed nothing. The backdrop now finds the hold target under the press
// and runs the same hold. jsdom has no `elementsFromPoint`, so it is stubbed to return the
// backdrop, then the table card, wherever the press is; `overCard` false returns the backdrop only.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDndContext: () => ({ active: null, over: null }),
}));

import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CardHand from '../../../app/decks/practice/CardHand';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { CardHoldProvider, HOLD_DELAY_MS, useCardHold } from '../../../app/decks/practice/useCardHold';

if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

const makeCard = (n: number): CardInstance =>
  ({
    id: `card-${n}`,
    face: 'up',
    stopped: false,
    card: { collectorsinfo: `1U0${n}`, originalName: `Card ${n}`, type: 'equipment', name: `card ${n}`, imagefile: `card_${n}` },
  }) as unknown as CardInstance;

const cards = [0, 1, 2].map(makeCard);

function TableCardStub() {
  const holdListeners = useCardHold('card-x');
  return <div data-testid="table-card" {...holdListeners} />;
}

let overCard = true;
const originalElementsFromPoint = document.elementsFromPoint;
beforeEach(() => {
  jest.useFakeTimers();
  overCard = true;
  document.elementsFromPoint = () => {
    const backdrop = screen.getByRole('button', { name: 'Close hand' });
    return overCard ? [backdrop, screen.getByTestId('table-card')] : [backdrop];
  };
});
afterEach(() => {
  jest.useRealTimers();
  document.elementsFromPoint = originalElementsFromPoint;
});

function setup() {
  const callbacks = { startHold: jest.fn(), endHold: jest.fn(), startHover: jest.fn(), endHover: jest.fn() };
  const onClose = jest.fn();
  function Table() {
    const [ids, setIds] = useState<string[]>([]);
    return (
      <CardHoldProvider value={callbacks}>
        <TableCardStub />
        <div data-testid="selected">{ids.join(',')}</div>
        <CardHand instances={cards} open onOpen={() => {}} onClose={onClose} selectedIds={ids} onSelectIds={setIds} />
      </CardHoldProvider>
    );
  }
  render(<Table />);
  return { callbacks, onClose, backdrop: screen.getByRole('button', { name: 'Close hand' }) };
}

const touch = { pointerId: 1, pointerType: 'touch', button: 0, clientX: 150, clientY: 200 };
const mouse = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 150, clientY: 200 };

function release(target: Element) {
  act(() => void fireEvent.pointerUp(window, { pointerId: 1, clientX: 150, clientY: 200 }));
  fireEvent.click(target);
}

describe('a hold on the open hand’s backdrop (#1540)', () => {
  it('previews the table card under the press, and its release keeps the hand open', () => {
    const { callbacks, onClose, backdrop } = setup();
    fireEvent.pointerDown(backdrop, touch);
    act(() => void jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(callbacks.startHold).toHaveBeenCalledWith('card-x', 'right');
    release(backdrop);
    expect(callbacks.endHold).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a press released before the hold fires still closes the hand', () => {
    const { callbacks, onClose, backdrop } = setup();
    fireEvent.pointerDown(backdrop, touch);
    act(() => void jest.advanceTimersByTime(HOLD_DELAY_MS - 100));
    release(backdrop);
    act(() => void jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(callbacks.startHold).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a press over no hold target previews nothing', () => {
    const { callbacks, onClose, backdrop } = setup();
    overCard = false;
    fireEvent.pointerDown(backdrop, touch);
    act(() => void jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(callbacks.startHold).not.toHaveBeenCalled();
    release(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a mouse drag opens the box and cancels the hold', () => {
    const { callbacks, backdrop } = setup();
    fireEvent.pointerDown(backdrop, mouse);
    act(() => void fireEvent.pointerMove(window, { ...mouse, buttons: 1, clientX: 156 }));
    expect(screen.getByTestId('box-select')).toBeTruthy();
    act(() => void jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(callbacks.startHold).not.toHaveBeenCalled();
  });

  it('a mouse press held still previews, and a later move opens no box', () => {
    const { callbacks, onClose, backdrop } = setup();
    fireEvent.pointerDown(backdrop, mouse);
    act(() => void jest.advanceTimersByTime(HOLD_DELAY_MS));
    expect(callbacks.startHold).toHaveBeenCalledWith('card-x', 'right');
    act(() => void fireEvent.pointerMove(window, { ...mouse, buttons: 1, clientX: 300 }));
    expect(screen.queryByTestId('box-select')).toBeNull();
    release(backdrop);
    expect(callbacks.endHold).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// #788: the table's sensors, in a real `DndContext`, split a touch in a scrolling pile panel into
// a scroll or a drag. The first version put `PanelScrollSensor` before an ordinary
// `PointerSensor`. dnd-kit keeps one `onPointerDown` per draggable, the last sensor's, so the
// ordinary sensor took every press and a vertical touch still picked the card up.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext, useDraggable } from '@dnd-kit/core';
import { PANEL_SCROLLS_ATTRIBUTE } from '../../../app/decks/practice/panelGesture';
import { useTableSensors } from '../../../app/decks/practice/panelScrollSensor';

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
  return (
    <button ref={setNodeRef} {...attributes} {...listeners}>
      card
    </button>
  );
}

function Table({ scrolls, onDragStart }: { scrolls: boolean; onDragStart: () => void }) {
  const sensors = useTableSensors();
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart}>
      <div {...(scrolls ? { [PANEL_SCROLLS_ATTRIBUTE]: 'true' } : {})}>
        <Card />
      </div>
    </DndContext>
  );
}

const gesture = (pointerType: string, dx: number, dy: number, scrolls = true) => {
  const onDragStart = jest.fn();
  render(<Table scrolls={scrolls} onDragStart={onDragStart} />);
  const card = screen.getByRole('button', { name: 'card' });
  fireEvent.pointerDown(card, { pointerType, isPrimary: true, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(document, { pointerType, clientX: 100 + dx, clientY: 100 + dy });
  return onDragStart;
};

describe('the table sensors (#788)', () => {
  it('scrolls instead of dragging on a vertical touch in a scrolling panel', () => {
    expect(gesture('touch', 0, 12)).not.toHaveBeenCalled();
  });

  it('scrolls instead of dragging on a vertical pen move in a scrolling panel', () => {
    expect(gesture('pen', 2, -12)).not.toHaveBeenCalled();
  });

  it('drags on a sideways touch in a scrolling panel', () => {
    expect(gesture('touch', 12, 2)).toHaveBeenCalledTimes(1);
  });

  it('drags on a vertical mouse move in a scrolling panel', () => {
    expect(gesture('mouse', 0, 12)).toHaveBeenCalledTimes(1);
  });

  it('drags on a vertical touch outside a scrolling panel', () => {
    expect(gesture('touch', 0, 12, false)).toHaveBeenCalledTimes(1);
  });

  it('waits for 8 px before it decides', () => {
    expect(gesture('touch', 5, 0)).not.toHaveBeenCalled();
  });
});

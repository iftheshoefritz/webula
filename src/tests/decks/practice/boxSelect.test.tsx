// #993: on a desktop, a mouse drag from the empty space around the cards of an open card list
// panel, or of the open hand, draws a box, and the box selects every card it touches. jsdom lays
// nothing out, so each card's rectangle is stubbed: card-0 at x 0-100, card-1 at x 200-300, card-2
// at x 400-500, all at y 0-140.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDndContext: () => ({ active: null, over: null }),
}));

import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import CardHand from '../../../app/decks/practice/CardHand';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

// jsdom has no PointerEvent, so `fireEvent.pointerDown` would drop `pointerType` (see
// holdPreview.test.tsx).
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

const originalRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const id = (this as HTMLElement).dataset?.cardId;
    const n = id ? Number(id.replace('card-', '')) : NaN;
    const left = Number.isNaN(n) ? 0 : n * 200;
    const width = Number.isNaN(n) ? 0 : 100;
    const height = Number.isNaN(n) ? 0 : 140;
    return { left, top: 0, right: left + width, bottom: height, width, height, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

const mouse = { pointerId: 1, pointerType: 'mouse', button: 0 };

function drag(from: Element, points: Array<[number, number]>, init: Record<string, unknown> = {}) {
  const [[x0, y0], ...rest] = points;
  fireEvent.pointerDown(from, { ...mouse, ...init, clientX: x0, clientY: y0 });
  for (const [x, y] of rest) act(() => void fireEvent.pointerMove(window, { ...mouse, clientX: x, clientY: y }));
}

function release(target: Element, [x, y]: [number, number]) {
  act(() => void fireEvent.pointerUp(window, { ...mouse, clientX: x, clientY: y }));
  fireEvent.click(target);
}

function Panel({ initial = [] as string[], onClose = () => {} }) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <>
      <div data-testid="selected">{selected.join(',')}</div>
      <CardListPanel
        location="core"
        cards={cards}
        onClose={onClose}
        selectedIds={selected}
        onToggleSelect={(id) => setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]))}
        onSelectIds={setSelected}
      />
    </>
  );
}

const selected = () => screen.getByTestId('selected').textContent;

describe('Practice table: a mouse drag draws a box that selects cards (#993)', () => {
  it('selects the cards the box touches, follows the box, and does not close the panel', () => {
    const onClose = jest.fn();
    render(<Panel onClose={onClose} />);
    const backdrop = screen.getByRole('button', { name: 'Close core' });

    drag(backdrop, [[-50, 200], [250, 100]]);
    expect(screen.getByTestId('box-select')).toBeInTheDocument();
    expect(selected()).toBe('card-0,card-1');

    act(() => void fireEvent.pointerMove(window, { ...mouse, clientX: 50, clientY: 100 }));
    expect(selected()).toBe('card-0');

    release(backdrop, [50, 100]);
    expect(screen.queryByTestId('box-select')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(selected()).toBe('card-0');
  });

  it('starts a box on the empty space of the grid too', () => {
    render(<Panel />);
    drag(screen.getByTestId('card-list-panel-core'), [[150, 200], [450, 10]]);
    expect(selected()).toBe('card-1,card-2');
  });

  it('replaces the selection, and adds to it with Shift held', () => {
    const { unmount } = render(<Panel initial={['card-2']} />);
    drag(screen.getByRole('button', { name: 'Close core' }), [[-50, 200], [50, 100]]);
    expect(selected()).toBe('card-0');
    unmount();

    render(<Panel initial={['card-2']} />);
    drag(screen.getByRole('button', { name: 'Close core' }), [[-50, 200], [50, 100]], { shiftKey: true });
    expect(selected()).toBe('card-2,card-0');
  });

  it('a mouse press that does not move still closes the panel, and a touch draws no box', () => {
    const onClose = jest.fn();
    render(<Panel onClose={onClose} />);
    const backdrop = screen.getByRole('button', { name: 'Close core' });

    drag(backdrop, [[-50, 200], [-48, 201]]);
    expect(screen.queryByTestId('box-select')).toBeNull();
    release(backdrop, [-48, 201]);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(backdrop, { pointerId: 2, pointerType: 'touch', button: 0, clientX: -50, clientY: 200 });
    act(() => void fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 100 }));
    expect(screen.queryByTestId('box-select')).toBeNull();
    expect(selected()).toBe('');
  });

  it('selects the cards of the open hand from its backdrop', () => {
    function Hand() {
      const [ids, setIds] = useState<string[]>([]);
      return (
        <>
          <div data-testid="selected">{ids.join(',')}</div>
          <CardHand instances={cards} open onOpen={() => {}} onClose={() => {}} selectedIds={ids} onSelectIds={setIds} />
        </>
      );
    }
    render(<Hand />);
    drag(screen.getByRole('button', { name: 'Close hand' }), [[150, 200], [450, 10]]);
    expect(selected()).toBe('card-1,card-2');
  });
});

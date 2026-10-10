let mockOverId: string | null = null;
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: ({ id }: { id: string }) => ({ setNodeRef: () => {}, isOver: id === mockOverId }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import FlatCardRow from '../../../app/decks/practice/FlatCardRow';
import { DraggedCardTypeProvider } from '../../../app/decks/practice/DraggedCardTypeContext';
import { NO_PLACE_ON_HOLD, PlaceOnHold, PlaceOnHoldProvider } from '../../../app/decks/practice/PlaceOnHoldContext';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { FLAT_ROW_GAP, UNMEASURED_FLAT_ROW_WIDTHS, flatRowWidths } from '../../../app/decks/practice/flatRowWidths';

const card = (id: string, name: string): CardInstance => ({
  id,
  card: { name, imagefile: id, type: 'event' },
  face: 'up',
});

// #831: a drop on a card in the core or the brig places the dragged card on it. The card must stay
// under the pointer when the row grows for the drag, and it must show that it is the target.
describe('FlatCardRow', () => {
  const renderRow = (zone: 'core' | 'brig', draggedType: string | null, hold: PlaceOnHold = NO_PLACE_ON_HOLD) =>
    render(
      <DraggedCardTypeProvider value={draggedType}>
        <PlaceOnHoldProvider value={hold}>
        <FlatCardRow
          zone={zone}
          label={zone}
          cards={[card('card-1', 'Host'), card('card-2', 'Other')]}
          maxWidth={200}
          maxOffset={40}
          onOpen={() => {}}
          onOpenPlacedOn={() => {}}
        />
        </PlaceOnHoldProvider>
      </DraggedCardTypeProvider>
    );
  const host = () => document.querySelector('[data-zone="on-card-1"]') as HTMLElement;
  const row = (zone: string) => document.querySelector(`[data-zone="${zone}"]`) as HTMLElement;

  afterEach(() => {
    mockOverId = null;
  });

  // #1029: a drop on a card that the hold has not armed adds the dragged card to the zone, so the
  // zone shows the highlight, and the card shows none.
  it.each(['core', 'brig'] as const)('highlights the %s, and not the card, while the drag is over a card it has not held', (zone) => {
    mockOverId = 'on-card-1';
    renderRow(zone, 'personnel', { overTargetId: 'card-1', armedTargetId: null });

    expect(row(zone)).toHaveAttribute('data-highlight', 'over');
    expect(host()).not.toHaveAttribute('data-highlight');
    expect(document.querySelector('[data-zone="on-card-2"]')).not.toHaveAttribute('data-highlight');
  });

  it.each(['core', 'brig'] as const)('highlights a %s card the drag has held over, and not the row', (zone) => {
    mockOverId = 'on-card-1';
    renderRow(zone, 'personnel', { overTargetId: 'card-1', armedTargetId: 'card-1' });

    expect(host()).toHaveAttribute('data-highlight', 'over');
    expect(host()).toHaveClass('ring-2', 'ring-accent');
    expect(row(zone)).not.toHaveAttribute('data-highlight', 'over');
    expect(document.querySelector('[data-zone="on-card-2"]')).not.toHaveAttribute('data-highlight');
  });

  it('shows no highlight on a card when nothing is dragged', () => {
    renderRow('core', null);

    expect(host()).not.toHaveAttribute('data-highlight');
  });

  // The table's bottom row is `items-end`, so the row grows upward during a drag. A card anchored
  // at the bottom edge stays where it was; a card at the top edge jumps up out from under the
  // pointer.
  it.each([null, 'event'])('anchors each card at the row bottom (dragged type %s)', (draggedType) => {
    renderRow('core', draggedType);

    for (const id of ['card-1', 'card-2']) {
      const slot = document.querySelector(`[data-zone="on-${id}"]`)!.parentElement!;
      expect(slot).toHaveClass('bottom-0');
      expect(slot).not.toHaveClass('top-0');
    }
  });

  // #926: the core and the brig show the whole card, frame and all, not the art crop.
  it.each(['core', 'brig'] as const)('shows the whole card in the %s, not the art crop', (zone) => {
    renderRow(zone, null);

    const img = document.querySelector('[data-card-id="card-1"] img') as HTMLElement;
    expect(img).toHaveClass('object-contain');
    expect(img).not.toHaveClass('object-cover');
    // 34 px wide at the card image's 120x167 ratio.
    expect(img.parentElement!.parentElement).toHaveStyle({ height: '47px' });
    expect(row(zone)).toHaveStyle({ height: '47px' });
  });
});

// #1029: the core and the brig grow into the free space of the bottom row, and overlap past it.
describe('flatRowWidths', () => {
  it('stands in the bounds of #927 and #928 until the space is measured', () => {
    expect(flatRowWidths(0, 4, 3)).toEqual(UNMEASURED_FLAT_ROW_WIDTHS);
  });

  it('lets both rows grow with no extra overlap when they fit', () => {
    const { core, brig } = flatRowWidths(400, 4, 3);
    // 4 core cards take 142px and 3 brig cards 106px, with no overlap past the usual gap.
    expect(core).toBeGreaterThanOrEqual(142);
    expect(brig).toBeGreaterThanOrEqual(106);
  });

  it('splits a small space between the two rows, so they fit it', () => {
    // About the space the 568 px table leaves the two rows.
    const { core, brig } = flatRowWidths(182, 4, 3);
    expect(core + brig + FLAT_ROW_GAP).toBeLessThanOrEqual(182);
    expect(core).toBeGreaterThan(brig);
  });
});

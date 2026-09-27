let mockOverId: string | null = null;
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: ({ id }: { id: string }) => ({ setNodeRef: () => {}, isOver: id === mockOverId }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import FlatCardRow from '../../../app/decks/practice/FlatCardRow';
import { DraggedCardTypeProvider } from '../../../app/decks/practice/DraggedCardTypeContext';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const card = (id: string, name: string): CardInstance => ({
  id,
  card: { name, imagefile: id, type: 'event' },
  face: 'up',
});

// #831: a drop on a card in the core or the brig places the dragged card on it. The card must stay
// under the pointer when the row grows for the drag, and it must show that it is the target.
describe('FlatCardRow', () => {
  const renderRow = (zone: 'core' | 'brig', draggedType: string | null) =>
    render(
      <DraggedCardTypeProvider value={draggedType}>
        <FlatCardRow
          zone={zone}
          label={zone}
          cards={[card('card-1', 'Host'), card('card-2', 'Other')]}
          maxWidth={200}
          maxOffset={40}
          onOpen={() => {}}
          onOpenPlacedOn={() => {}}
        />
      </DraggedCardTypeProvider>
    );
  const host = () => document.querySelector('[data-zone="on-card-1"]') as HTMLElement;
  const row = (zone: string) => document.querySelector(`[data-zone="${zone}"]`) as HTMLElement;

  afterEach(() => {
    mockOverId = null;
  });

  it.each(['core', 'brig'] as const)('highlights a %s card the drag is over, and not the row', (zone) => {
    mockOverId = 'on-card-1';
    renderRow(zone, 'personnel');

    expect(host()).toHaveAttribute('data-highlight', 'over');
    expect(host()).toHaveClass('ring-2', 'ring-accent');
    expect(row(zone)).not.toHaveAttribute('data-highlight', 'over');
    expect(document.querySelector('[data-zone="on-card-2"]')).toHaveAttribute('data-highlight', 'valid');
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
});

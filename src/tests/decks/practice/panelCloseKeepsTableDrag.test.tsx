// #913: a card in an open card list panel is also on the table, and both copies join
// `useDraggable`. With one shared id, the panel copy took the registration over, and its unmount
// deleted it, so the card on the table never started a drag once the panel closed. The panel copy
// now takes its own id (`panelDragId.ts`). This test uses the real dnd-kit, not a mock, because the
// bug lives in dnd-kit's registry.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DndContext, DragStartEvent, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import TableCard from '../../../app/decks/practice/TableCard';
import { cardIdOfDraggable, panelDraggableId } from '../../../app/decks/practice/panelDragId';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const card = {
  id: 'card-4',
  stopped: false,
  face: 'up',
  card: {
    collectorsinfo: '1U04',
    originalName: 'Card 4',
    type: 'personnel',
    name: 'card 4',
    imagefile: 'card_4',
  },
} as unknown as CardInstance;

function Table({ panelOpen, onDragStart }: { panelOpen: boolean; onDragStart: (e: DragStartEvent) => void }) {
  const sensors = useSensors(useSensor(KeyboardSensor));
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart}>
      <TableCard instance={card} draggable holdable={false} />
      {panelOpen && (
        <CardListPanel
          location="core"
          cards={[card]}
          onClose={() => {}}
          selectedIds={[]}
          onToggleSelect={() => {}}
        />
      )}
    </DndContext>
  );
}

describe('Practice draw: a card on the table stays draggable after its panel closes (#913)', () => {
  it('maps a panel draggable id back to the card id', () => {
    expect(cardIdOfDraggable(panelDraggableId('card-4'))).toBe('card-4');
    expect(cardIdOfDraggable('card-4')).toBe('card-4');
  });

  it('starts a drag of the table card after the panel opened and closed', () => {
    const onDragStart = jest.fn();
    const { rerender } = render(<Table panelOpen onDragStart={onDragStart} />);
    expect(document.body.querySelectorAll('[data-card-id="card-4"]')).toHaveLength(2);

    rerender(<Table panelOpen={false} onDragStart={onDragStart} />);
    const buttons = screen.getAllByRole('button', { name: 'Card 4' });
    expect(buttons).toHaveLength(1);

    const button = buttons[0];
    button.focus();
    fireEvent.keyDown(button, { code: 'Space', key: ' ' });

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(String(onDragStart.mock.calls[0][0].active.id)).toBe('card-4');
  });
});

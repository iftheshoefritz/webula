jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import TableCard, { cardBorderWidth } from '../../../app/decks/practice/TableCard';
import CardPreview from '../../../app/decks/practice/CardPreview';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

// #983: a card image has white outside its rounded corners, so a practice table card draws the
// black card border of the deck builder over the edge of the image.
const instance: CardInstance = {
  id: 'c1',
  card: { name: 'Moab IV', imagefile: 'moab', backimagefile: '' },
  face: 'up',
};

describe('the black card border (#983)', () => {
  it('scales with the card width and is never thinner than 2 px', () => {
    expect(cardBorderWidth(240)).toBe(6);
    expect(cardBorderWidth(34)).toBe(2);
  });

  it('draws over the edge of a table card image', () => {
    render(<TableCard instance={instance} />);
    const img = screen.getByAltText('Moab IV');
    expect(img.style.outline).toBe('2px solid black');
    expect(img.style.outlineOffset).toBe('-2px');
  });

  it('draws over the edge of the large preview', () => {
    render(<CardPreview instance={instance} />);
    expect(screen.getByTestId('card-preview-enlarged').style.outline).toMatch(/^\d+px solid black$/);
  });
});

jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import TableCard, { cardBorderWidth, missionCropImage } from '../../../app/decks/practice/TableCard';
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

// #1175: the image prints a black frame 17 px wide on its 357 px width, so the touch crop of a mission
// draws the image larger and shifted, to cut the whole printed frame off at the box's edges, and draws
// the border around the outside of the box.
describe('the trimmed frame of a mission crop (#1175)', () => {
  it.each([72, 84, 97, 105, 173])('cuts the printed frame off at the box edges at a width of %s', (width) => {
    const { imageWidth, shift } = missionCropImage(width);
    const frame = (imageWidth * 17) / 357;
    // The top and the left: the frame ends at the box's edge.
    expect(frame - shift).toBeCloseTo(0, 5);
    // The right: the image's right edge, less its frame, ends at the box's edge.
    expect(imageWidth - shift - frame).toBeCloseTo(width, 5);
    expect(imageWidth).toBeGreaterThan(width);
  });

  it('draws the image wider than the box and shifted, with the border outside the box', () => {
    render(<TableCard instance={instance} width={105} artHeight={93} trimFrame />);
    const img = screen.getByAltText('Moab IV');
    const { imageWidth, shift } = missionCropImage(105);
    expect(img.style.width).toBe(`${imageWidth}px`);
    expect(img.style.left).toBe(`${-shift}px`);
    expect(img.style.top).toBe(`${-shift}px`);
    expect(img.style.outline).toBe('');
    const border = screen.getByTestId('card-border');
    expect(border.style.border).toBe('3px solid black');
    expect(border.style.inset).toBe('-3px');
    // The ring is outside the box that clips the image, so it covers none of it.
    expect(border.parentElement).not.toBe(img.parentElement);
  });

  it('draws the whole card as before', () => {
    render(<TableCard instance={instance} width={105} uncropped trimFrame />);
    const img = screen.getByAltText('Moab IV');
    expect(img.style.outline).toBe('3px solid black');
    expect(img.style.width).toBe('');
    expect(screen.queryByTestId('card-border')).toBeNull();
  });
});

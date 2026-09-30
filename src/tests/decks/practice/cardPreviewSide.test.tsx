import React from 'react';
import { render, screen } from '@testing-library/react';
import CardPreview, { FACE_DOWN_LABEL } from '../../../app/decks/practice/CardPreview';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

// #879: the preview takes the edge `side` names, and the "Face down" badge takes the same edge.
const faceDown: CardInstance = {
  id: 'c0',
  card: { name: 'Tricorder', imagefile: 'tricorder' },
  face: 'down',
};

describe('CardPreview side (#879)', () => {
  it.each([
    ['right', 'right-4', 'left-4'],
    ['left', 'left-4', 'right-4'],
  ] as const)('side %s puts the image and the "Face down" badge on the %s edge', (side, edge, other) => {
    render(<CardPreview instance={faceDown} side={side} />);
    const image = screen.getByTestId('card-preview-enlarged');
    const badge = screen.getByText(FACE_DOWN_LABEL);
    expect(image).toHaveClass(edge);
    expect(image).not.toHaveClass(other);
    expect(badge).toHaveClass(edge);
    expect(badge).not.toHaveClass(other);
  });

  it('keeps the right edge by default', () => {
    render(<CardPreview instance={faceDown} />);
    expect(screen.getByTestId('card-preview-enlarged')).toHaveClass('right-4');
  });

  // #964: an away team card's preview shows no "Face down" badge.
  it('shows no badge when markFaceDown is false', () => {
    render(<CardPreview instance={faceDown} markFaceDown={false} />);
    expect(screen.getByTestId('card-preview-enlarged')).toBeInTheDocument();
    expect(screen.queryByText(FACE_DOWN_LABEL)).toBeNull();
  });
});

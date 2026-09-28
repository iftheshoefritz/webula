jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MissionRow from '../../../app/decks/practice/MissionRow';
import TableCard from '../../../app/decks/practice/TableCard';
import CardPreview from '../../../app/decks/practice/CardPreview';
import { CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';
import { withBackImageFiles } from '../../../app/decks/deckBuilderUtils';

// #765: a double-sided mission turns over to its back face, a card image of its own.
const doubleSided = (flipped = false): CardInstance => ({
  id: 'm0',
  card: { name: 'Ceti Alpha V', imagefile: 'STVE-EN29035ab', backimagefile: 'STVE-EN29035R' },
  face: 'up',
  ...(flipped ? { flipped: true } : {}),
});

const singleSided: CardInstance = {
  id: 'm1',
  card: { name: 'Moab IV', imagefile: 'moab', backimagefile: '' },
  face: 'up',
};

const slot = (mission: CardInstance): MissionSlot => ({ mission, ships: [], awayTeam: [], underMission: [] });

const renderRow = (missions: MissionSlot[], onFlipMission = jest.fn()) =>
  render(
    <MissionRow
      missions={missions}
      onOpenPile={() => {}}
      onShipClick={() => {}}
      onOpenShipRow={() => {}}
      onOpenPlacedOn={() => {}}
      onFlipMission={onFlipMission}
    />
  );

describe('the Flip button of a double-sided mission (#765)', () => {
  it('shows only for a mission with a back image', () => {
    renderRow([slot(doubleSided()), slot(singleSided)]);

    expect(screen.getByRole('button', { name: 'Flip Ceti Alpha V to its back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Flip Moab IV/ })).toBeNull();
  });

  it('names the front as the side it turns to when the back is up', () => {
    renderRow([slot(doubleSided(true))]);

    expect(screen.getByRole('button', { name: 'Flip Ceti Alpha V to its front' })).toBeInTheDocument();
  });

  it('calls the callback with the mission id, and is not a drop target', () => {
    const onFlipMission = jest.fn();
    renderRow([slot(doubleSided())], onFlipMission);

    const button = screen.getByRole('button', { name: 'Flip Ceti Alpha V to its back' });
    expect(button).not.toHaveAttribute('data-zone');
    expect(button.closest('[data-card-id]')).toBeNull();
    fireEvent.click(button);
    expect(onFlipMission).toHaveBeenCalledWith('m0');
  });
});

describe('the image of a flipped mission (#765)', () => {
  it('TableCard shows the back image of a flipped mission and the front otherwise', () => {
    const { rerender } = render(<TableCard instance={doubleSided()} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/cardimages/STVE-EN29035ab.jpg');

    rerender(<TableCard instance={doubleSided(true)} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/cardimages/STVE-EN29035R.jpg');
  });

  it('TableCard still shows the card back for a face-down card', () => {
    render(<TableCard instance={{ ...doubleSided(true), face: 'down' }} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/cardimages/cardback.jpg');
  });

  it('CardPreview shows the back image of a flipped mission and the front otherwise', () => {
    const { rerender } = render(<CardPreview instance={doubleSided()} />);
    expect(screen.getByTestId('card-preview-enlarged')).toHaveAttribute('src', '/cardimages/STVE-EN29035ab.jpg');

    rerender(<CardPreview instance={doubleSided(true)} />);
    expect(screen.getByTestId('card-preview-enlarged')).toHaveAttribute('src', '/cardimages/STVE-EN29035R.jpg');
  });
});

describe('withBackImageFiles (#765)', () => {
  const data = [
    { name: 'ceti alpha v', imagefile: 'STVE-EN29035ab', backimagefile: 'STVE-EN29035R' },
    { name: 'moab iv', imagefile: 'moab', backimagefile: '' },
  ];

  it('fills in the back image of a row saved without one', () => {
    expect(withBackImageFiles([{ name: 'ceti alpha v', imagefile: 'STVE-EN29035ab' }], data)).toEqual([
      { name: 'ceti alpha v', imagefile: 'STVE-EN29035ab', backimagefile: 'STVE-EN29035R' },
    ]);
  });

  it('gives a single-sided or unknown row an empty back image', () => {
    const rows = withBackImageFiles([{ imagefile: 'moab' }, { imagefile: 'unknown' }], data);
    expect(rows.map((r) => r.backimagefile)).toEqual(['', '']);
  });

  it('leaves a row that already has the field unchanged', () => {
    const row = { imagefile: 'STVE-EN29035ab', backimagefile: 'STVE-EN29035R' };
    expect(withBackImageFiles([row], [])[0]).toBe(row);
  });
});

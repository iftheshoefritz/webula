// #986: the card list panel's grid used the same near-black shade as the dimmed table behind it,
// so the edge of the panel did not show. #1016: the grid keeps its old `bg-black/70` background,
// and a border in the raised shade, `border-bg-raised`, marks its edge.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDndContext: () => ({ active: null, over: null }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import CardListPanel, { PANEL_SURFACE_CLASSNAME } from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number, type = 'equipment'): CardInstance =>
  ({
    id: `card-${n}`,
    stopped: false,
    card: {
      collectorsinfo: `1U0${n}`,
      originalName: `Card ${n}`,
      type,
      name: `card ${n}`,
      imagefile: `card_${n}`,
    },
  }) as unknown as CardInstance;

const renderPanel = (location: 'core' | 'dilemmaStack', type?: string) =>
  render(
    <CardListPanel
      location={location}
      cards={[makeCard(1, type), makeCard(2, type)]}
      onClose={() => {}}
      selectedIds={[]}
      onToggleSelect={() => {}}
    />
  );

const expectPanelSurface = (className: string) => {
  const classes = className.split(/\s+/);
  expect(classes).toContain('bg-black/70');
  expect(classes).toContain('border');
  expect(classes).toContain('border-bg-raised');
  expect(classes).not.toContain('bg-bg-raised');
};

describe('Practice table: the card list panel has a border in the raised shade (#986, #1016)', () => {
  it('gives the grid the old dark background and a raised-shade border', () => {
    renderPanel('core');

    expect(PANEL_SURFACE_CLASSNAME).toBe('bg-black/70 border border-bg-raised');
    expectPanelSurface(screen.getByTestId('card-list-panel-core').className);
  });

  it('gives the dilemma stack grid the same background and border', () => {
    renderPanel('dilemmaStack', 'dilemma');

    expectPanelSurface(screen.getByTestId('card-list-panel-dilemmaStack').className);
  });

  it('keeps the border off the backdrop behind the grid', () => {
    renderPanel('core');

    const backdrop = screen.getByRole('button', { name: /close/i });
    expect(backdrop.className).not.toContain('border-bg-raised');
  });
});

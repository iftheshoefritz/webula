// #986: the card list panel has no border, and its grid used the same near-black shade as the
// dimmed table behind it, so the edge of the panel did not show. The grid now takes its own
// lighter shade, `bg-bg-raised`, and the dimming backdrop keeps its own.
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

describe('Practice table: the card list panel has its own shade (#986)', () => {
  it('gives the grid the raised shade and no border', () => {
    renderPanel('core');

    const grid = screen.getByTestId('card-list-panel-core');
    expect(PANEL_SURFACE_CLASSNAME).toBe('bg-bg-raised');
    expect(grid.className.split(/\s+/)).toContain('bg-bg-raised');
    expect(grid.className).not.toMatch(/\bbg-black\//);
    expect(grid.className).not.toMatch(/(^|\s)border(\s|-)/);
  });

  it('gives the dilemma stack grid the same shade', () => {
    renderPanel('dilemmaStack', 'dilemma');

    const grid = screen.getByTestId('card-list-panel-dilemmaStack');
    expect(grid.className.split(/\s+/)).toContain('bg-bg-raised');
  });

  it('keeps a different shade on the backdrop behind the grid', () => {
    renderPanel('core');

    const backdrop = screen.getByRole('button', { name: /close/i });
    expect(backdrop.className).not.toContain('bg-bg-raised');
  });
});

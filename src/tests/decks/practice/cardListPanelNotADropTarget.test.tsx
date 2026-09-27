// #861: `AGENTS.md` says that only a real drop target carries a `data-zone`. The grid of the card
// list panel broke that rule: it carried `data-zone="card-list-panel-<location>"` and it has no
// `useDroppable`. `scripts/practice_drag.sh` prints the nearest `data-zone` ancestor of the dragged
// card, so a drag that aimed at the grid printed the panel name for a card that never moved, and it
// misled the browser check of #856 (see the correction in #860). The name now sits in
// `data-testid`. This test holds that split.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number): CardInstance =>
  ({
    id: `card-${n}`,
    stopped: false,
    card: {
      collectorsinfo: `1U0${n}`,
      originalName: `Card ${n}`,
      type: 'equipment',
      name: `card ${n}`,
      imagefile: `card_${n}`,
    },
  }) as unknown as CardInstance;

const renderPanel = () =>
  render(
    <CardListPanel
      location="core"
      cards={[makeCard(1), makeCard(2)]}
      onClose={() => {}}
      selectedIds={[]}
      onToggleSelect={() => {}}
      onSetStopped={() => {}}
    />
  );

describe('Practice draw: the card list panel is a selector, not a drop target (#861)', () => {
  it('names the grid with a data-testid', () => {
    renderPanel();

    const grid = document.body.querySelector('[data-testid="card-list-panel-core"]');
    expect(grid).not.toBeNull();
  });

  it('gives no data-zone to the grid, because the grid takes no drop', () => {
    renderPanel();

    const grid = document.body.querySelector('[data-testid="card-list-panel-core"]') as HTMLElement;
    expect(grid.hasAttribute('data-zone')).toBe(false);
    expect(document.body.querySelector('[data-zone^="card-list-panel-"]')).toBeNull();
  });
});

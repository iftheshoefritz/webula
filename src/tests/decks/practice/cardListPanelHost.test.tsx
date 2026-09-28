// #894: the host card of a card list panel sat in its own section above the grid and shrank with
// the grid on a short viewport, until it could not be read. It now sits to the right of the grid,
// in one row with it, and keeps the size of a panel card. jsdom does no layout, so this checks the
// order of the elements and the sizes the host is given.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import CardListPanel, { PanelLocation } from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number, type = 'personnel'): CardInstance =>
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

const cases: [PanelLocation, string][] = [
  ['crew', 'card-list-panel-crew-ship'],
  ['on', 'card-list-panel-on-host'],
];

describe('Practice draw: a card list panel shows its host to the right of the grid (#894)', () => {
  it.each(cases)('puts the %s host after the grid, in one row with it', (location, hostTestId) => {
    render(
      <CardListPanel
        location={location}
        cards={[makeCard(1), makeCard(2)]}
        host={makeCard(9, 'ship')}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        cardWidth={108}
        cardHeight={150}
      />
    );

    const grid = screen.getByTestId(`card-list-panel-${location}`);
    const host = screen.getByTestId(hostTestId);
    expect(host.parentElement).toBe(grid.parentElement);
    expect(grid.parentElement!.className).toMatch(/flex-row/);
    expect(grid.nextElementSibling).toBe(host);

    // The host does not shrink with the grid: it keeps the size of a panel card.
    expect(host.className).toMatch(/shrink-0/);
    const img = host.querySelector('img[alt="card 9"]') as HTMLImageElement;
    expect(img.style.width).toBe('108px');
    expect(img.style.height).toBe('150px');
    expect(img.style.maxHeight).toBe('');
  });
});

// #828: a card list panel anchors its bottom edge just above the bottom row and grows upward,
// instead of anchoring its top and leaving an empty band above the bottom row. jsdom has no
// layout, so these check the structure: the column justifies to the end, and the measured bottom
// inset reaches the inset box while the top stays `VIEWER_TOP_INSET`.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import CardListPanel, { PanelLocation } from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { panelBottomInset } from '../../../app/decks/practice/panelBottomInset';

const makeCard = (n: number): CardInstance =>
  ({
    id: `card-${n}`,
    stopped: false,
    card: { collectorsinfo: `1U0${n}`, originalName: `Card ${n}`, type: 'dilemma', name: `card ${n}`, imagefile: `card_${n}` },
  }) as unknown as CardInstance;

const cards = [makeCard(1), makeCard(2)];

function insetBoxFor(location: PanelLocation, bottomInset?: number): HTMLElement {
  render(
    <CardListPanel
      location={location}
      cards={cards}
      onClose={() => {}}
      selectedIds={[]}
      onToggleSelect={() => {}}
      bottomInset={bottomInset}
    />
  );
  const grid = document.body.querySelector(`[data-testid="card-list-panel-${location}"]`) as HTMLElement;
  expect(grid).not.toBeNull();
  // The grid sits in the panel, and the panel in the inset box.
  return grid.parentElement!.parentElement as HTMLElement;
}

describe('Practice draw: a card list panel anchors its bottom just above the bottom row (#828)', () => {
  it.each<PanelLocation>(['core', 'dilemmaStack'])('justifies the %s panel to the end of its column', (location) => {
    const box = insetBoxFor(location);
    expect(box.className).toMatch(/\bflex-col\b/);
    expect(box.className).toMatch(/\bjustify-end\b/);
  });

  it('puts a given bottom inset on the inset box and keeps the top at VIEWER_TOP_INSET', () => {
    const box = insetBoxFor('drawDeck', 120);
    expect(box.style.bottom).toBe('120px');
    expect(box.style.top).toBe('8px');
    expect(box.style.left).toBe('8px');
    expect(box.style.right).toBe('8px');
  });

  it('keeps the old symmetric inset with no bottom inset given', () => {
    const box = insetBoxFor('discard');
    expect(box.style.bottom).toBe('8px');
    expect(box.style.top).toBe('8px');
  });
});

describe('panelBottomInset (#828)', () => {
  it('is the distance from the bottom of the game layer to the top of the bottom row, plus a gap', () => {
    expect(panelBottomInset(320, 200)).toBe(128);
  });

  it('never drops below VIEWER_TOP_INSET', () => {
    expect(panelBottomInset(0, 0)).toBe(8);
  });
});

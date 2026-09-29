// #932: a touch device draws an overlay scrollbar that shows only while a finger moves, so a card
// list panel grid that overflows looked like it held one row of cards. An element that overflows
// takes a scrollbar that keeps its place. jsdom reports 0 for both heights, so the component
// always sees a grid that fits: this tests the class for each value of `gridScrolls`, and the
// browser checks the real behaviour.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import CardListPanel, { panelScrollClassName } from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number): CardInstance =>
  ({
    id: `card-${n}`,
    stopped: false,
    card: { collectorsinfo: `1U0${n}`, originalName: `Card ${n}`, type: 'equipment', name: `card ${n}`, imagefile: `card_${n}` },
  }) as unknown as CardInstance;

describe('A card list panel that overflows always shows its scrollbar (#932)', () => {
  it('gives an overflowing element a scrollbar that keeps its place', () => {
    const classes = panelScrollClassName(true).split(' ');
    expect(classes).toEqual(expect.arrayContaining(['overflow-y-scroll', 'scrollbar-visible']));
    expect(classes).not.toContain('overflow-y-auto');
  });

  it('gives an element that fits no scrollbar', () => {
    const classes = panelScrollClassName(false).split(' ');
    expect(classes).toContain('overflow-y-auto');
    expect(classes).not.toContain('overflow-y-scroll');
    expect(classes).not.toContain('scrollbar-visible');
  });

  it('shows no scrollbar on a grid that fits', () => {
    render(
      <CardListPanel location="drawDeck" cards={[makeCard(0), makeCard(1)]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />
    );
    const grid = document.body.querySelector('[data-testid="card-list-panel-drawDeck"]') as HTMLElement;
    expect(grid.className).toMatch(/overflow-y-auto/);
    expect(grid.className).not.toMatch(/scrollbar-visible/);
  });

  it('leaves the dilemma stack popup overflow-hidden', () => {
    render(
      <CardListPanel location="dilemmaStack" cards={[makeCard(0), makeCard(1)]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />
    );
    const grid = document.body.querySelector('[data-testid="card-list-panel-dilemmaStack"]') as HTMLElement;
    expect(grid.className).toMatch(/overflow-hidden/);
    expect(grid.className).not.toMatch(/scrollbar-visible/);
  });
});

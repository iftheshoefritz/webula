// #956: during a reorder drag in the dilemma stack's panel, one accent bar marks where the drop
// puts the card. dnd-kit is mocked so each test sets the drag's `active` and `over` directly.
let mockActive: { id: string } | null = null;
let mockOver: { id: string } | null = null;
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDndContext: () => ({ active: mockActive, over: mockOver }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import CardListPanel, { PanelLocation } from '../../../app/decks/practice/CardListPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { offsetFor } from '../../../app/decks/practice/overlapOffset';

const makeCard = (n: number): CardInstance =>
  ({
    id: `d${n}`,
    stopped: false,
    face: 'down',
    card: { collectorsinfo: `1R${n}`, originalName: `Dilemma ${n}`, type: 'dilemma', name: `dilemma ${n}`, imagefile: `d_${n}` },
  }) as unknown as CardInstance;

const cards = [0, 1, 2, 3].map(makeCard);

const renderPanel = (location: PanelLocation = 'dilemmaStack') =>
  render(
    <CardListPanel location={location} cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />
  );

const indicator = () => document.body.querySelector('[data-testid="dilemma-stack-insert-indicator"]') as HTMLElement | null;

describe('Practice draw: the dilemma stack panel marks where a reorder drop lands (#956)', () => {
  afterEach(() => {
    mockActive = null;
    mockOver = null;
  });

  it('marks the place after the over card on a move to the right', () => {
    mockActive = { id: 'panel:d0' };
    mockOver = { id: 'd2' };
    renderPanel();

    expect(document.body.querySelectorAll('[data-testid="dilemma-stack-insert-indicator"]')).toHaveLength(1);
    expect(indicator()!.getAttribute('data-slot')).toBe('2');
    // The bar sits on the left edge of card 3, the one after the over card.
    const offset = parseFloat((document.querySelector('[data-card-id="d1"]')!.closest('.absolute') as HTMLElement).style.left);
    expect(parseFloat(indicator()!.style.left)).toBeCloseTo(3 * offset);
  });

  it('marks the place before the over card on a move to the left', () => {
    mockActive = { id: 'panel:d3' };
    mockOver = { id: 'd1' };
    renderPanel();

    expect(indicator()!.getAttribute('data-slot')).toBe('1');
  });

  it('marks the right end of the row on a move to the last card', () => {
    mockActive = { id: 'panel:d0' };
    mockOver = { id: 'd3' };
    renderPanel();

    // jsdom measures 0, so the row falls back to cards edge to edge (`OverlapRow`).
    const cardWidth = parseFloat((document.querySelector('[data-zone="d0"]') as HTMLElement).style.width);
    const offset = offsetFor(4, cardWidth, cardWidth * 4, cardWidth);
    expect(parseFloat(indicator()!.style.left)).toBeCloseTo(3 * offset + cardWidth);
  });

  it('is not a drop target and takes no pointer events', () => {
    mockActive = { id: 'panel:d0' };
    mockOver = { id: 'd2' };
    renderPanel();

    expect(indicator()!.hasAttribute('data-zone')).toBe(false);
    expect(indicator()!.className).toContain('pointer-events-none');
  });

  it('shows nothing with no drag', () => {
    renderPanel();
    expect(indicator()).toBeNull();
  });

  it('shows nothing with no over', () => {
    mockActive = { id: 'panel:d0' };
    renderPanel();
    expect(indicator()).toBeNull();
  });

  it('shows nothing over the dragged card itself', () => {
    mockActive = { id: 'panel:d1' };
    mockOver = { id: 'd1' };
    renderPanel();
    expect(indicator()).toBeNull();
  });

  it('shows nothing when the pointer is outside the panel', () => {
    mockActive = { id: 'panel:d1' };
    mockOver = { id: 'discard' };
    renderPanel();
    expect(indicator()).toBeNull();
  });

  it('leaves every card where it was while the bar shows', () => {
    renderPanel();
    const lefts = () => cards.map((c) => (document.querySelector(`[data-card-id="${c.id}"]`)!.closest('.absolute') as HTMLElement).style.left);
    const before = lefts();
    document.body.innerHTML = '';
    mockActive = { id: 'panel:d0' };
    mockOver = { id: 'd2' };
    renderPanel();
    expect(indicator()).not.toBeNull();
    expect(lefts()).toEqual(before);
  });

  it('shows nothing in any other panel', () => {
    mockActive = { id: 'panel:d0' };
    mockOver = { id: 'd2' };
    renderPanel('core');
    expect(indicator()).toBeNull();
  });
});

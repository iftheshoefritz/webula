// #788: inside a pile panel whose grid scrolls, a touch that moved up or down picked the card up,
// because the sensor started a drag after 8 px in any direction. The direction rule decides at
// the same 8 px: mostly vertical scrolls, mostly sideways drags. This file checks the rule and the
// `touch-action` the panel gives its cards; `panelScrollSensor.test.tsx` runs the sensor itself.
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import PilePanel from '../../../app/decks/practice/PilePanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { PANEL_SCROLLS_ATTRIBUTE, panelGestureFor } from '../../../app/decks/practice/panelGesture';

const makeCard = (n: number): CardInstance =>
  ({
    id: `card-${n}`,
    stopped: false,
    card: { collectorsinfo: `1U0${n}`, originalName: `Card ${n}`, type: 'equipment', name: `card ${n}`, imagefile: `card_${n}` },
  }) as unknown as CardInstance;

const cards = Array.from({ length: 30 }, (_, i) => makeCard(i));

const renderPanel = () =>
  render(
    <PilePanel
      zone="pile"
      cards={cards}
      onClose={() => {}}
      selectedIds={[]}
      onToggleSelect={() => {}}
      onShuffle={() => {}}
      onSetStopped={() => {}}
    />
  );

describe('panelGestureFor (#788)', () => {
  it('waits while the move is within 8 px', () => {
    expect(panelGestureFor(0, 0)).toBe('pending');
    expect(panelGestureFor(0, 8)).toBe('pending');
    expect(panelGestureFor(-5, 6)).toBe('pending');
  });

  it('scrolls on a mostly vertical move, up or down', () => {
    expect(panelGestureFor(0, 9)).toBe('scroll');
    expect(panelGestureFor(0, -9)).toBe('scroll');
    expect(panelGestureFor(5, -8)).toBe('scroll');
  });

  it('drags on a mostly sideways move, left or right', () => {
    expect(panelGestureFor(9, 0)).toBe('drag');
    expect(panelGestureFor(-9, 0)).toBe('drag');
    expect(panelGestureFor(8, 5)).toBe('drag');
  });

  it('scrolls on an exact diagonal', () => {
    expect(panelGestureFor(7, 7)).toBe('scroll');
    expect(panelGestureFor(-7, -7)).toBe('scroll');
  });
});

describe('PilePanel touch-action (#788)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps touch-none and no marker when the grid fits', () => {
    renderPanel();
    const grid = document.querySelector('[data-zone="pile-panel-pile"]') as HTMLElement;
    expect(grid.hasAttribute(PANEL_SCROLLS_ATTRIBUTE)).toBe(false);
    const card = screen.getByRole('button', { name: 'card 0' });
    expect(card.className).toMatch(/touch-none/);
    expect(card.className).not.toMatch(/touch-pan-y/);
  });

  it('gives the cards pan-y and marks the grid when the grid scrolls', () => {
    jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(2000);
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
    renderPanel();
    const grid = document.querySelector('[data-zone="pile-panel-pile"]') as HTMLElement;
    expect(grid.getAttribute(PANEL_SCROLLS_ATTRIBUTE)).toBe('true');
    const card = screen.getByRole('button', { name: 'card 0' });
    expect(card.className).toMatch(/touch-pan-y/);
    expect(card.className).not.toMatch(/touch-none/);
  });
});

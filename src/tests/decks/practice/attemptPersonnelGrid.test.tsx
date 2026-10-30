jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import AttemptPersonnelRow, { attemptPersonnelScrollTestId } from '../../../app/decks/practice/AttemptPersonnelRow';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { PANEL_SCROLLS_ATTRIBUTE } from '../../../app/decks/practice/panelGesture';

const personnel = (count: number): CardInstance[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `card-${i}`,
    card: { name: `Personnel ${i}`, imagefile: `p${i}`, type: 'personnel' },
    face: 'up',
  }));

const dropId = 'attempt-crew-ship-1';

// Issue #1205: the attempting personnel show as cropped table cards in a grid that scrolls, with the
// buttons out of the scroll. Issue #1218: 3 to a row, the crew panel's 8 px gap, the buttons above.
describe('AttemptPersonnelRow grid (#1205)', () => {
  const renderRow = (count: number, buttonsInBand = false) =>
    render(
      <AttemptPersonnelRow
        dropId={dropId}
        landedKey="crew-ship-1"
        kind="ship"
        label="Crew"
        cards={personnel(count)}
        cardWidth={73}
        columns={3}
        width={241}
        height={65}
        buttonsInBand={buttonsInBand}
        selectedIds={['card-1']}
        onToggleSelect={() => {}}
        onSetStopped={() => {}}
        onShuffle={() => {}}
        moveDestinations={[]}
        onMoveSelection={() => {}}
      />
    );

  it('draws every card as an art crop, 3 to a row, in a scroller inside the drop target', () => {
    renderRow(12);
    const zone = document.querySelector(`[data-zone="${dropId}"]`) as HTMLElement;
    expect(zone.style.height).toBe('65px');
    const scroller = screen.getByTestId(attemptPersonnelScrollTestId(dropId));
    expect(zone.contains(scroller)).toBe(true);
    const grid = scroller.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 73px)');
    expect(grid.style.gap).toBe('8px');
    const cards = Array.from(scroller.querySelectorAll('[data-card-id]'));
    expect(cards.map((c) => c.getAttribute('data-card-id'))).toEqual(personnel(12).map((c) => c.id));
    // The crop, not the whole card: the image box is 64/72 of the width tall.
    for (const card of cards) {
      expect((card.firstElementChild as HTMLElement).style.height).toBe('65px');
      expect(card.querySelector('img')!.className).toContain('object-cover');
    }
  });

  it('keeps the buttons outside the scroller', () => {
    renderRow(12);
    const scroller = screen.getByTestId(attemptPersonnelScrollTestId(dropId));
    for (const id of ['attempt-row-stop', 'attempt-row-stop-all', 'attempt-row-shuffle']) {
      expect(scroller.contains(screen.getByTestId(id))).toBe(false);
    }
  });

  it('puts the buttons above the cards, as in the crew panel', () => {
    renderRow(12);
    const zone = document.querySelector(`[data-zone="${dropId}"]`) as HTMLElement;
    for (const id of ['attempt-row-stop', 'attempt-row-stop-all', 'attempt-row-shuffle']) {
      // DOCUMENT_POSITION_FOLLOWING: the zone comes after the button.
      expect(screen.getByTestId(id).compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  // Issue #1376: in the band above the facing body, out of the flow of the column, so the drop
  // target and its first row of cards start at the top of the row, level with the mission.
  it('puts the buttons in the band above the row, out of the flow, when the band holds them', () => {
    renderRow(12, true);
    const line = screen.getByTestId('attempt-row-buttons');
    expect(line.className).toContain('absolute');
    expect(line.style.bottom).toBe('100%');
    expect(line.style.height).toBe('18px');
    // The drop target is the first element of the row's flow.
    const zone = document.querySelector(`[data-zone="${dropId}"]`) as HTMLElement;
    const inFlow = Array.from(zone.parentElement!.children).filter((child) => !child.className.includes('absolute'));
    expect(inFlow[0]).toBe(zone);
    for (const id of ['attempt-row-stop', 'attempt-row-stop-all', 'attempt-row-shuffle']) {
      expect(line.contains(screen.getByTestId(id))).toBe(true);
      expect(zone.contains(screen.getByTestId(id))).toBe(false);
    }
  });

  it('keeps the buttons in the flow above the cards when the band is too short', () => {
    renderRow(12);
    const line = screen.getByTestId('attempt-row-buttons');
    expect(line.className).not.toContain('absolute');
    expect(line.style.bottom).toBe('');
  });

  it('marks the scroller and gives the cards pan-y only while it overflows', () => {
    // jsdom reports 0 for both heights, so the area fits until the heights say otherwise.
    const observers: (() => void)[] = [];
    const original = global.ResizeObserver;
    global.ResizeObserver = class {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      renderRow(12);
      const scroller = screen.getByTestId(attemptPersonnelScrollTestId(dropId));
      const card = scroller.querySelector('[data-card-id="card-0"]')!;
      expect(scroller.getAttribute(PANEL_SCROLLS_ATTRIBUTE)).toBeNull();
      expect(card.className).toContain('touch-none');

      Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 207 });
      Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 65 });
      act(() => observers.forEach((cb) => cb()));
      expect(scroller.getAttribute(PANEL_SCROLLS_ATTRIBUTE)).toBe('true');
      expect(scroller.className).toContain('overflow-y-scroll');
      expect(card.className).toContain('touch-pan-y');
      expect(card.className).not.toContain('touch-none');
    } finally {
      global.ResizeObserver = original;
    }
  });
});

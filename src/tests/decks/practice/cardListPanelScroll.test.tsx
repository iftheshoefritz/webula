// #720: a card list panel with many cards used to grow past the bottom of the screen with no way to
// scroll down to the cards that fell off — the panel's grid had no maximum height and no
// scrolling of its own. This renders `CardListPanel` directly (no need for the full practice page)
// and checks that the card grid itself is capped and scrollable, and that the Stop/Shuffle
// controls sit outside that scrolling element so they never scroll away with the cards.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
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

const manyCards = Array.from({ length: 30 }, (_, i) => makeCard(i));

describe('Practice draw: a card list panel with many cards scrolls instead of running off the screen (#720)', () => {
  it("caps the card grid's height and makes it scroll, keeping the Shuffle button outside the scrolling area", () => {
    render(
      <CardListPanel
        location="drawDeck"
        cards={manyCards}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onShuffle={() => {}}
        onSetStopped={() => {}}
      />
    );

    const grid = document.body.querySelector('[data-testid="card-list-panel-drawDeck"]') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.className).toMatch(/overflow-y-auto/);
    // #802: the grid no longer carries a `max-h` of its own. The panel around it is bounded by
    // the full height of the game layer (`max-h-full` inside an inset box), and the grid is the
    // one child that shrinks (`min-h-0`) and scrolls once the panel reaches that bound.
    expect(grid.className).toMatch(/min-h-0/);
    expect(grid.parentElement!.className).toMatch(/max-h-full/);
    // #1068: the top inset is `PANEL_TOP_INSET`, below the band where iOS Safari takes a tap.
    const insetBox = grid.parentElement!.parentElement as HTMLElement;
    expect([insetBox.style.top, insetBox.style.right, insetBox.style.bottom, insetBox.style.left]).toEqual(['44px', '8px', '8px', '8px']);

    const shuffleButton = screen.getByRole('button', { name: /shuffle/i });
    expect(grid.contains(shuffleButton)).toBe(false);
    expect(shuffleButton.className).toMatch(/shrink-0/);
  });

  it('draws each card at 1.5x the table card by default (#802)', () => {
    render(
      <CardListPanel location="drawDeck" cards={manyCards.slice(0, 2)} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />
    );
    const card = document.body.querySelector('[data-card-id="card-0"]')!.parentElement as HTMLElement;
    expect(card.style.width).toBe('108px');
  });

  it('closes on a tap on the backdrop', () => {
    const onClose = jest.fn();
    render(
      <CardListPanel
        location="drawDeck"
        cards={manyCards}
        onClose={onClose}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onShuffle={() => {}}
        onSetStopped={() => {}}
      />
    );

    screen.getByRole('button', { name: 'Close draw deck' }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

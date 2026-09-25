// #720: a pile panel with many cards used to grow past the bottom of the screen with no way to
// scroll down to the cards that fell off — the panel's grid had no maximum height and no
// scrolling of its own. This renders `PilePanel` directly (no need for the full practice page)
// and checks that the card grid itself is capped and scrollable, and that the Stop/Shuffle
// controls sit outside that scrolling element so they never scroll away with the cards.
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import PilePanel from '../../../app/decks/practice/PilePanel';
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

describe('Practice draw: a pile panel with many cards scrolls instead of running off the screen (#720)', () => {
  it("caps the card grid's height and makes it scroll, keeping the Shuffle button outside the scrolling area", () => {
    render(
      <PilePanel
        zone="pile"
        cards={manyCards}
        onClose={() => {}}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onShuffle={() => {}}
        onSetStopped={() => {}}
      />
    );

    const grid = document.body.querySelector('[data-zone="pile-panel-pile"]') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.className).toMatch(/overflow-y-auto/);
    expect(grid.className).toMatch(/max-h-/);

    const shuffleButton = screen.getByRole('button', { name: /shuffle/i });
    expect(grid.contains(shuffleButton)).toBe(false);
  });

  it('closes on a tap on the backdrop', () => {
    const onClose = jest.fn();
    render(
      <PilePanel
        zone="pile"
        cards={manyCards}
        onClose={onClose}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onShuffle={() => {}}
        onSetStopped={() => {}}
      />
    );

    screen.getByRole('button', { name: 'Close draw pile' }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

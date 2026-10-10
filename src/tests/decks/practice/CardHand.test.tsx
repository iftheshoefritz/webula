jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CardHand from '../../../app/decks/practice/CardHand';
import CountBadge from '../../../app/decks/practice/CountBadge';
import { CardInstance } from '../../../app/decks/practice/tableReducer';
import { VIEWER_TOP_INSET } from '../../../app/decks/practice/viewerCardSize';

const makeInstances = (n: number): CardInstance[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    card: { name: `Card ${i}`, imagefile: `card_${i}` },
    face: 'up',
  }));

function Harness({
  instances,
  initialOpen = false,
  dragging = false,
  portalContainer,
  bottomInset,
}: {
  instances: CardInstance[];
  initialOpen?: boolean;
  dragging?: boolean;
  portalContainer?: HTMLElement | null;
  bottomInset?: number;
}) {
  const [open, setOpen] = React.useState(initialOpen);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  return (
    <>
      <CardHand
        instances={instances}
        open={open}
        dragging={dragging}
        portalContainer={portalContainer}
        bottomInset={bottomInset}
        onOpen={() => setOpen(true)}
        onClose={() => {
          setOpen(false);
          setSelectedIds([]);
        }}
        selectedIds={selectedIds}
        onToggleSelect={(id) =>
          setSelectedIds((ids) => (ids.includes(id) ? ids.filter((cardId) => cardId !== id) : [...ids, id]))
        }
      />
    </>
  );
}

describe('CardHand', () => {
  it('opens on a tap of the closed hand', () => {
    render(<Harness instances={makeInstances(3)} />);

    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i }));
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
  });

  // The fan used to sit at the top of the screen (#806), where it covered the mission rows. It
  // now anchors its bottom edge at the inset a card list panel takes (#895, #828), just above the
  // bottom row, and grows upward.
  it('anchors the open fan at the bottom inset it is given, not at the top (#895)', () => {
    render(<Harness instances={makeInstances(3)} initialOpen bottomInset={210} />);

    const fan = document.body.querySelector('[data-zone="hand"]') as HTMLElement;
    expect(fan.style.bottom).toBe('210px');
    expect(fan.style.top).toBe('');
  });

  it('defaults the bottom inset to a card list panel\'s default (#895)', () => {
    render(<Harness instances={makeInstances(3)} initialOpen />);

    const fan = document.body.querySelector('[data-zone="hand"]') as HTMLElement;
    expect(fan.style.bottom).toBe(`${VIEWER_TOP_INSET}px`);
  });

  it('closes on a tap outside the open fan', () => {
    render(<Harness instances={makeInstances(3)} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }));
    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
  });

  it('a tap on a card in the open fan toggles its selection, the same as its checkbox (#764)', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    const card = screen.getByRole('button', { name: 'Card 1' });
    fireEvent.click(card);
    expect(screen.getByRole('button', { name: 'Deselect Card 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(card).toHaveClass('ring-2');
    fireEvent.click(card);
    expect(screen.queryByRole('button', { name: 'Deselect Card 1' })).toBeNull();
    expect(card).not.toHaveClass('ring-2');
  });

  it('shows the closed row as card backs, and the open fan as card faces', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} />);

    const closedButton = screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i });
    closedButton.querySelectorAll('img').forEach((img) => {
      expect(img).toHaveAttribute('src', '/cardimages/cardback.jpg');
    });

    fireEvent.click(closedButton);
    instances.forEach((instance) => {
      expect(document.body.querySelector(`[data-card-id="${instance.id}"] img`)).toHaveAttribute(
        'src',
        `/cardimages/${instance.card.imagefile}.jpg`,
      );
    });
  });

  it('keeps the closed hand within a bounded width as the card count grows', () => {
    const { rerender, container } = render(<Harness instances={makeInstances(2)} />);
    const lastImage = () => container.querySelectorAll('img')[container.querySelectorAll('img').length - 1];
    const smallOffset = parseFloat((lastImage() as HTMLElement).style.left);

    rerender(<Harness instances={makeInstances(20)} />);
    const bigButton = screen.getByRole('button', { name: /^hand, 20 cards, tap to open$/i });
    const bigWidth = parseFloat((bigButton as HTMLElement).style.width);
    const bigOffset = parseFloat((lastImage() as HTMLElement).style.left) / 19;

    // The offset between overlapping cards shrinks as the hand grows, so the total width does
    // not grow proportionally to the card count: 20 cards at the un-shrunk offset would be far
    // wider than 20 cards packed tightly.
    expect(bigOffset).toBeLessThan(smallOffset);
    expect(bigWidth).toBeLessThan(20 * smallOffset);
  });

  // On a touch screen, the browser sends the rest of a touch's events to the element where the
  // touch started. If the drag start removes that card from the document, WebKit's events stop
  // bubbling to the document, where dnd-kit listens, and the drop never happens.
  it('keeps the dragged card in the document after a drag closes the hand', () => {
    const instances = makeInstances(3);
    const props = { instances, onOpen: () => {}, onClose: () => {} };
    const { rerender } = render(<CardHand {...props} open />);
    const draggedCard = document.body.querySelector(`[data-card-id="${instances[1].id}"]`);
    expect(draggedCard).not.toBeNull();

    // When the drag starts, the page closes the hand and sets `dragging` in the same update.
    rerender(<CardHand {...props} open={false} dragging />);

    expect(draggedCard!.isConnected).toBe(true);
    // The kept fan is hidden: no backdrop, no second hand zone, and no accessible card buttons.
    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Card 1' })).not.toBeInTheDocument();
    expect(document.body.querySelectorAll('[data-zone="hand"]')).toHaveLength(1);
  });

  it('removes the hidden fan after the drag ends', () => {
    const instances = makeInstances(3);
    const { rerender } = render(<Harness instances={instances} dragging />);
    expect(document.body.querySelector('[data-card-id]')).not.toBeNull();

    rerender(<Harness instances={instances} />);
    expect(document.body.querySelector('[data-card-id]')).toBeNull();
  });

  // The bottom row has a CSS transform, which would make the fan's `fixed` position relative
  // to the row. So the fan goes in a portal on the given container.
  it('renders the open fan in the portal container, outside the closed hand', () => {
    const portalContainer = document.createElement('div');
    document.body.appendChild(portalContainer);
    const { container } = render(<Harness instances={makeInstances(3)} initialOpen portalContainer={portalContainer} />);

    expect(portalContainer.querySelector('[data-zone="hand"] [data-card-id]')).not.toBeNull();
    expect(container.querySelector('[data-card-id]')).toBeNull();
    portalContainer.remove();
  });

  // #691: each card in the open fan carries the same select checkbox a card list panel's cards do
  // (#677), so several cards can be checked and dragged together.
  it('shows a card as selected once its checkbox is tapped', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    // #1015: an unselected card shows no checkbox.
    expect(screen.queryByRole('button', { name: /^(Select|Deselect) Card/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Card 1' }));

    expect(screen.getByRole('button', { name: 'Deselect Card 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^(Select|Deselect) Card 2$/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Deselect Card 1' }));

    expect(screen.queryByRole('button', { name: /^(Select|Deselect) Card/ })).toBeNull();
  });

  it('a tap on the checkbox does not open the card preview', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Card 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deselect Card 1' }));

    expect(screen.queryByTestId('previewed')).not.toBeInTheDocument();
  });

  it('clears the selection when the hand is closed', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Card 1' }));
    fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i }));

    expect(screen.queryByRole('button', { name: 'Deselect Card 1' })).toBeNull();
  });

  it('disables the closed hand when it has no cards', () => {
    render(<Harness instances={[]} />);
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeDisabled();
  });

  it('shows a count badge on the closed hand, and an empty placeholder instead when it is empty during a drag', () => {
    const { rerender } = render(<Harness instances={makeInstances(3)} />);
    expect(screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i })).toHaveTextContent('3');

    rerender(<Harness instances={[]} dragging />);
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toHaveTextContent('Empty');
  });

  // #929: the empty marker only helps while a drag runs, so it hides the rest of the time. The
  // closed row keeps its size, so nothing in the bottom row moves as the marker comes and goes.
  it('hides the empty placeholder when no drag runs, and keeps the closed row its size (#929)', () => {
    const { rerender } = render(<Harness instances={[]} />);
    const hand = screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i });
    expect(hand).not.toHaveTextContent('Empty');
    expect(hand.querySelector('.border-dashed')).toBeNull();
    const idleSize = { width: hand.style.width, height: hand.style.height };

    rerender(<Harness instances={[]} dragging />);
    expect(hand).toHaveTextContent('Empty');
    expect({ width: hand.style.width, height: hand.style.height }).toEqual(idleSize);

    rerender(<Harness instances={[]} />);
    expect(hand).not.toHaveTextContent('Empty');
  });

  // #750: a pile's `CountBadge` used to draw on top of the open hand and dilemma hand, because
  // the badge's z-index outranked the fan's and the backdrop's. Rather than pin this to the
  // exact pair of literal values, assert the relationship that has to hold: the open fan and its
  // backdrop must both outrank the highest z-index a `CountBadge` can render.
  it('draws the open fan and its backdrop above a pile count badge (#750)', () => {
    const parseZIndex = (className: string) => {
      const match = className.match(/z-\[(\d+)\]/);
      return match ? Number(match[1]) : null;
    };

    const { container: badgeContainer } = render(<CountBadge count={3} />);
    const badgeZIndex = parseZIndex(badgeContainer.querySelector('span')!.className);
    expect(badgeZIndex).not.toBeNull();

    render(<Harness instances={makeInstances(3)} initialOpen />);
    const backdropZIndex = parseZIndex(screen.getByRole('button', { name: /^close hand$/i }).className);
    const fanZIndex = parseZIndex(document.body.querySelector('[data-zone="hand"]')!.className);

    expect(backdropZIndex).not.toBeNull();
    expect(fanZIndex).not.toBeNull();
    expect(backdropZIndex!).toBeGreaterThan(badgeZIndex!);
    expect(fanZIndex!).toBeGreaterThan(badgeZIndex!);
  });

  it('hides the count badge while the hand is open', () => {
    const { container } = render(<Harness instances={makeInstances(3)} initialOpen />);
    expect(container.querySelector('[aria-label="hand, 3 cards, tap to open"]')).toHaveStyle({
      visibility: 'hidden',
    });
  });

  // #638: the backdrop covers the whole screen, including the draw deck, so a tap there still
  // draws a card instead of only closing the hand.
  describe('passthroughZone', () => {
    function renderWithPassthroughTarget(onPassthroughClick: () => void) {
      const target = document.createElement('button');
      target.setAttribute('data-zone', 'drawDeck');
      target.getBoundingClientRect = () => ({
        left: 100,
        right: 150,
        top: 100,
        bottom: 150,
        width: 50,
        height: 50,
        x: 100,
        y: 100,
        toJSON: () => {},
      });
      target.addEventListener('click', onPassthroughClick);
      document.body.appendChild(target);
      return target;
    }

    it('forwards a tap on the passthrough zone to it, instead of closing the hand', () => {
      const onPassthroughClick = jest.fn();
      const target = renderWithPassthroughTarget(onPassthroughClick);
      render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={() => {}}
          passthroughZone="drawDeck"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 120, clientY: 120 });

      expect(onPassthroughClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
      target.remove();
    });

    it('still closes the hand when a tap misses the passthrough zone', () => {
      const onPassthroughClick = jest.fn();
      const onClose = jest.fn();
      const target = renderWithPassthroughTarget(onPassthroughClick);
      render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={onClose}
          passthroughZone="drawDeck"
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 0, clientY: 0 });

      expect(onPassthroughClick).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      target.remove();
    });

    // #741: a hand also passes a tap through to the dilemma pile's two halves, so either hand
    // can stay open while the player draws from either pile.
    it('forwards a tap to whichever of several named passthrough zones it lands on', () => {
      const onPassthroughClick = jest.fn();
      const target = renderWithPassthroughTarget(onPassthroughClick);
      target.setAttribute('data-zone', 'dilemma-pile-top');
      render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={() => {}}
          passthroughZone={['drawDeck', 'dilemma-pile-top', 'dilemma-pile-bottom']}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 120, clientY: 120 });

      expect(onPassthroughClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
      target.remove();
    });

    it('still closes the hand when a tap misses every named passthrough zone', () => {
      const onPassthroughClick = jest.fn();
      const onClose = jest.fn();
      const target = renderWithPassthroughTarget(onPassthroughClick);
      target.setAttribute('data-zone', 'dilemma-pile-top');
      render(
        <CardHand
          instances={makeInstances(3)}
          open
          onOpen={() => {}}
          onClose={onClose}
          passthroughZone={['drawDeck', 'dilemma-pile-top', 'dilemma-pile-bottom']}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 0, clientY: 0 });

      expect(onPassthroughClick).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      target.remove();
    });
  });

  // #994: the "→ top" and "→ bottom" buttons name the hand's own deck and report the end.
  it('shows the top and bottom buttons for a selection, named for the deck', () => {
    const onSendSelected = jest.fn();
    render(
      <CardHand
        instances={makeInstances(2)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        zone="dilemmaHand"
        selectedIds={['c1']}
        onSendSelected={onSendSelected}
        deckLabel="dilemma pile"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Selected cards to the top of the dilemma pile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selected cards to the bottom of the dilemma pile' }));
    expect(onSendSelected.mock.calls).toEqual([['top'], ['bottom']]);
  });

  // #1013: the row's right end lines up with the right end of the fan, not the screen edge. The
  // row takes the fan's own width, centred as the fan is, and packs its buttons to the right.
  // jsdom measures 0, so `OverlapRow` lays the cards edge to edge: 3 cards take 3 card widths.
  it('lines the top and bottom buttons up with the right end of the fan (#1013)', () => {
    render(
      <CardHand
        instances={makeInstances(3)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        zone="dilemmaHand"
        openCardWidth={100}
        selectedIds={['c1']}
        onSendSelected={() => {}}
        deckLabel="dilemma pile"
      />,
    );
    const row = screen.getByTestId('dilemmaHand-controls');
    expect(row).toHaveStyle({ width: '300px' });
    expect(row).toHaveClass('justify-end');
    expect(row.parentElement).toHaveClass('fixed', 'inset-x-2', 'justify-center');
    expect(row.parentElement).not.toHaveClass('right-2');
  });

  // The row shares the fan's stacking context with the cards, whose `zIndex` runs from 1 to the
  // count. Without a `zIndex` above them, the cards paint over the buttons where the two overlap,
  // as they do at 568 x 320, and a tap on the lower half of a button lands on a card.
  it('stacks the top and bottom buttons above every card of the fan (#1013)', () => {
    render(
      <CardHand
        instances={makeInstances(3)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        selectedIds={['c1']}
        onSendSelected={() => {}}
      />,
    );
    const rowZ = Number(screen.getByTestId('hand-controls').parentElement!.style.zIndex);
    const cardZ = screen
      .getAllByRole('button', { name: /^Card \d+$/ })
      .map((card) => Number((card.closest('[style*="z-index"]') as HTMLElement).style.zIndex));
    expect(cardZ.length).toBe(3);
    expect(rowZ).toBeGreaterThan(Math.max(...cardZ));
  });

  it('shows no top and bottom buttons when no card of the hand is selected', () => {
    render(
      <CardHand
        instances={makeInstances(2)}
        open
        onOpen={() => {}}
        onClose={() => {}}
        selectedIds={['elsewhere']}
        onSendSelected={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Selected cards to the/ })).toBeNull();
  });
});

jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CardHand from '../../../app/decks/practice/CardHand';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

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
}: {
  instances: CardInstance[];
  initialOpen?: boolean;
  dragging?: boolean;
  portalContainer?: HTMLElement | null;
}) {
  const [open, setOpen] = React.useState(initialOpen);
  const [previewed, setPreviewed] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  return (
    <>
      <CardHand
        instances={instances}
        open={open}
        dragging={dragging}
        portalContainer={portalContainer}
        onOpen={() => setOpen(true)}
        onClose={() => {
          setOpen(false);
          setSelectedIds([]);
        }}
        onCardClick={(id) => setPreviewed(id)}
        selectedIds={selectedIds}
        onToggleSelect={(id) =>
          setSelectedIds((ids) => (ids.includes(id) ? ids.filter((cardId) => cardId !== id) : [...ids, id]))
        }
      />
      {previewed && <div data-testid="previewed">{previewed}</div>}
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

  it('closes on a tap outside the open fan', () => {
    render(<Harness instances={makeInstances(3)} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }));
    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
  });

  it('opens the preview on a tap of a card in the open fan', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Card 1' }));
    expect(screen.getByTestId('previewed')).toHaveTextContent(instances[1].id);
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
    const props = { instances, onOpen: () => {}, onClose: () => {}, onCardClick: () => {} };
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

  // #691: each card in the open fan carries the same select checkbox a pile panel's cards do
  // (#677), so several cards can be checked and dragged together.
  it('shows a card as selected once its checkbox is tapped', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    expect(screen.getByRole('button', { name: 'Select Card 1' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Select Card 1' }));

    expect(screen.getByRole('button', { name: 'Deselect Card 1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a tap on the checkbox does not open the card preview', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Card 1' }));

    expect(screen.queryByTestId('previewed')).not.toBeInTheDocument();
  });

  it('clears the selection when the hand is closed', () => {
    const instances = makeInstances(3);
    render(<Harness instances={instances} initialOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Card 1' }));
    fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i }));

    expect(screen.getByRole('button', { name: 'Select Card 1' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables the closed hand when it has no cards', () => {
    render(<Harness instances={[]} />);
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeDisabled();
  });

  it('shows a count badge on the closed hand, and an empty placeholder instead when it is empty', () => {
    const { rerender } = render(<Harness instances={makeInstances(3)} />);
    expect(screen.getByRole('button', { name: /^hand, 3 cards, tap to open$/i })).toHaveTextContent('3');

    rerender(<Harness instances={[]} />);
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toHaveTextContent('Empty');
  });

  it('hides the count badge while the hand is open', () => {
    const { container } = render(<Harness instances={makeInstances(3)} initialOpen />);
    expect(container.querySelector('[aria-label="hand, 3 cards, tap to open"]')).toHaveStyle({
      visibility: 'hidden',
    });
  });

  // #638: the backdrop covers the whole screen, including the draw pile, so a tap there still
  // draws a card instead of only closing the hand.
  describe('passthroughZone', () => {
    function renderWithPassthroughTarget(onPassthroughClick: () => void) {
      const target = document.createElement('button');
      target.setAttribute('data-zone', 'pile');
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
          onCardClick={() => {}}
          passthroughZone="pile"
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
          onCardClick={() => {}}
          passthroughZone="pile"
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
          onCardClick={() => {}}
          passthroughZone={['pile', 'dilemma-pile-top', 'dilemma-pile-bottom']}
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
          onCardClick={() => {}}
          passthroughZone={['pile', 'dilemma-pile-top', 'dilemma-pile-bottom']}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 0, clientY: 0 });

      expect(onPassthroughClick).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      target.remove();
    });
  });
});

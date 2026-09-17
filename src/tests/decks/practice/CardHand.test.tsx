jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
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
  return (
    <>
      <CardHand
        instances={instances}
        open={open}
        dragging={dragging}
        portalContainer={portalContainer}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onCardClick={(id) => setPreviewed(id)}
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

  it('disables the closed hand when it has no cards', () => {
    render(<Harness instances={[]} />);
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeDisabled();
  });
});

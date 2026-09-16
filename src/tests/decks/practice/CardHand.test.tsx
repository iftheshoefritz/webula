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

function Harness({ instances, initialOpen = false }: { instances: CardInstance[]; initialOpen?: boolean }) {
  const [open, setOpen] = React.useState(initialOpen);
  const [previewed, setPreviewed] = React.useState<string | null>(null);
  return (
    <>
      <CardHand
        instances={instances}
        open={open}
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

  it('disables the closed hand when it has no cards', () => {
    render(<Harness instances={[]} />);
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeDisabled();
  });
});

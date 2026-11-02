// Issue #1467: Escape closes a card list panel, the open hand, the open dilemma hand and the
// decklist, does nothing during a drag, and closes only the top layer when more than one is open.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import CardHand from '../../../app/decks/practice/CardHand';
import DecklistPanel from '../../../app/decks/practice/DecklistPanel';
import GameLogPanel from '../../../app/decks/practice/GameLogPanel';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const instance = (id: string, type = 'personnel') =>
  ({
    id,
    face: 'up',
    card: { collectorsinfo: id, originalName: id, type, name: id, imagefile: id, pile: 'draw', count: 1 },
  }) as CardInstance;

const pressEscape = () => fireEvent.keyDown(window, { key: 'Escape' });

function HandHarness({ zone, dragging = false }: { zone: 'hand' | 'dilemmaHand'; dragging?: boolean }) {
  const [open, setOpen] = React.useState(true);
  return (
    <CardHand
      instances={[instance('a'), instance('b')]}
      open={open}
      dragging={dragging}
      zone={zone}
      label={zone}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    />
  );
}

describe('Escape on the practice table (#1467)', () => {
  it('closes an open card list panel', () => {
    const onClose = jest.fn();
    render(<CardListPanel location="awayTeam" cards={[instance('a')]} onClose={onClose} selectedIds={[]} onToggleSelect={() => {}} />);
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close a card list panel during a drag', () => {
    const onClose = jest.fn();
    render(<CardListPanel location="awayTeam" cards={[instance('a')]} onClose={onClose} selectedIds={[]} onToggleSelect={() => {}} hidden />);
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const onClose = jest.fn();
    render(<CardListPanel location="awayTeam" cards={[instance('a')]} onClose={onClose} selectedIds={[]} onToggleSelect={() => {}} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(['hand', 'dilemmaHand'] as const)('closes the open %s arc', (zone) => {
    render(<HandHarness zone={zone} />);
    expect(screen.getByRole('button', { name: new RegExp(`^close ${zone}$`, 'i') })).toBeInTheDocument();
    pressEscape();
    expect(screen.queryByRole('button', { name: new RegExp(`^close ${zone}$`, 'i') })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${zone}, 2 cards, tap to open` })).toBeEnabled();
  });

  it('does not close the open hand during a drag', () => {
    render(<HandHarness zone="hand" dragging />);
    pressEscape();
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
  });

  it('closes the decklist', () => {
    const onClose = jest.fn();
    render(<DecklistPanel deck={{}} onClose={onClose} />);
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes only the top layer when more than one is open', () => {
    const closePanel = jest.fn();
    const closeLog = jest.fn();
    const { rerender } = render(
      <CardListPanel location="core" cards={[instance('a', 'event')]} onClose={closePanel} selectedIds={[]} onToggleSelect={() => {}} />
    );
    rerender(
      <>
        <CardListPanel location="core" cards={[instance('a', 'event')]} onClose={closePanel} selectedIds={[]} onToggleSelect={() => {}} />
        <GameLogPanel log={[]} onClose={closeLog} />
      </>
    );
    pressEscape();
    expect(closeLog).toHaveBeenCalledTimes(1);
    expect(closePanel).not.toHaveBeenCalled();

    rerender(
      <CardListPanel location="core" cards={[instance('a', 'event')]} onClose={closePanel} selectedIds={[]} onToggleSelect={() => {}} />
    );
    pressEscape();
    expect(closePanel).toHaveBeenCalledTimes(1);
    expect(closeLog).toHaveBeenCalledTimes(1);
  });
});

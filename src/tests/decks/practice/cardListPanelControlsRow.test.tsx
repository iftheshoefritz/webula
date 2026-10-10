// Issue #880: Shuffle shares one row with Download, Stop, Flip and Discard, above the card grid.
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';

const instance = (id: string, name: string) =>
  ({
    id,
    face: 'up',
    card: { collectorsinfo: id, originalName: name, type: 'equipment', name, imagefile: name, pile: 'draw', count: 1 },
  }) as any;
const cards = [instance('a', 'first'), instance('b', 'second')];

describe('CardListPanel: one row of controls (#880)', () => {
  it('puts Download and Shuffle in the same row in the draw deck panel', () => {
    const onShuffle = jest.fn();
    const onClose = jest.fn();
    render(
      <CardListPanel
        location="drawDeck"
        cards={cards}
        onClose={onClose}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onShuffle={onShuffle}
        onDownload={() => {}}
      />
    );
    const row = screen.getByTestId('panel-controls');
    const download = within(row).getByRole('button', { name: 'Download' });
    const shuffle = within(row).getByRole('button', { name: 'Shuffle' });
    expect(download.parentElement).toBe(row);
    expect(shuffle.parentElement).toBe(row);
    // The card grid is not inside the row.
    expect(within(row).queryByTestId('card-list-panel-drawDeck')).toBeNull();

    fireEvent.click(shuffle);
    expect(onShuffle).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the discard pile row without Shuffle', () => {
    render(
      <CardListPanel
        location="discard"
        cards={cards}
        onClose={() => {}}
        selectedIds={['a']}
        onToggleSelect={() => {}}
        onFlip={() => {}}
      />
    );
    const row = screen.getByTestId('panel-controls');
    expect(within(row).getByRole('button', { name: 'Flip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shuffle' })).toBeNull();
  });

  it('shows the row with Shuffle alone when no other control is given', () => {
    render(
      <CardListPanel location="core" cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} onShuffle={() => {}} />
    );
    const row = screen.getByTestId('panel-controls');
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['Shuffle']);
  });

  it('shows no row when the panel has no control', () => {
    render(<CardListPanel location="core" cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />);
    expect(screen.queryByTestId('panel-controls')).toBeNull();
  });

  // #966: Shuffle has the btn-primary style, so it does not look disabled with no card selected.
  it('gives Shuffle the btn-primary style and keeps it enabled with no selection', () => {
    const onShuffle = jest.fn();
    render(
      <CardListPanel location="drawDeck" cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} onShuffle={onShuffle} />
    );
    const shuffle = within(screen.getByTestId('panel-controls')).getByRole('button', { name: 'Shuffle' });
    expect(shuffle).toHaveClass('btn-primary');
    expect(shuffle).toBeEnabled();
    expect(shuffle.querySelector('svg')).not.toBeNull();
    fireEvent.click(shuffle);
    expect(onShuffle).toHaveBeenCalledTimes(1);
  });
});

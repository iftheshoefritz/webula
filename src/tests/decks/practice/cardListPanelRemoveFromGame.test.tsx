// Issue #1564: the discard pile panel's Remove from game button, and the look of a card removed
// from the game.
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import { STOPPED_IMAGE_CLASSNAME } from '../../../app/decks/practice/TableCard';

const instance = (id: string, type: string, removedFromGame?: boolean) =>
  ({
    id,
    face: 'up',
    removedFromGame,
    card: { collectorsinfo: id, originalName: id, type, name: id, imagefile: id, pile: 'draw', count: 1 },
  }) as any;

const renderDiscard = (cards: any[], selectedIds: string[], onSetRemovedFromGame = jest.fn()) => {
  render(
    <CardListPanel
      location="discard"
      cards={cards}
      onClose={() => {}}
      selectedIds={selectedIds}
      onToggleSelect={() => {}}
      onSetRemovedFromGame={onSetRemovedFromGame}
    />
  );
  return onSetRemovedFromGame;
};

describe('CardListPanel: Remove from game (#1564)', () => {
  it('is disabled while nothing is selected', () => {
    renderDiscard([instance('a', 'event')], []);
    expect(screen.getByTestId('remove-from-game-button')).toBeDisabled();
  });

  it('removes the selected cards of any type', () => {
    const onSet = renderDiscard([instance('a', 'event'), instance('b', 'personnel'), instance('c', 'ship')], ['a', 'b']);
    const button = within(screen.getByTestId('panel-controls')).getByRole('button', { name: 'Remove from game' });
    fireEvent.click(button);
    expect(onSet).toHaveBeenCalledWith(['a', 'b'], true);
  });

  it('reads Return to game once every selected card is removed, and returns them', () => {
    const onSet = renderDiscard([instance('a', 'event', true), instance('b', 'personnel', true)], ['a', 'b']);
    fireEvent.click(screen.getByRole('button', { name: 'Return to game' }));
    expect(onSet).toHaveBeenCalledWith(['a', 'b'], false);
  });

  it('reads Remove from game on a mixed selection', () => {
    renderDiscard([instance('a', 'event', true), instance('b', 'personnel')], ['a', 'b']);
    expect(screen.getByTestId('remove-from-game-button')).toHaveTextContent('Remove from game');
  });

  it('shows no button without the callback', () => {
    render(<CardListPanel location="core" cards={[instance('a', 'event')]} onClose={() => {}} selectedIds={['a']} onToggleSelect={() => {}} />);
    expect(screen.queryByTestId('remove-from-game-button')).toBeNull();
  });

  it('draws a removed card with the stopped look and the label', () => {
    renderDiscard([instance('a', 'event', true), instance('b', 'event')], []);
    const removed = screen.getByRole('button', { name: 'a' });
    expect(removed.querySelector('img')!.className).toContain(STOPPED_IMAGE_CLASSNAME);
    expect(within(removed).getByTestId('removed-from-game-label')).toHaveTextContent('Removed from game');
    const plain = screen.getByRole('button', { name: 'b' });
    expect(plain.querySelector('img')!.className).not.toContain(STOPPED_IMAGE_CLASSNAME);
    expect(within(plain).queryByTestId('removed-from-game-label')).toBeNull();
  });
});

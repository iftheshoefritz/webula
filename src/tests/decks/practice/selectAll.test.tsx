// Issue #1781: a ship's crew panel, a mission's away team panel and the attempting row of the attempt
// layout get a "Select all" button. It selects every card, the equipment too, in place of the
// selection, and once every card is selected it reads "Select none" and clears the selection.
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CardListPanel, { type PanelLocation } from '../../../app/decks/practice/CardListPanel';
import AttemptPersonnelRow from '../../../app/decks/practice/AttemptPersonnelRow';
import { selectAllButton } from '../../../app/decks/practice/stopRules';
import type { AttemptMoveDestination } from '../../../app/decks/practice/attempt';

const instance = (id: string, type: string) =>
  ({
    id,
    face: 'up',
    card: { collectorsinfo: id, originalName: id, type, name: id, imagefile: id, pile: 'draw', count: 1 },
  }) as any;

const cards = [instance('a', 'personnel'), instance('b', 'equipment'), instance('c', 'personnel')];

describe('selectAllButton (#1781)', () => {
  it('selects every card in place of the selection', () => {
    expect(selectAllButton(cards, ['x', 'a'])).toEqual({ allSelected: false, nextSelection: ['a', 'b', 'c'] });
  });

  it('clears the whole selection once every card is selected', () => {
    expect(selectAllButton(cards, ['c', 'x', 'a', 'b'])).toEqual({ allSelected: true, nextSelection: [] });
  });

  it('never reads all selected for no card', () => {
    expect(selectAllButton([], []).allSelected).toBe(false);
  });
});

describe('CardListPanel: Select all (#1781)', () => {
  function Panel({ location, initial = [] }: { location: PanelLocation; initial?: string[] }) {
    const [selectedIds, setSelectedIds] = useState<string[]>(initial);
    return (
      <CardListPanel
        location={location}
        cards={cards}
        onClose={() => {}}
        selectedIds={selectedIds}
        onToggleSelect={() => {}}
        onSelectIds={setSelectedIds}
        onSetStopped={() => {}}
        onFlip={() => {}}
        onDiscard={() => {}}
      />
    );
  }

  it.each(['crew', 'awayTeam'] as const)('selects every card of the %s panel, then none', (location) => {
    render(<Panel location={location} initial={['elsewhere']} />);
    const button = screen.getByTestId('panel-select-all');
    expect(button).toHaveTextContent('Select all');
    expect(screen.queryByRole('button', { name: 'Flip' })).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveTextContent('Select none');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
    fireEvent.click(button);
    expect(button).toHaveTextContent('Select all');
    expect(screen.queryByRole('button', { name: 'Flip' })).toBeNull();
  });

  it('replaces a selection from outside the panel', () => {
    const onSelectIds = jest.fn();
    render(
      <CardListPanel location="crew" cards={cards} onClose={() => {}} selectedIds={['x']} onToggleSelect={() => {}} onSelectIds={onSelectIds} />
    );
    fireEvent.click(screen.getByTestId('panel-select-all'));
    expect(onSelectIds).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('is disabled when the panel holds no card', () => {
    render(<CardListPanel location="awayTeam" cards={[]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} onSelectIds={() => {}} />);
    expect(screen.getByTestId('panel-select-all')).toBeDisabled();
  });

  it.each(['discard', 'core', 'brig', 'drawDeck'] as const)('does not show in the %s panel', (location) => {
    render(<CardListPanel location={location} cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} onSelectIds={() => {}} />);
    expect(screen.queryByTestId('panel-select-all')).toBeNull();
  });
});

describe('AttemptPersonnelRow: Select all (#1781)', () => {
  const destination: AttemptMoveDestination = { key: 'hand', label: 'Hand', to: 'hand' } as AttemptMoveDestination;

  function Row({ rowCards = cards }: { rowCards?: typeof cards }) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    return (
      <AttemptPersonnelRow
        dropId="attempt-crew-ship-1"
        landedKey="crew-ship-1"
        kind="ship"
        label="Crew"
        cards={rowCards}
        cardWidth={73}
        columns={3}
        width={241}
        height={200}
        selectedIds={selectedIds}
        onToggleSelect={() => {}}
        onSelectIds={setSelectedIds}
        onSetStopped={() => {}}
        onShuffle={() => {}}
        moveDestinations={[destination]}
        onMoveSelection={() => {}}
      />
    );
  }

  it('selects the whole row, so Move to… shows, then none', () => {
    render(<Row />);
    expect(screen.queryByTestId('attempt-row-move-to')).toBeNull();
    const button = screen.getByTestId('attempt-row-select-all');
    fireEvent.click(button);
    expect(button).toHaveTextContent('Select none');
    expect(screen.getByTestId('attempt-row-move-to')).toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveTextContent('Select all');
    expect(screen.queryByTestId('attempt-row-move-to')).toBeNull();
  });

  it('does not show while the row holds no card', () => {
    render(<Row rowCards={[]} />);
    expect(screen.queryByTestId('attempt-row-select-all')).toBeNull();
  });
});

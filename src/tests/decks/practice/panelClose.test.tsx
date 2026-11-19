// #1780: each panel of the practice table carries an X at its top right, `panel-close`, that
// closes it as a tap on the backdrop does, so a large panel is easy to close on a touch screen.
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDndContext: () => ({ active: null, over: null }),
}));

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import GameLogPanel from '../../../app/decks/practice/GameLogPanel';
import DecklistPanel from '../../../app/decks/practice/DecklistPanel';
import ControlsPanel from '../../../app/decks/practice/ControlsPanel';
import HomeScreenHelp from '../../../app/decks/practice/HomeScreenHelp';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const makeCard = (n: number, type = 'personnel'): CardInstance =>
  ({
    id: `card-${n}`,
    stopped: false,
    card: {
      collectorsinfo: `1U0${n}`,
      originalName: `Card ${n}`,
      type,
      name: `card ${n}`,
      imagefile: `card_${n}`,
    },
  }) as unknown as CardInstance;

describe('Practice table: the close X of a card list panel (#1780)', () => {
  it('shows the X on a panel with no controls, and a tap closes it', () => {
    const onClose = jest.fn();
    render(<CardListPanel location="core" cards={[makeCard(1, 'event')]} onClose={onClose} selectedIds={[]} onToggleSelect={() => {}} />);
    expect(screen.queryByTestId('panel-controls')).toBeNull();
    const close = screen.getByTestId('panel-close');
    expect(close).toHaveAttribute('aria-label', 'Close panel');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('puts the X on the line of the controls, after them, outside the scrolling grid', () => {
    const onClose = jest.fn();
    render(
      <CardListPanel
        location="awayTeam"
        cards={[makeCard(1), makeCard(2)]}
        onClose={onClose}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onAttempt={() => {}}
      />
    );
    const close = screen.getByTestId('panel-close');
    const line = screen.getByTestId('panel-top-line');
    expect(line).toContainElement(close);
    expect(line).toContainElement(screen.getByTestId('panel-controls'));
    expect(screen.getByTestId('panel-controls')).not.toContainElement(close);
    expect(screen.getByTestId('card-list-panel-awayTeam')).not.toContainElement(close);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the X with the panel during a drag', () => {
    const { container } = render(
      <CardListPanel location="core" cards={[makeCard(1, 'event')]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} hidden />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.visibility).toBe('hidden');
    expect(wrapper).toContainElement(screen.getByTestId('panel-close'));
  });
});

describe('Practice table: the close X of the modals (#1780)', () => {
  const cases: [string, (onClose: () => void) => React.ReactElement, string][] = [
    ['the game log', (onClose) => <GameLogPanel log={[]} onClose={onClose} />, 'Close game log'],
    ['the decklist', (onClose) => <DecklistPanel deck={{}} onClose={onClose} />, 'Close decklist'],
    ['the Controls panel', (onClose) => <ControlsPanel onClose={onClose} rows={[]} />, 'Close controls'],
    ['the home screen help', (onClose) => <HomeScreenHelp onClose={onClose} />, 'Close home screen instructions'],
  ];

  it.each(cases)('%s has the X inside its dialog, and a tap closes it', (_name, make) => {
    const onClose = jest.fn();
    render(make(onClose));
    const close = within(screen.getByRole('dialog')).getByTestId('panel-close');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(cases)('%s keeps its backdrop, which still closes it', (_name, make, backdropName) => {
    const onClose = jest.fn();
    render(make(onClose));
    fireEvent.click(screen.getByRole('button', { name: backdropName }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

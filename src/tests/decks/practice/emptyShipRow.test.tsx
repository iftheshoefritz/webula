let mockOverId: string | null = null;
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: ({ id }: { id: string }) => ({ setNodeRef: () => {}, isOver: id === mockOverId }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import MissionRow from '../../../app/decks/practice/MissionRow';
import { DraggedCardTypeProvider } from '../../../app/decks/practice/DraggedCardTypeContext';
import { CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';

const card = (id: string, name: string, type: string): CardInstance => ({
  id,
  card: { name, imagefile: id, type },
  face: 'up',
});

const slot = (ships: CardInstance[]): MissionSlot => ({
  mission: card('mission-0', 'A Mission', 'mission'),
  ships,
  awayTeam: [],
  underMission: [],
});

// #947: an empty ship row shows no outline and no `valid` ring. The mission card is the visible
// target for a ship, and the row stays a drop target that shows `over` once a ship is over it.
describe('an empty ship row', () => {
  const renderRow = (ships: CardInstance[], draggedType: string | null) =>
    render(
      <DraggedCardTypeProvider value={draggedType}>
        <MissionRow
          missions={[slot(ships)]}
          onOpenPile={() => {}}
          onShipClick={() => {}}
          onOpenShipRow={() => {}}
          onOpenPlacedOn={() => {}}
        />
      </DraggedCardTypeProvider>
    );
  const row = () => document.querySelector('[data-zone="ship-row-0"]') as HTMLElement;

  afterEach(() => {
    mockOverId = null;
  });

  it.each([
    ['with no drag', null],
    ['during a ship drag', 'ship'],
  ])('shows no outline and no highlight %s', (_label, draggedType) => {
    renderRow([], draggedType);

    expect(row()).not.toBeNull();
    expect(row().querySelector('.border-dashed')).toBeNull();
    expect(row()).not.toHaveAttribute('data-highlight');
    expect(row().className).not.toMatch(/ring-/);
  });

  it('keeps its height', () => {
    renderRow([], null);
    expect(parseFloat(row().style.height)).toBeGreaterThan(0);
  });

  it('shows the `over` highlight when a ship is over it', () => {
    mockOverId = 'ship-row-0';
    renderRow([], 'ship');

    expect(row()).toHaveAttribute('data-highlight', 'over');
  });

  it('a ship row that holds ships keeps the faint `valid` ring during a ship drag', () => {
    renderRow([card('ship-1', 'A Ship', 'ship')], 'ship');

    expect(row()).toHaveAttribute('data-highlight', 'valid');
  });
});

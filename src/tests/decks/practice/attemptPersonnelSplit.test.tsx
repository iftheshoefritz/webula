jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render } from '@testing-library/react';
import AttemptPersonnelRow from '../../../app/decks/practice/AttemptPersonnelRow';
import { CardInstance } from '../../../app/decks/practice/tableReducer';

const personnel = (count: number): CardInstance[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `card-${i}`,
    card: { name: `Personnel ${i}`, imagefile: `p${i}`, type: 'personnel' },
    face: 'up',
  }));

// Issue #1178: the row fills its first line with the cards the layout gives it, and the second line
// takes the rest, so 8 cards with room for 6 to a line show as 6 and 2, side by side.
describe('AttemptPersonnelRow lines (#1178)', () => {
  const renderRow = (count: number, rows: number, firstRow: number, width: number) =>
    render(
      <AttemptPersonnelRow
        dropId="attempt-away-team-0"
        landedKey="awayTeam-0"
        kind="mission"
        label="Away team"
        cards={personnel(count)}
        cardWidth={40}
        rows={rows}
        firstRow={firstRow}
        width={width}
        selectedIds={[]}
        onToggleSelect={() => {}}
        onSetStopped={() => {}}
        onShuffle={() => {}}
      />
    );
  // The ids of the cards in each line, and the left of each card in its line.
  const lines = () =>
    Array.from(document.querySelector('[data-zone="attempt-away-team-0"]')!.children)
      .filter((line) => line.querySelector('[data-card-id]'))
      .map((line) =>
        Array.from(line.children).map((cell) => ({
          id: cell.querySelector('[data-card-id]')!.getAttribute('data-card-id'),
          left: (cell as HTMLElement).style.left,
        }))
      );

  it('puts 6 cards in the first line and 2 in the second, with no overlap', () => {
    renderRow(8, 2, 6, 240);
    const [first, second] = lines();
    expect(first.map((c) => c.id)).toEqual(['card-0', 'card-1', 'card-2', 'card-3', 'card-4', 'card-5']);
    expect(second.map((c) => c.id)).toEqual(['card-6', 'card-7']);
    expect(first.map((c) => c.left)).toEqual(['0px', '40px', '80px', '120px', '160px', '200px']);
    expect(second.map((c) => c.left)).toEqual(['0px', '40px']);
  });

  it('keeps every card in one line when the layout gives 1 row', () => {
    renderRow(4, 1, 4, 160);
    expect(lines().map((line) => line.length)).toEqual([4]);
  });
});

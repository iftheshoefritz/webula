// Issue #1191: the Draw dilemma button and the count of the dilemmas drawn, in the attempt strip of
// the dilemma choice.
jest.mock('@dnd-kit/core', () => ({
  ...jest.requireActual('@dnd-kit/core'),
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import { Attempt, MissionSlot } from '../../../app/decks/practice/tableReducer';
import { computeAttemptChoiceLayout, computeAttemptLayout } from '../../../app/decks/practice/tableScale';

const slot: MissionSlot = {
  mission: { id: 'm2', card: { name: 'Bilana System', originalName: 'Bilana System', imagefile: 'm2' }, face: 'up' } as any,
  ships: [],
  awayTeam: [],
  underMission: [],
};

const face = computeAttemptLayout(667, 280, false, 0, 1);
const sizes = { ...face, choice: computeAttemptChoiceLayout(667, 280, false, 0, 1, face) };

function layout(attempt: Attempt, { canDrawDilemma = true, onDrawDilemma = () => {} } = {}) {
  const noop = () => {};
  return (
    <AttemptLayout
      attempt={attempt}
      slot={slot}
      sizes={sizes}
      personnelCount={12}
      desktop={false}
      dilemmaStack={null}
      layoutRef={noop}
      stripRef={noop}
      onViewFullTable={noop}
      onEndAttempt={noop}
      onOpenPile={noop}
      onShipClick={noop}
      onOpenShipRow={noop}
      onOpenPlacedOn={noop}
      onFlipMission={noop}
      onSetMissionCompleted={noop}
      selectedIds={[]}
      onToggleSelect={noop}
      onSetStopped={noop}
      onShuffle={noop}
      canDrawDilemma={canDrawDilemma}
      onDrawDilemma={onDrawDilemma}
      onSetPhase={noop}
    />
  );
}

const renderLayout = (...args: Parameters<typeof layout>) => render(layout(...args));

const choose = (drawn: number): Attempt => ({ missionIndex: 2, personnel: 12, subtract: 3, phase: 'choose', drawn });

describe('AttemptLayout: the Draw dilemma button (#1191)', () => {
  it('shows the button and the count, which follows attempt.drawn, in the dilemma choice', () => {
    const { rerender } = renderLayout(choose(0));
    expect(screen.getByTestId('attempt-draw-dilemma')).toBeEnabled();
    expect(screen.getByTestId('attempt-drawn-count')).toHaveTextContent(/^Drawn 0 of 9$/);
    rerender(layout(choose(3)));
    expect(screen.getByTestId('attempt-drawn-count')).toHaveTextContent(/^Drawn 3 of 9$/);
    expect(screen.getByTestId('attempt-drawn-count')).not.toHaveAttribute('data-over');
  });

  it('shows the count in the warning style past N, and the button still draws', () => {
    const onDrawDilemma = jest.fn();
    renderLayout(choose(10), { onDrawDilemma });
    const count = screen.getByTestId('attempt-drawn-count');
    expect(count).toHaveTextContent(/^Drawn 10 of 9$/);
    expect(count).toHaveAttribute('data-over', 'true');
    expect(count).toHaveClass('text-amber-400');
    fireEvent.click(screen.getByTestId('attempt-draw-dilemma'));
    expect(onDrawDilemma).toHaveBeenCalledTimes(1);
  });

  it('does not mark the count at exactly N', () => {
    renderLayout(choose(9));
    expect(screen.getByTestId('attempt-drawn-count')).not.toHaveAttribute('data-over');
  });

  it('disables the button while the dilemma pile is empty', () => {
    const onDrawDilemma = jest.fn();
    renderLayout(choose(2), { canDrawDilemma: false, onDrawDilemma });
    const button = screen.getByTestId('attempt-draw-dilemma');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onDrawDilemma).not.toHaveBeenCalled();
  });

  it('shows neither the button nor the count in the facing phase', () => {
    renderLayout({ ...choose(4), phase: 'face' });
    expect(screen.queryByTestId('attempt-draw-dilemma')).toBeNull();
    expect(screen.queryByTestId('attempt-drawn-count')).toBeNull();
  });
});

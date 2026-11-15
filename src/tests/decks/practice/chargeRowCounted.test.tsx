import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChargeChip } from '../../../app/decks/practice/TurnCounters';
import type { LogCharge } from '../../../app/decks/practice/gameLog';

// The stepper of a counted choice in the chip and the list (#1695).

const target = { entry: 0, move: 0, card: 0 };
const charge = (choiceCount: number, cost: number): LogCharge => ({
  target,
  card: 'Tacking Into the Wind',
  draw: false,
  cost,
  source: {
    title: 'Tacking Into the Wind',
    reason: '−2 for each completed mission the opponent commands',
    choice: { label: 'Completed missions of the opponent', step: 2, max: 2, base: 4 },
  },
  choiceCount,
});

describe('a counted choice in the charge row (#1695)', () => {
  it('shows the stepper in place of the choice button, minus disabled at 0', () => {
    const onCorrect = jest.fn();
    render(<ChargeChip charges={[charge(0, 4)]} onCorrect={onCorrect} onRaiseLimit={jest.fn()} />);
    expect(screen.queryByTestId('charge-choice')).toBeNull();
    expect(screen.getByTestId('charge-choice-count')).toHaveTextContent('Completed missions of the opponent: 0');
    expect(screen.getByTestId('charge-choice-minus')).toBeDisabled();
    fireEvent.click(screen.getByTestId('charge-choice-plus'));
    expect(onCorrect).toHaveBeenCalledWith(target, 2, 'Tacking Into the Wind', 1);
  });

  it('disables plus at the max, and minus steps back', () => {
    const onCorrect = jest.fn();
    render(<ChargeChip charges={[charge(2, 0)]} onCorrect={onCorrect} onRaiseLimit={jest.fn()} />);
    expect(screen.getByTestId('charge-choice-plus')).toBeDisabled();
    fireEvent.click(screen.getByTestId('charge-choice-minus'));
    expect(onCorrect).toHaveBeenCalledWith(target, 2, 'Tacking Into the Wind', 1);
  });

  it('shows no choice for a malformed counted choice', () => {
    const broken = { ...charge(0, 4), source: { title: 'X', reason: 'y', choice: { label: 'x', step: 2, max: 2 } } } as LogCharge;
    render(<ChargeChip charges={[broken]} onCorrect={jest.fn()} onRaiseLimit={jest.fn()} />);
    expect(screen.queryByTestId('charge-choice')).toBeNull();
    expect(screen.queryByTestId('charge-choice-count')).toBeNull();
  });
});

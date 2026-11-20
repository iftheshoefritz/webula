import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChargeChip } from '../../../app/decks/practice/TurnCounters';
import type { LogCharge } from '../../../app/decks/practice/gameLog';

// A long title gives way to the cost in the charge row (#1797).

const longTitle = 'U.S.S. Enterprise-E, Flagship of the Federation';
const charge: LogCharge = { target: { entry: 0, move: 0, card: 0 }, card: longTitle, draw: false, cost: 6 };

describe('the charge row with a long title (#1797)', () => {
  it('truncates the title alone and keeps the cost outside it', () => {
    render(<ChargeChip charges={[charge]} onCorrect={jest.fn()} onRaiseLimit={jest.fn()} />);
    const label = screen.getByTestId('charge-label');
    const cost = screen.getByTestId('charge-cost');
    expect(label).toHaveTextContent(longTitle);
    expect(label).toHaveClass('truncate');
    expect(label).toHaveAttribute('title', longTitle);
    expect(label.contains(cost)).toBe(false);
    expect(cost.closest('.truncate')).toBeNull();
    expect(cost).toHaveClass('shrink-0');
    expect(cost).toHaveTextContent('6');
    expect(screen.getByTestId('charge-row')).toHaveTextContent(`${longTitle} 6`);
  });
});

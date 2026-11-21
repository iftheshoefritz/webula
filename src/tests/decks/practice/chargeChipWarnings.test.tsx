import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChargeChip } from '../../../app/decks/practice/TurnCounters';
import type { LogCharge } from '../../../app/decks/practice/gameLog';

// The warnings of the play rules in the charge chip (#1821): a line each, with or without the charges.

const charge: LogCharge = { target: { entry: 0, move: 0, card: 0 }, card: 'Data', draw: false, cost: 3 };

describe('the warnings in the charge chip (#1821)', () => {
  it('shows each warning below the charge, with Counters on', () => {
    render(
      <ChargeChip
        charges={[charge]}
        warnings={[{ rule: 'unique', title: 'Data' }]}
        onCorrect={jest.fn()}
        onRaiseLimit={jest.fn()}
      />
    );
    expect(screen.getByText('Data')).toBeInTheDocument();
    const line = screen.getByTestId('charge-warning');
    expect(line).toHaveTextContent('Unique: Data is already in play');
    expect(line).toHaveAttribute('data-rule', 'unique');
  });

  it('shows the warnings alone, with Counters off', () => {
    render(
      <ChargeChip
        charges={[]}
        warnings={[{ rule: 'limitPerShip', title: 'Inspiring Leader', place: 'Attack Ship' }]}
        onCorrect={jest.fn()}
        onRaiseLimit={jest.fn()}
      />
    );
    expect(screen.getByTestId('charge-chip')).toBeInTheDocument();
    expect(screen.queryByTestId('charge-free')).toBeNull();
    expect(screen.getByTestId('charge-warning')).toHaveTextContent('Limit one per ship: Inspiring Leader is already on Attack Ship');
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TurnCounterButton, TurnCountersList, limitPartsText } from '../../../app/decks/practice/TurnCounters';

// The counter of the turn's counters (#1607).
describe('TurnCounterButton', () => {
  it('reads spent/limit', () => {
    render(<TurnCounterButton counters={{ spent: 4, limit: 7, grants: [] }} className="" onOpen={() => {}} />);
    const counter = screen.getByTestId('turn-counters');
    expect(counter).toHaveTextContent('4/7');
    expect(counter).not.toHaveAttribute('data-over');
  });

  it('goes on counting past the limit, in amber', () => {
    render(<TurnCounterButton counters={{ spent: 12, limit: 7, grants: [] }} className="" onOpen={() => {}} />);
    const counter = screen.getByTestId('turn-counters');
    expect(counter).toHaveTextContent('12/7');
    expect(counter).toHaveAttribute('data-over', 'true');
    expect(counter.className).toMatch(/text-amber-300/);
  });
});

describe('TurnCounterButton with a grant (#1655)', () => {
  it('names the grants to the limit', () => {
    const grants = [{ title: 'Surprise Party', amount: 1, reason: 'in your core' }];
    render(<TurnCounterButton counters={{ spent: 0, limit: 8, grants }} className="" onOpen={() => {}} />);
    const counter = screen.getByTestId('turn-counters');
    expect(counter).toHaveTextContent('0/8');
    expect(counter).toHaveAttribute('aria-label', 'Counters 0 of 8 (Surprise Party +1)');
    expect(counter).toHaveAttribute('data-granted', 'true');
  });
});

describe('the counters under a cap and with a choice of the turn (#1704)', () => {
  const grants = [{ title: 'Surprise Party', amount: 1, reason: 'in your core' }];
  const caps = [{ title: 'Code of the Ushaan', amount: 7, reason: 'in your core' }];

  it('names the cap on the counter and in the list, and disables the plus', () => {
    render(<TurnCounterButton counters={{ spent: 0, limit: 7, grants, caps, uncapped: 8 }} className="" onOpen={() => {}} />);
    expect(screen.getByTestId('turn-counters')).toHaveAttribute(
      'aria-label',
      'Counters 0 of 7 (Surprise Party +1), capped at 7 (Code of the Ushaan)'
    );
    expect(limitPartsText({ spent: 0, limit: 7, grants, caps, uncapped: 8 })).toBe('7 + 1 Surprise Party, capped at 7 (Code of the Ushaan)');
    expect(limitPartsText({ spent: 0, limit: 5, grants: [], caps, uncapped: 5 })).toBeNull();
  });

  it('shows a choice of the turn as a button, disabled once taken', () => {
    const onTurnChoice = jest.fn();
    const choices = [{ title: 'Gaila', label: 'Equipment from Ferenginar: +4', limit: 4, taken: false }];
    const props = { charges: [], onCorrect: () => {}, onRaiseLimit: () => {}, onAdjustLimit: () => {}, onClose: () => {}, onTurnChoice };
    const { rerender } = render(<TurnCountersList {...props} counters={{ spent: 0, limit: 7, grants: [], caps, uncapped: 7, choices }} />);
    expect(screen.getByTestId('turn-counters-limit-plus')).toBeDisabled();
    expect(screen.getByTestId('turn-counters-limit-parts')).toHaveTextContent('7, capped at 7 (Code of the Ushaan)');
    const choice = screen.getByTestId('turn-choice');
    expect(choice).toHaveAttribute('data-source', 'Gaila');
    expect(choice).toHaveTextContent('Gaila: Equipment from Ferenginar: +4');
    fireEvent.click(choice);
    expect(onTurnChoice).toHaveBeenCalledWith(4, 'Gaila');
    rerender(<TurnCountersList {...props} counters={{ spent: 0, limit: 11, grants: [], choices: [{ ...choices[0], taken: true }] }} />);
    expect(screen.getByTestId('turn-choice')).toBeDisabled();
    expect(screen.getByTestId('turn-choice')).toHaveTextContent('(taken)');
    expect(screen.getByTestId('turn-counters-limit-plus')).not.toBeDisabled();
  });
});

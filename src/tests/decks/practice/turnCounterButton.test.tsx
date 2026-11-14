import React from 'react';
import { render, screen } from '@testing-library/react';
import { TurnCounterButton } from '../../../app/decks/practice/TurnCounters';

// The counter of the turn's counters (#1607).
describe('TurnCounterButton', () => {
  it('reads spent/limit', () => {
    render(<TurnCounterButton counters={{ spent: 4, limit: 7, grants: [] }} segment="playAndDraw" className="" onOpen={() => {}} />);
    const counter = screen.getByTestId('turn-counters');
    expect(counter).toHaveTextContent('4/7');
    expect(counter).not.toHaveAttribute('data-over');
    expect(counter).not.toHaveAttribute('data-unspent');
  });

  it('goes on counting past the limit, in amber', () => {
    render(<TurnCounterButton counters={{ spent: 12, limit: 7, grants: [] }} segment="playAndDraw" className="" onOpen={() => {}} />);
    const counter = screen.getByTestId('turn-counters');
    expect(counter).toHaveTextContent('12/7');
    expect(counter).toHaveAttribute('data-over', 'true');
    expect(counter.className).toMatch(/text-amber-300/);
  });

  it('marks the counters left unspent outside play and draw', () => {
    render(<TurnCounterButton counters={{ spent: 5, limit: 7, grants: [] }} segment="orders" className="" onOpen={() => {}} />);
    const counter = screen.getByTestId('turn-counters');
    expect(counter).toHaveAttribute('data-unspent', 'true');
    expect(counter).toHaveAttribute('aria-label', 'Counters 5 of 7, 2 counters unspent');
  });
});

describe('TurnCounterButton with a grant (#1655)', () => {
  it('names the grants to the limit', () => {
    const grants = [{ title: 'Surprise Party', amount: 1, reason: 'in your core' }];
    render(<TurnCounterButton counters={{ spent: 0, limit: 8, grants }} segment="playAndDraw" className="" onOpen={() => {}} />);
    const counter = screen.getByTestId('turn-counters');
    expect(counter).toHaveTextContent('0/8');
    expect(counter).toHaveAttribute('aria-label', 'Counters 0 of 8 (Surprise Party +1)');
    expect(counter).toHaveAttribute('data-granted', 'true');
  });
});

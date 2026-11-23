import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TriggerOffers } from '../../../app/decks/practice/TriggerOffers';
import type { TriggerOffer } from '../../../app/decks/practice/triggers';
import { TRIGGER_ROWS } from '../../../lib/triggers';

// Issue #1904: the chips of the trigger offers, Use and Skip, and Escape as a collapse only.

const row = (title: string) => TRIGGER_ROWS.find((r) => r.title === title)!;
const offer = (title: string, source: string): TriggerOffer => ({
  target: { entry: 3, source, row: 0, event: 0 },
  row: row(title),
  event: { kind: 'missionCompleted', missionIndex: 1, quadrant: 'g', type: 'p', requirements: '', involved: [] },
  source: null,
  name: title,
});

describe('TriggerOffers (#1904)', () => {
  it('shows one chip per offer, and Use and Skip send that offer', () => {
    const onUse = jest.fn();
    const onSkip = jest.fn();
    const offers = [offer('Distant Exploration', 'a'), offer('Mission Accomplished', 'b')];
    render(<TriggerOffers offers={offers} chipShown={false} hidden={false} escapeActive onUse={onUse} onSkip={onSkip} />);
    const chips = screen.getAllByTestId('trigger-offer');
    expect(chips.map((c) => c.getAttribute('data-trigger-title'))).toEqual(['Distant Exploration', 'Mission Accomplished']);
    fireEvent.click(screen.getAllByTestId('trigger-offer-use')[1]);
    expect(onUse).toHaveBeenCalledWith(offers[1]);
    fireEvent.click(screen.getAllByTestId('trigger-offer-skip')[0]);
    expect(onSkip).toHaveBeenCalledWith(offers[0]);
  });

  it('collapses on Escape, skips nothing, and opens again on a tap', () => {
    const onSkip = jest.fn();
    render(<TriggerOffers offers={[offer('Distant Exploration', 'a')]} chipShown={false} hidden={false} escapeActive onUse={jest.fn()} onSkip={onSkip} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('trigger-offer')).toBeNull();
    expect(onSkip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('trigger-offers-collapsed'));
    expect(screen.getByTestId('trigger-offer')).toBeTruthy();
  });

  it('renders nothing with no offer', () => {
    const { container } = render(<TriggerOffers offers={[]} chipShown={false} hidden={false} escapeActive onUse={jest.fn()} onSkip={jest.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});

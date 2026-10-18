// Issue #1163: the Attempt button of a card list panel, the attempt popup, and the overlay on the
// attempted mission card, which shows Back to attempt on the full table (#1164).
jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import MissionRow from '../../../app/decks/practice/MissionRow';
import { AttemptDialog } from '../../../app/decks/practice/AttemptPanel';
import { MissionSlot } from '../../../app/decks/practice/tableReducer';

const person = { id: 'a', face: 'up', card: { collectorsinfo: 'a', originalName: 'a', type: 'personnel', name: 'a', imagefile: 'a' } } as any;

describe('CardListPanel: the Attempt button (#1163)', () => {
  it('shows the button when given onAttempt, and calls it', () => {
    const onAttempt = jest.fn();
    render(<CardListPanel location="awayTeam" cards={[person]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} onAttempt={onAttempt} />);
    fireEvent.click(screen.getByTestId('attempt-button'));
    expect(onAttempt).toHaveBeenCalled();
  });

  it('shows no button without onAttempt', () => {
    render(<CardListPanel location="crew" cards={[person]} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} />);
    expect(screen.queryByTestId('attempt-button')).toBeNull();
  });
});

describe('AttemptDialog (#1163)', () => {
  it('shows the defaults and draw/spend N, live and floored at 0, and starts with the numbers shown', () => {
    const onStart = jest.fn();
    render(<AttemptDialog mission="Moab IV" personnel={20} subtract={0} onStart={onStart} onCancel={() => {}} />);
    expect(screen.getByTestId('attempt-personnel')).toHaveValue('20');
    expect(screen.getByTestId('attempt-result')).toHaveTextContent('draw/spend 20');
    fireEvent.change(screen.getByTestId('attempt-subtract'), { target: { value: '25' } });
    expect(screen.getByTestId('attempt-result')).toHaveTextContent('draw/spend 0');
    fireEvent.click(screen.getByTestId('attempt-start'));
    expect(onStart).toHaveBeenCalledWith(20, 25);
  });

  it('cancels with nothing started', () => {
    const onStart = jest.fn();
    const onCancel = jest.fn();
    render(<AttemptDialog mission="Moab IV" personnel={2} subtract={1} onStart={onStart} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe('MissionRow: the attempt overlay on the full table (#1164)', () => {
  const slot = (id: string): MissionSlot => ({
    mission: { id, card: { name: id, originalName: id, imagefile: id }, face: 'up' },
    ships: [],
    awayTeam: [],
    underMission: [],
  });

  it('shows Back to attempt, and only that, on the attempted mission only', () => {
    const onBackToAttempt = jest.fn();
    render(
      <MissionRow
        missions={[slot('m0'), slot('m1')]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
        attempt={{ missionIndex: 1, personnel: 7, subtract: 2 }}
        onBackToAttempt={onBackToAttempt}
      />
    );
    expect(screen.queryByTestId('attempt-overlay-0')).toBeNull();
    expect(screen.getByTestId('attempt-overlay-1')).toHaveTextContent(/^Back to attempt$/);
    expect(screen.queryByTestId('attempt-done')).toBeNull();
    fireEvent.click(screen.getByTestId('attempt-back-to-attempt'));
    expect(onBackToAttempt).toHaveBeenCalled();
  });
});

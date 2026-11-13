// Issue #1636: a ship that used range this turn shows the range used of its printed Range, "4/8",
// on its card, on the ship rows of the full table and on the ships of the attempt layout.
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import MissionRow from '../../../app/decks/practice/MissionRow';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import { RangeUsedProvider } from '../../../app/decks/practice/RangeUsedContext';
import { rangeUsedDisplay } from '../../../app/decks/practice/shipRange';
import type { Attempt, CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';
import { computeAttemptChoiceLayout, computeAttemptLayout } from '../../../app/decks/practice/tableScale';

const ship: CardInstance = {
  id: 'ship-1',
  card: { name: 'Enterprise', originalName: 'Enterprise', type: 'ship', imagefile: 'ship-1', range: '8' },
  face: 'up',
} as any;

const slot: MissionSlot = {
  mission: {
    id: 'm0',
    card: { name: 'Bilana System', originalName: 'Bilana System', type: 'mission', imagefile: 'm0' },
    face: 'up',
  } as any,
  ships: [ship],
  awayTeam: [],
  underMission: [],
};

describe('rangeUsedDisplay (#1636)', () => {
  it('reads the range used of the printed Range', () => {
    expect(rangeUsedDisplay(ship, { 'ship-1': 4 })).toEqual({ used: 4, total: 8, text: '4/8', over: false });
  });

  it('is over past the printed Range', () => {
    expect(rangeUsedDisplay(ship, { 'ship-1': 12 })).toMatchObject({ text: '12/8', over: true });
  });

  it('is nothing for a ship with no entry', () => {
    expect(rangeUsedDisplay(ship, { other: 4 })).toBeNull();
    expect(rangeUsedDisplay(ship, undefined)).toBeNull();
  });

  it('reads the Range on the table when it has one (#1635)', () => {
    expect(rangeUsedDisplay(ship, { 'ship-1': 12 }, { 'ship-1': 13 })).toEqual({ used: 12, total: 13, text: '12/13', over: false });
  });
});

describe('the range used on a ship card of the ship row (#1636)', () => {
  const renderRow = (rangeUsed: Record<string, number> | undefined, desktop: boolean, ranges?: Record<string, number>) =>
    render(
      <RangeUsedProvider value={{ used: rangeUsed, ranges }}>
        <MissionRow
          missions={[slot]}
          onOpenPile={() => {}}
          onShipClick={() => {}}
          onOpenShipRow={() => {}}
          onOpenPlacedOn={() => {}}
          desktop={desktop}
        />
      </RangeUsedProvider>
    );

  it.each([false, true])('shows "4/8" with an entry (desktop %s)', (desktop) => {
    renderRow({ 'ship-1': 4 }, desktop);
    const pill = screen.getByTestId('ship-range-used-ship-1');
    expect(pill).toHaveTextContent('4/8');
    expect(pill).not.toHaveAttribute('data-over');
    expect(pill).toHaveAttribute('aria-label', 'Enterprise used 4 of 8 range');
    expect(pill.closest('[data-zone="crew-ship-1"]')).not.toBeNull();
  });

  it.each([false, true])('shows nothing with no entry (desktop %s)', (desktop) => {
    renderRow(undefined, desktop);
    expect(screen.queryByTestId('ship-range-used-ship-1')).toBeNull();
  });

  it('marks a ship over its Range', () => {
    renderRow({ 'ship-1': 12 }, false);
    const pill = screen.getByTestId('ship-range-used-ship-1');
    expect(pill).toHaveTextContent('12/8');
    expect(pill).toHaveAttribute('data-over', 'true');
  });

  it('reads the Range on the table, and is over only past it (#1635)', () => {
    renderRow({ 'ship-1': 12 }, false, { 'ship-1': 13 });
    const pill = screen.getByTestId('ship-range-used-ship-1');
    expect(pill).toHaveTextContent('12/13');
    expect(pill).not.toHaveAttribute('data-over');
  });
});

describe('the range used on a ship of the attempt layout (#1636)', () => {
  it.each(['face', 'choose'] as const)('shows on the ships of attempt-ships (%s)', (phase) => {
    const attempt: Attempt = { missionIndex: 0, shipId: 'ship-1', personnel: 5, subtract: 0, phase, drawn: 0 } as Attempt;
    const face = computeAttemptLayout(667, 280, false, 0, 1, { count: 5, space: true });
    const sizes = { ...face, choice: computeAttemptChoiceLayout(667, 280, false, 0, 1, face, true) };
    const noop = () => {};
    render(
      <RangeUsedProvider value={{ used: { 'ship-1': 4 } }}>
        <AttemptLayout
          attempt={attempt}
          slot={slot}
          sizes={sizes}
          personnelCount={5}
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
          moveDestinations={[]}
          onMoveSelection={noop}
          canDrawDilemma
          onDrawDilemma={noop}
          onSetPhase={noop}
        />
      </RangeUsedProvider>
    );
    const ships = screen.getByTestId('attempt-ships');
    expect(ships.querySelector('[data-testid="ship-range-used-ship-1"]')).toHaveTextContent('4/8');
  });
});

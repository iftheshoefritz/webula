// Issue #1636: a ship that moved this turn shows the range it has left, one number, in place of its
// Range: in the RNG box of `ShipOverlay` on the cropped card, in a box over the printed Range box of
// the whole card on the desktop table and in the crew panel, and on the ships of the attempt layout.
// Past its Range the number is below 0 and red. Next turn clears it.
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import MissionRow from '../../../app/decks/practice/MissionRow';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import { RANGE_OVER_FILL } from '../../../app/decks/practice/PersonnelOverlay';
import { RangeUsedProvider } from '../../../app/decks/practice/RangeUsedContext';
import { rangeUsedDisplay } from '../../../app/decks/practice/shipRange';
import {
  initialTableState,
  MISSION_SLOTS,
  tableReducer,
  type Attempt,
  type CardInstance,
  type MissionSlot,
  type TableState,
} from '../../../app/decks/practice/tableReducer';
import { computeAttemptChoiceLayout, computeAttemptLayout } from '../../../app/decks/practice/tableScale';

const ship: CardInstance = {
  id: 'ship-1',
  card: { name: 'Enterprise', originalName: 'Enterprise', type: 'ship', imagefile: 'ship-1', range: '8', weapons: '7', shields: '8' },
  face: 'up',
} as any;

const mission = (id: string, name: string): CardInstance =>
  ({ id, card: { name, originalName: name, type: 'mission', imagefile: id, span: '2' }, face: 'up' }) as any;

const slot: MissionSlot = { mission: mission('m0', 'Bilana System'), ships: [ship], awayTeam: [], underMission: [] };

describe('rangeUsedDisplay (#1636)', () => {
  it('reads the range left of the printed Range', () => {
    expect(rangeUsedDisplay(ship, { 'ship-1': 4 })).toEqual({ used: 4, total: 8, left: 4, text: '4', over: false });
  });

  it('goes below 0 past the printed Range', () => {
    expect(rangeUsedDisplay(ship, { 'ship-1': 10 })).toMatchObject({ left: -2, text: '-2', over: true });
  });

  it('reads the Range of `ranges` when it has one', () => {
    expect(rangeUsedDisplay(ship, { 'ship-1': 10 }, { 'ship-1': 13 })).toMatchObject({ total: 13, text: '3', over: false });
  });

  it('is nothing for a ship with no entry', () => {
    expect(rangeUsedDisplay(ship, { other: 4 })).toBeNull();
    expect(rangeUsedDisplay(ship, undefined)).toBeNull();
  });
});

const renderRow = (
  missions: MissionSlot[],
  rangeUsed: Record<string, number> | undefined,
  desktop: boolean,
  ranges?: Record<string, number>
) =>
  render(
    <RangeUsedProvider value={{ used: rangeUsed, ranges }}>
      <MissionRow
        missions={missions}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
        desktop={desktop}
      />
    </RangeUsedProvider>
  );

describe('the RNG value of a cropped ship card (#1636)', () => {
  // A move of the ship from Bilana System to Angel I, both of span 2, and the next turn, through the
  // reducer, as the page does.
  const start: TableState = {
    ...initialTableState,
    missions: Array.from({ length: MISSION_SLOTS }, (_, i) => ({
      mission: i === 0 ? mission('m0', 'Bilana System') : i === 1 ? mission('m1', 'Angel I') : null,
      ships: i === 0 ? [ship] : [],
      awayTeam: [],
      underMission: [],
    })),
  };
  const moved = tableReducer(start, { type: 'move', id: 'ship-1', to: { zone: 'shipRow', missionIndex: 1 } });

  const range = () => within(screen.getByTestId('ship-overlay')).getByTestId('ship-range');

  it('shows the printed Range before a move', () => {
    renderRow(start.missions, start.rangeUsed, false);
    expect(range()).toHaveTextContent(/^8$/);
    expect(range()).not.toHaveAttribute('data-over');
    expect(screen.getByTestId('ship-attributes')).toHaveAttribute('aria-label', 'Range 8, Weapons 7, Shields 8');
  });

  it('shows the range left after a move, and no pill', () => {
    expect(moved.rangeUsed).toEqual({ 'ship-1': 4 });
    renderRow(moved.missions, moved.rangeUsed, false);
    expect(range()).toHaveTextContent(/^4$/);
    expect(range()).toHaveAttribute('fill', '#fff');
    expect(screen.getByTestId('ship-attributes')).toHaveAttribute('aria-label', 'Range 4 left of 8, Weapons 7, Shields 8');
    expect(screen.queryByTestId('ship-range-used-ship-1')).toBeNull();
  });

  it('shows a number below 0, in red, past the Range', () => {
    renderRow(moved.missions, { 'ship-1': 10 }, false);
    expect(range()).toHaveTextContent(/^-2$/);
    expect(range()).toHaveAttribute('data-over', 'true');
    expect(range()).toHaveAttribute('fill', RANGE_OVER_FILL);
  });

  it('counts the range left from the Range on the table (#1635)', () => {
    renderRow(moved.missions, moved.rangeUsed, false, { 'ship-1': 13 });
    expect(range()).toHaveTextContent(/^9$/);
    expect(screen.getByTestId('ship-attributes')).toHaveAttribute('aria-label', 'Range 9 left of 13, Weapons 7, Shields 8');
  });

  it('shows the printed Range again after Next turn', () => {
    const next = tableReducer(moved, { type: 'nextTurn' });
    renderRow(next.missions, next.rangeUsed, false);
    expect(range()).toHaveTextContent(/^8$/);
  });
});

describe('the range left on the whole ship card of the desktop table (#1636)', () => {
  it('shows nothing over the printed Range before a move', () => {
    renderRow([slot], undefined, true);
    expect(screen.queryByTestId('ship-overlay')).toBeNull();
    expect(screen.queryByTestId('ship-range-left')).toBeNull();
  });

  it('shows the range left in a box once the ship has moved', () => {
    renderRow([slot], { 'ship-1': 4 }, true);
    const box = screen.getByTestId('ship-range-left');
    expect(box).toHaveAttribute('aria-label', 'Range 4 left of 8');
    expect(within(box as unknown as HTMLElement).getByTestId('ship-range-left-value')).toHaveTextContent(/^4$/);
    expect(box).not.toHaveAttribute('data-over');
    expect(box.closest('[data-zone="crew-ship-1"]')).not.toBeNull();
  });

  it('shows a red number below 0 past the Range', () => {
    renderRow([slot], { 'ship-1': 10 }, true);
    const box = screen.getByTestId('ship-range-left');
    expect(box).toHaveAttribute('data-over', 'true');
    expect(within(box as unknown as HTMLElement).getByTestId('ship-range-left-value')).toHaveTextContent(/^-2$/);
  });
});

describe('the range left in the crew panel (#1636)', () => {
  const renderPanel = (rangeUsed: Record<string, number> | undefined) =>
    render(
      <RangeUsedProvider value={{ used: rangeUsed }}>
        <CardListPanel
          location="crew"
          cards={[]}
          host={ship}
          onClose={() => {}}
          selectedIds={[]}
          onToggleSelect={() => {}}
          cardWidth={108}
          cardHeight={150}
        />
      </RangeUsedProvider>
    );

  it('shows the range left over the ship once it has moved', () => {
    renderPanel({ 'ship-1': 4 });
    const host = screen.getByTestId('card-list-panel-crew-ship');
    expect(within(host).getByTestId('ship-range-left-value')).toHaveTextContent(/^4$/);
    expect(within(host).getByRole('img', { name: 'Enterprise, Range 4 left of 8' })).toBeInTheDocument();
  });

  it('shows nothing before a move', () => {
    renderPanel(undefined);
    expect(screen.queryByTestId('ship-range-left')).toBeNull();
  });
});

describe('the range left on a ship of the attempt layout (#1636)', () => {
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
    expect(within(ships).getByTestId('ship-range')).toHaveTextContent(/^4$/);
  });
});

// Issue #1424: in the facing phase of the attempt layout, the mission card's drop halves read
// "Overcome" (the top half, under the mission) and "Place on" (the bottom half) during a dilemma
// drag. On the full table and in the choice phase they keep "Under" and "On".
let mockOverId: string | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: ({ id }: { id: string }) => ({ setNodeRef: () => {}, isOver: id === mockOverId }),
  };
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import { MissionCard } from '../../../app/decks/practice/MissionRow';
import { DraggedCardTypeProvider } from '../../../app/decks/practice/DraggedCardTypeContext';
import type { Attempt, CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';
import { computeAttemptChoiceLayout, computeAttemptLayout } from '../../../app/decks/practice/tableScale';

const slot: MissionSlot = {
  mission: {
    id: 'm2',
    card: { name: 'Bilana System', originalName: 'Bilana System', type: 'mission', imagefile: 'm2' },
    face: 'up',
  } as CardInstance,
  ships: [],
  awayTeam: [],
  underMission: [],
};

const noop = () => {};

const renderCard = (draggedType: string, facing?: boolean, placedOnColumn?: { gap: number; width: number }) =>
  render(
    <DraggedCardTypeProvider value={draggedType as any}>
      <MissionCard
        missionIndex={2}
        slot={slot}
        onOpenPile={noop}
        onOpenPlacedOn={noop}
        onFlipMission={noop}
        onSetMissionCompleted={noop}
        scale={1}
        uncropped
        slotWidth={100}
        showAwayTeam={false}
        placedOnColumn={placedOnColumn}
        facing={facing}
      />
    </DraggedCardTypeProvider>,
  );

const renderLayout = (phase: Attempt['phase']) => {
  const face = computeAttemptLayout(667, 280, false, 0, 1, undefined, false);
  const sizes = { ...face, choice: computeAttemptChoiceLayout(667, 280, false, 0, 1, face, true) };
  render(
    <DraggedCardTypeProvider value="dilemma">
      <AttemptLayout
        attempt={{ missionIndex: 2, personnel: 12, subtract: 3, phase, drawn: 0 }}
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
        moveDestinations={[]}
        onMoveSelection={noop}
        canDrawDilemma
        onDrawDilemma={noop}
        onSetPhase={noop}
      />
    </DraggedCardTypeProvider>,
  );
};

const labelOf = (dropId: string) => document.querySelector(`[data-zone="${dropId}"]`)!.textContent;

afterEach(() => {
  mockOverId = null;
});

describe('the mission card drop half labels (#1424)', () => {
  it.each([
    [undefined as { gap: number; width: number } | undefined, 'the plain halves'],
    [{ gap: 4, width: 30 }, 'the halves beside the placed-on column'],
  ])('read "Overcome" and "Place on" in the facing phase: %s (%s)', (side, _what) => {
    mockOverId = 'mission-under-2';
    const { unmount } = renderCard('dilemma', true, side);
    expect(labelOf('mission-under-2')).toBe('Overcome');
    unmount();
    mockOverId = 'mission-on-2';
    renderCard('dilemma', true, side);
    expect(labelOf('mission-on-2')).toBe('Place on');
  });

  it('read "Under" and "On" on the table', () => {
    mockOverId = 'mission-under-2';
    const { unmount } = renderCard('dilemma');
    expect(labelOf('mission-under-2')).toBe('Under');
    unmount();
    mockOverId = 'mission-on-2';
    renderCard('dilemma');
    expect(labelOf('mission-on-2')).toBe('On');
  });

  it('show no label for a card that is not a dilemma', () => {
    mockOverId = 'mission-under-2';
    renderCard('event', true);
    expect(screen.queryByText('Overcome')).toBeNull();
    expect(screen.queryByText('Under')).toBeNull();
  });

  it.each([
    ['face', 'Overcome', 'Place on'],
    ['choose', 'Under', 'On'],
  ] as const)('the attempt layout in the %s phase reads "%s" and "%s"', (phase, under, on) => {
    mockOverId = 'mission-under-2';
    renderLayout(phase);
    expect(labelOf('mission-under-2')).toBe(under);
    document.body.innerHTML = '';
    mockOverId = 'mission-on-2';
    renderLayout(phase);
    expect(labelOf('mission-on-2')).toBe(on);
  });
});

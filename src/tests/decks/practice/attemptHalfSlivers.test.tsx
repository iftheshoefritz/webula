// Issue #1504: on a desktop, the slivers of the dilemmas under the attempted mission poke out by 5%
// of the whole card, half the 10% of the table, and the band above the attempt body shrinks with
// them, never below the line of the personnel row's buttons. The full table and touch keep 10%.
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render } from '@testing-library/react';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import { MissionCard } from '../../../app/decks/practice/MissionRow';
import type { Attempt, CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';
import {
  ATTEMPT_PERSONNEL_BUTTONS_HEIGHT,
  computeAttemptChoiceLayout,
  computeAttemptLayout,
} from '../../../app/decks/practice/tableScale';

const dilemma = (id: string): CardInstance =>
  ({ id, card: { name: id, originalName: id, type: 'dilemma', imagefile: id }, face: 'up' }) as CardInstance;

const slot: MissionSlot = {
  mission: {
    id: 'm2',
    card: { name: 'Bilana System', originalName: 'Bilana System', type: 'mission', imagefile: 'm2' },
    face: 'up',
  } as CardInstance,
  ships: [],
  awayTeam: [],
  underMission: [dilemma('d1'), dilemma('d2'), dilemma('d3')],
};

const noop = () => {};
const stack = () => document.querySelector('[data-testid="mission-under-2-stack"]') as HTMLElement;

describe('the slivers above the attempted mission on a desktop (#1504)', () => {
  // At scale 1 the whole card is 100 px tall.
  it.each([
    [false, '20px'],
    [true, '10px'],
  ])('a whole mission card with halfSlivers %s shows a stack of two slivers %s tall', (halfSlivers, height) => {
    render(
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
        halfSlivers={halfSlivers}
      />,
    );
    expect(stack().style.height).toBe(height);
    expect(stack().style.top).toBe(`-${height}`);
    expect((document.querySelector('[data-zone="mission-under-2"]') as HTMLElement).style.top).toBe(`-${height}`);
  });

  it.each([
    ['face', false, '20px', '20px'],
    ['face', true, '10px', `${ATTEMPT_PERSONNEL_BUTTONS_HEIGHT}px`],
    ['choose', false, '20px', '20px'],
    ['choose', true, '10px', `${ATTEMPT_PERSONNEL_BUTTONS_HEIGHT}px`],
  ] as const)('the attempt layout in %s, desktop %s: a stack of %s, a band of %s', (phase, desktop, height, band) => {
    const face = computeAttemptLayout(1440, 280, desktop, 0, 1, undefined, false);
    const sizes = {
      ...face,
      missionScale: 1,
      choice: { ...computeAttemptChoiceLayout(1440, 280, desktop, 0, 1, face, true), missionScale: 1 },
    };
    const attempt: Attempt = { missionIndex: 2, personnel: 12, subtract: 3, phase, drawn: 0 };
    render(
      <AttemptLayout
        attempt={attempt}
        slot={slot}
        sizes={sizes}
        personnelCount={12}
        desktop={desktop}
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
      />,
    );
    expect(stack().style.height).toBe(height);
    expect((document.querySelector('[data-testid="attempt-body"]') as HTMLElement).style.paddingTop).toBe(band);
  });
});

// Issue #1220: in the dilemma choice, an empty space outside the "First" and "Last" ends
// of the dilemma stack, outside its drop zone, between it and the columns beside it.
import React from 'react';
import { render, screen } from '@testing-library/react';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import type { Attempt, MissionSlot } from '../../../app/decks/practice/tableReducer';
import {
  ATTEMPT_STACK_SIDE_GAP,
  computeAttemptChoiceLayout,
  computeAttemptLayout,
} from '../../../app/decks/practice/tableScale';

const slot: MissionSlot = {
  mission: {
    id: 'm0',
    card: { name: 'Moab IV', originalName: 'Moab IV', type: 'mission', imagefile: 'm0' },
    face: 'up',
  } as any,
  ships: [],
  awayTeam: [],
  underMission: [],
};

const attempt: Attempt = { missionIndex: 0, personnel: 20, subtract: 0, phase: 'choose', drawn: 0 };

describe('the space outside the ends of the dilemma choice stack (#1220)', () => {
  it.each([false, true])('wraps the stack in a margin on both sides (space mission: %s)', (space) => {
    const face = computeAttemptLayout(667, 280, false, 0, 1, { count: 20, space });
    const sizes = { ...face, choice: computeAttemptChoiceLayout(667, 280, false, 0, 1, face, space) };
    const noop = () => {};
    render(
      <AttemptLayout
        attempt={attempt}
        slot={slot}
        sizes={sizes}
        personnelCount={20}
        desktop={false}
        dilemmaStack={<div data-testid="the-stack" />}
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
    const margin = screen.getByTestId('attempt-stack-margin');
    expect(margin).toContainElement(screen.getByTestId('the-stack'));
    expect(margin.style.marginLeft).toBe(`${ATTEMPT_STACK_SIDE_GAP}px`);
    expect(margin.style.marginRight).toBe(`${ATTEMPT_STACK_SIDE_GAP}px`);
    expect(margin.nextElementSibling).toBe(screen.getByTestId('attempt-ships'));
  });
});

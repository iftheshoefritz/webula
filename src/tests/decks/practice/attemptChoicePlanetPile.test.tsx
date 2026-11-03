// Issue #1222: in the dilemma choice at a planet mission, the face-down personnel pile shows, and the
// ship row stands in a column of its own right of it. Issue #1493: the pile is the whole card back,
// uncropped, exactly as wide and as tall as the mission card.
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
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import type { Attempt, MissionSlot } from '../../../app/decks/practice/tableReducer';
import { missionCardHeight } from '../../../app/decks/practice/MissionRow';
import { TABLE_CARD_WIDTH } from '../../../app/decks/practice/TableCard';
import { fullCardHeight } from '../../../app/decks/practice/viewerCardSize';
import { computeAttemptChoiceLayout, computeAttemptLayout } from '../../../app/decks/practice/tableScale';

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

const renderChoice = (space: boolean) => {
  const personnel = { count: 20, space };
  const face = computeAttemptLayout(667, 280, false, 0, 1, personnel);
  const sizes = { ...face, choice: computeAttemptChoiceLayout(667, 280, false, 0, 1, face, space) };
  const noop = () => {};
  render(
    <AttemptLayout
      attempt={attempt}
      slot={slot}
      sizes={sizes}
      personnelCount={20}
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
    />,
  );
  return sizes.choice;
};

describe('the personnel pile of the dilemma choice at a planet mission (#1222)', () => {
  it('is the whole card back, as wide and as tall as the mission card (#1493)', () => {
    const choice = renderChoice(false);
    const pile = screen.getByTestId('attempt-personnel-pile');
    expect(choice.pileCardWidth).toBe(Math.round(TABLE_CARD_WIDTH * choice.missionScale));
    expect(choice.pileCardHeight).toBe(missionCardHeight(choice.missionScale, true));
    expect(choice.pileCardHeight).toBe(fullCardHeight(choice.pileCardWidth));
    expect(pile.style.width).toBe(`${choice.pileCardWidth}px`);
    expect(pile.style.height).toBe(`${choice.pileCardHeight}px`);
    const img = pile.querySelector('img')!;
    expect(img.getAttribute('src')).toMatch(/cardback/);
    expect(img.className).not.toContain('object-cover');
    expect(img.parentElement).toBe(pile);
    expect(pile).toHaveTextContent('20');
  });

  it('keeps the empty ship row mounted, in a column right of the pile', () => {
    const choice = renderChoice(false);
    const right = screen.getByTestId('attempt-ships');
    expect(right.className).toContain('flex-row');
    expect(right.style.width).toBe(`${choice.rightWidth}px`);
    expect(right.querySelector('[data-zone="ship-row-0"]')).not.toBeNull();
  });

  // Issue #1235: a space mission has no pile, only the ships.
  it('shows no pile at a space mission, only the ships', () => {
    renderChoice(true);
    expect(screen.queryByTestId('attempt-personnel-pile')).toBeNull();
    expect(screen.getByTestId('attempt-ships').className).toContain('flex-col');
  });
});

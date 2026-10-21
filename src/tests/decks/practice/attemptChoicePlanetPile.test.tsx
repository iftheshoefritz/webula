// Issue #1222: in the dilemma choice at a planet mission, the face-down personnel pile is a crop of the
// card back exactly the size of a card of the dilemma stack, level with the stack's cards, and the
// ship row stands in a column of its own right of it.
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
      canDrawDilemma
      onDrawDilemma={noop}
      onSetPhase={noop}
    />,
  );
  return sizes.choice;
};

describe('the personnel pile of the dilemma choice at a planet mission (#1222)', () => {
  it('is a crop of the card back the size of a stack card, at the bottom of a slot as tall as the stack', () => {
    const choice = renderChoice(false);
    const pile = screen.getByTestId('attempt-personnel-pile');
    expect(pile.style.width).toBe(`${choice.stackCardWidth}px`);
    const crop = pile.querySelector('img')!.parentElement as HTMLElement;
    expect(crop.style.height).toBe(`${choice.stackCardHeight}px`);
    expect(pile.querySelector('img')!.getAttribute('src')).toMatch(/cardback/);
    const slotEl = pile.parentElement as HTMLElement;
    expect(slotEl.style.height).toBe(`${choice.stackHeight}px`);
    expect(slotEl.className).toContain('justify-end');
    expect(pile).toHaveTextContent('20');
  });

  it('keeps the empty ship row mounted, in a column right of the pile', () => {
    const choice = renderChoice(false);
    const right = screen.getByTestId('attempt-ships');
    expect(right.className).toContain('flex-row');
    expect(right.style.width).toBe(`${choice.rightWidth}px`);
    expect(right.querySelector('[data-zone="ship-row-0"]')).not.toBeNull();
  });

  it('keeps the whole card back above the ships at a space mission', () => {
    const choice = renderChoice(true);
    const pile = screen.getByTestId('attempt-personnel-pile');
    expect(pile.style.width).toBe(`${choice.pileCardWidth}px`);
    expect(pile.querySelector('img')!.className).toContain('h-auto');
    expect(screen.getByTestId('attempt-ships').className).toContain('flex-col');
  });
});

// Issue #1180: in the attempt layout, the cards placed on the attempted mission show in a column to
// the right of the mission card, dilemmas above and events below, in place of the card's strips.
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import AttemptLayout from '../../../app/decks/practice/AttemptLayout';
import { MissionCard } from '../../../app/decks/practice/MissionRow';
import type { Attempt, CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';
import {
  ATTEMPT_GAP,
  attemptPlacedOnBlocks,
  computeAttemptChoiceLayout,
  computeAttemptLayout,
} from '../../../app/decks/practice/tableScale';
import { missionCardHeight } from '../../../app/decks/practice/MissionRow';

const card = (id: string, type: string): CardInstance =>
  ({ id, card: { name: `Card ${id}`, originalName: `Card ${id}`, type, imagefile: id }, face: 'up' }) as any;

const slotWith = (placedOn: CardInstance[]): MissionSlot => ({
  mission: {
    id: 'm2',
    card: { name: 'Bilana System', originalName: 'Bilana System', type: 'mission', imagefile: 'm2' },
    face: 'up',
    ...(placedOn.length ? { placedOn } : {}),
  } as any,
  ships: [],
  awayTeam: [],
  underMission: [],
});

const attempt = (phase: Attempt['phase']): Attempt => ({ missionIndex: 2, personnel: 12, subtract: 3, phase, drawn: 0 });

const renderLayout = (slot: MissionSlot, phase: Attempt['phase'] = 'face', onOpenPlacedOn = jest.fn()) => {
  const placed = (slot.mission?.placedOn?.length ?? 0) > 0;
  const face = computeAttemptLayout(667, 280, false, 0, 1, undefined, placed);
  const sizes = { ...face, choice: computeAttemptChoiceLayout(667, 280, false, 0, 1, face, true) };
  const noop = () => {};
  render(
    <AttemptLayout
      attempt={attempt(phase)}
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
      onOpenPlacedOn={onOpenPlacedOn}
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
  return { sizes, onOpenPlacedOn };
};

const placed = [card('e1', 'event'), card('d1', 'dilemma'), card('e2', 'interrupt'), card('d2', 'dilemma')];

describe('AttemptLayout: the column of the placed cards (#1180)', () => {
  it.each(['face', 'choose'] as const)('shows the dilemmas above the events, every card, in the %s phase', (phase) => {
    const { sizes } = renderLayout(slotWith(placed), phase);
    const column = screen.getByTestId('attempt-placed-on-2');
    expect(column).not.toHaveAttribute('data-zone');
    expect(column.style.width).toBe(`${sizes.placedOnWidth}px`);
    expect(column.style.height).toBe(`${missionCardHeight(sizes.missionScale, true)}px`);
    const blocks = Array.from(column.children).map((b) => b.getAttribute('data-testid'));
    expect(blocks).toEqual(['attempt-placed-on-dilemmas-2', 'attempt-placed-on-events-2']);
    const names = (testId: string) =>
      within(screen.getByTestId(testId)).getAllByRole('img').map((img) => img.getAttribute('alt'));
    expect(names('attempt-placed-on-dilemmas-2')).toEqual(['Card d1', 'Card d2']);
    expect(names('attempt-placed-on-events-2')).toEqual(['Card e1', 'Card e2']);
    expect(column.querySelector('[data-card-id]')).toBeNull();
  });

  it('draws no strips on the mission card, and keeps the badges', () => {
    renderLayout(slotWith(placed));
    const layout = screen.getByTestId('attempt-layout');
    expect(within(layout).queryByTestId('mission-on-events-strip-2')).toBeNull();
    expect(within(layout).queryByTestId('mission-on-dilemmas-strip-2')).toBeNull();
    expect(screen.getByTestId('mission-on-events-2')).toBeInTheDocument();
    expect(screen.getByTestId('mission-on-dilemmas-2')).toBeInTheDocument();
  });

  it('opens the panel of a block on a tap', () => {
    const { onOpenPlacedOn } = renderLayout(slotWith(placed));
    fireEvent.click(screen.getByTestId('attempt-placed-on-dilemmas-2'));
    expect(onOpenPlacedOn).toHaveBeenLastCalledWith('m2', 'dilemmas');
    fireEvent.click(screen.getByTestId('attempt-placed-on-events-2'));
    expect(onOpenPlacedOn).toHaveBeenLastCalledWith('m2', 'events');
  });

  it('gives one group the whole height', () => {
    renderLayout(slotWith([card('e1', 'event')]));
    expect(screen.queryByTestId('attempt-placed-on-dilemmas-2')).toBeNull();
    const height = screen.getByTestId('attempt-placed-on-2').style.height;
    expect(screen.getByTestId('attempt-placed-on-events-2').style.height).toBe(height);
  });

  it('shows no column with nothing placed on the mission', () => {
    const { sizes } = renderLayout(slotWith([]));
    expect(sizes.placedOnWidth).toBe(0);
    expect(screen.queryByTestId('attempt-placed-on-2')).toBeNull();
  });

  it('lets the bottom half of the mission card reach over the column', () => {
    const { sizes } = renderLayout(slotWith(placed));
    const target = document.querySelector('[data-zone="mission-on-2"]') as HTMLElement;
    expect(target.style.right).toBe(`-${ATTEMPT_GAP + sizes.placedOnWidth}px`);
    expect(target.style.top === '' || target.style.top === '0px').toBe(true);
  });
});

describe('MissionCard on the normal table (#1180)', () => {
  it('keeps its strips', () => {
    render(
      <MissionCard
        missionIndex={2}
        slot={slotWith(placed)}
        onOpenPile={() => {}}
        onOpenPlacedOn={() => {}}
        onFlipMission={() => {}}
        onSetMissionCompleted={() => {}}
        scale={1}
        uncropped={false}
        slotWidth={72}
      />,
    );
    expect(screen.getByTestId('mission-on-events-strip-2')).toBeInTheDocument();
    expect(screen.getByTestId('mission-on-dilemmas-strip-2')).toBeInTheDocument();
  });
});

describe('attemptPlacedOnBlocks (#1180)', () => {
  it.each([
    [1, 1],
    [2, 2],
    [5, 1],
    [12, 9],
  ])('fits %i dilemmas and %i events in the height, no step larger than a card', (dilemmas, events) => {
    const height = 146;
    const { dilemmas: d, events: e } = attemptPlacedOnBlocks(dilemmas, events, height, 40);
    expect(d!.height + e!.height).toBeLessThanOrEqual(height);
    for (const [block, count] of [
      [d!, dilemmas],
      [e!, events],
    ] as const) {
      expect(block.cardHeight + (count - 1) * block.step).toBeLessThanOrEqual(block.height);
      expect(block.step).toBeLessThanOrEqual(block.cardHeight);
    }
  });

  it('gives a lone group the whole height, and none to an empty one', () => {
    expect(attemptPlacedOnBlocks(0, 3, 146, 40)).toEqual({
      dilemmas: null,
      events: { height: 146, cardHeight: 36, step: 36 },
    });
  });
});

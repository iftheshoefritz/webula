jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MissionRow from '../../../app/decks/practice/MissionRow';
import { CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';

const card = (id: string, name: string): CardInstance => ({
  id,
  card: { name, imagefile: id },
  face: 'up',
});

const emptySlot = (): MissionSlot => ({
  mission: card('mission-0', 'A Mission'),
  ships: [],
  personnel: [],
  event: [],
  dilemma: [],
  underMission: [],
});

describe('MissionRow', () => {
  // #641: dilemmas placed under the mission poke out above the mission card's top edge, in a
  // stack absolutely positioned behind it, rather than a strip of edges reserved below it.
  it('shows no under-mission tap target when the pile is empty', () => {
    render(
      <MissionRow missions={[emptySlot()]} onCardClick={() => {}} onOpenPile={() => {}} onShipClick={() => {}} />
    );

    expect(screen.queryByRole('button', { name: /under the mission pile/i })).not.toBeInTheDocument();
  });

  it('renders each under-mission dilemma face up, and opens that pile on a tap of the sliver', () => {
    const onOpenPile = jest.fn();
    const slot: MissionSlot = {
      ...emptySlot(),
      underMission: [card('d1', 'Dilemma One'), card('d2', 'Dilemma Two')],
    };
    render(<MissionRow missions={[slot]} onCardClick={() => {}} onOpenPile={onOpenPile} onShipClick={() => {}} />);

    expect(document.body.querySelector('[data-card-id="d1"] img')).toHaveAttribute('src', '/cardimages/d1.jpg');
    expect(document.body.querySelector('[data-card-id="d2"] img')).toHaveAttribute('src', '/cardimages/d2.jpg');

    fireEvent.click(screen.getByRole('button', { name: /under the mission pile, 2 cards, tap to open/i }));
    expect(onOpenPile).toHaveBeenCalledWith(0, 'underMission');
  });

  // #641: the personnel/event badge strip moves below the mission card, freeing the space above
  // it for the dilemma slivers.
  it('renders the badge strip after (below) the mission card, not above it', () => {
    const slot: MissionSlot = { ...emptySlot(), personnel: [card('p1', 'Personnel One')] };
    render(<MissionRow missions={[slot]} onCardClick={() => {}} onOpenPile={() => {}} onShipClick={() => {}} />);

    const missionZone = document.body.querySelector('[data-zone="mission-0"]')!;
    const badge = screen.getByRole('button', { name: /personnel pile, 1 card/i });
    expect(missionZone.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(missionZone.contains(badge)).toBe(false);
  });
});

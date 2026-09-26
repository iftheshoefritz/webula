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
  underMission: [],
});

describe('MissionRow', () => {
  // #813: the event pile is gone, so the mission shows no event badge, and the personnel badge is
  // the only way to file a card into the personnel pile by a drag, so it shows with an empty pile.
  it('shows no event badge, and shows the personnel badge with an empty pile', () => {
    const onOpenPile = jest.fn();
    render(
      <MissionRow
        missions={[emptySlot()]}
        onOpenPile={onOpenPile}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenHost={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /event pile/i })).not.toBeInTheDocument();
    expect(document.body.querySelector('[data-zone="mission-pile-event-0"]')).toBeNull();
    const badge = screen.getByRole('button', { name: /^personnel pile, 0 cards$/i });
    expect(badge).toHaveAttribute('data-zone', 'mission-pile-personnel-0');
    fireEvent.click(badge);
    expect(onOpenPile).not.toHaveBeenCalled();
  });

  it('opens the personnel pile from its badge once it holds a card', () => {
    const onOpenPile = jest.fn();
    const slot: MissionSlot = { ...emptySlot(), personnel: [card('p1', 'Data')] };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={onOpenPile}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenHost={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^personnel pile, 1 card, tap to open$/i }));
    expect(onOpenPile).toHaveBeenCalledWith(0, 'personnel');
  });

  // #813: a mission card is a host. It shows a counter of the cards on it, and a tap on the
  // counter opens them.
  it('shows a counter of the cards on the mission card, and a tap on it opens them', () => {
    const onOpenHost = jest.fn();
    const slot: MissionSlot = {
      ...emptySlot(),
      mission: { ...card('mission-0', 'A Mission'), on: [card('e1', 'An Event')] },
    };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenHost={onOpenHost}
      />
    );

    const counter = screen.getByRole('button', { name: /^A Mission, 1 card on it$/ });
    expect(counter).toHaveTextContent('1');
    fireEvent.click(counter);
    expect(onOpenHost).toHaveBeenCalledWith('mission-0');
  });

  it('shows no counter on a mission card with nothing on it', () => {
    render(
      <MissionRow
        missions={[emptySlot()]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenHost={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /on it$/ })).not.toBeInTheDocument();
  });

  // #641: dilemmas placed under the mission poke out above the mission card's top edge, in a
  // stack absolutely positioned behind it, rather than a strip of edges reserved below it.
  it('shows no under-mission tap target when the pile is empty', () => {
    render(
      <MissionRow
        missions={[emptySlot()]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /under the mission pile/i })).not.toBeInTheDocument();
  });

  it('renders each under-mission dilemma face up, and opens that pile on a tap of the sliver', () => {
    const onOpenPile = jest.fn();
    const slot: MissionSlot = {
      ...emptySlot(),
      underMission: [card('d1', 'Dilemma One'), card('d2', 'Dilemma Two')],
    };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={onOpenPile}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
      />
    );

    expect(document.body.querySelector('[data-card-id="d1"] img')).toHaveAttribute('src', '/cardimages/d1.jpg');
    expect(document.body.querySelector('[data-card-id="d2"] img')).toHaveAttribute('src', '/cardimages/d2.jpg');

    fireEvent.click(screen.getByRole('button', { name: /under the mission pile, 2 cards, tap to open/i }));
    expect(onOpenPile).toHaveBeenCalledWith(0, 'underMission');
  });

  // #641: the personnel/event badge strip moves below the mission card, freeing the space above
  // it for the dilemma slivers.
  it('renders the badge strip after (below) the mission card, not above it', () => {
    const slot: MissionSlot = { ...emptySlot(), personnel: [card('p1', 'Personnel One')] };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
      />
    );

    const missionZone = document.body.querySelector('[data-zone="mission-0"]')!;
    const badge = screen.getByRole('button', { name: /personnel pile, 1 card/i });
    expect(missionZone.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(missionZone.contains(badge)).toBe(false);
  });
});

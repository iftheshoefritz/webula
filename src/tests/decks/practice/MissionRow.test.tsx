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
  awayTeam: [],
  underMission: [],
});

describe('MissionRow', () => {
  // #813: the event pile is gone, so the mission shows no event badge, and the away team badge is
  // the only way to file a card into the away team by a drag, so it shows with an empty pile.
  it('shows no event badge, and shows the away team badge with an empty pile', () => {
    const onOpenPile = jest.fn();
    render(
      <MissionRow
        missions={[emptySlot()]}
        onOpenPile={onOpenPile}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /event pile/i })).not.toBeInTheDocument();
    expect(document.body.querySelector('[data-zone="mission-pile-event-0"]')).toBeNull();
    const badge = screen.getByRole('button', { name: /^Away team, 0 cards$/i });
    // The badge is not a drop target of its own (#924): the mission's bottom half reaches over it.
    expect(badge).not.toHaveAttribute('data-zone');
    expect(badge).toHaveAttribute('data-testid', 'mission-pile-awayTeam-0');
    fireEvent.click(badge);
    expect(onOpenPile).not.toHaveBeenCalled();
  });

  it('opens the away team from its badge once it holds a card', () => {
    const onOpenPile = jest.fn();
    const slot: MissionSlot = { ...emptySlot(), awayTeam: [card('p1', 'Data')] };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={onOpenPile}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Away team, 1 card, tap to open$/i }));
    expect(onOpenPile).toHaveBeenCalledWith(0, 'awayTeam');
  });

  // #924: the badge strip is part of the mission's drop zone. The bottom half reaches down past the
  // card over the 4 px gap and the 14 px badge strip; the top half does not.
  it("reaches the mission's bottom half over the badge strip", () => {
    render(
      <MissionRow
        missions={[emptySlot()]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
      />
    );

    const on = document.body.querySelector('[data-zone="mission-on-0"]') as HTMLElement;
    expect(on.style.bottom).toBe('-18px');
    expect(on.style.height).toBe('calc(50% + 18px)');
    const under = document.body.querySelector('[data-zone="mission-under-0"]') as HTMLElement;
    expect(under.style.bottom).toBe('');
  });

  // #813: a mission card takes a placed card. It shows a counter of the cards on it, and a tap on the
  // counter opens them.
  it('shows a counter of the cards on the mission card, and a tap on it opens them', () => {
    const onOpenPlacedOn = jest.fn();
    const slot: MissionSlot = {
      ...emptySlot(),
      mission: { ...card('mission-0', 'A Mission'), placedOn: [card('e1', 'An Event')] },
    };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={onOpenPlacedOn}
      />
    );

    const counter = screen.getByRole('button', { name: /^A Mission, 1 card on it$/ });
    expect(counter).toHaveTextContent('1');
    fireEvent.click(counter);
    expect(onOpenPlacedOn).toHaveBeenCalledWith('mission-0');
  });

  it('shows no counter on a mission card with nothing on it', () => {
    render(
      <MissionRow
        missions={[emptySlot()]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
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

  it('renders each under-mission dilemma face up, and opens that pile from its hidden button', () => {
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
    const slot: MissionSlot = { ...emptySlot(), awayTeam: [card('p1', 'Personnel One')] };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
      />
    );

    const missionZone = document.body.querySelector('[data-zone="mission-under-0"]')!;
    const badge = screen.getByRole('button', { name: /Away team, 1 card/i });
    expect(missionZone.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(missionZone.contains(badge)).toBe(false);
  });

  // #917: two slivers, the top half of the mission card takes the drop under the mission and the
  // tap that opens the pile, and the bottom half places a card on the mission.
  describe('the under-the-mission stack and the top half of the mission card (#917)', () => {
    const renderRow = (slot: MissionSlot, onOpenPile = jest.fn()) => {
      render(
        <MissionRow
          missions={[slot]}
          onOpenPile={onOpenPile}
          onShipClick={() => {}}
          onOpenShipRow={() => {}}
          onOpenPlacedOn={() => {}}
        />
      );
      return onOpenPile;
    };
    const threeDilemmas = (): MissionSlot => ({
      ...emptySlot(),
      underMission: [card('d1', 'Dilemma One'), card('d2', 'Dilemma Two'), card('d3', 'Dilemma Three')],
    });
    // jsdom lays nothing out, so the mission card gets a 72x64 rect at the origin.
    const tapMission = (clientY: number) => {
      const button = document.body.querySelector('[data-card-id="mission-0"]') as HTMLElement;
      button.getBoundingClientRect = () =>
        ({ top: 0, left: 0, right: 72, bottom: 64, width: 72, height: 64, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
      fireEvent.click(button, { clientX: 10, clientY });
    };

    it('shows two slivers, each offset by about 5% of the card height, and the true count', () => {
      renderRow(threeDilemmas());
      expect(document.body.querySelector('[data-card-id="d1"]')).toBeNull();
      const d2 = document.body.querySelector('[data-card-id="d2"]')!.parentElement!;
      const d3 = document.body.querySelector('[data-card-id="d3"]')!.parentElement!;
      expect(d2.style.top).toBe('0px');
      expect(d3.style.top).toBe('3px'); // 5% of 64px, rounded
      expect(d2.parentElement!.style.top).toBe('-6px');
      expect(screen.getByRole('button', { name: /under the mission pile, 3 cards, tap to open/i })).toBeInTheDocument();
      expect(d2.parentElement!.textContent).toBe('3');
    });

    it('puts the under drop on the top half and the on drop on the bottom half', () => {
      renderRow(emptySlot());
      expect(document.body.querySelector('[data-zone="mission-under-0"]')).toHaveClass('top-0');
      expect(document.body.querySelector('[data-zone="mission-on-0"]')).toHaveClass('bottom-0');
    });

    it('opens the under-the-mission panel on a tap of the top half', () => {
      const onOpenPile = renderRow(threeDilemmas());
      tapMission(10);
      expect(onOpenPile).toHaveBeenCalledWith(0, 'underMission');
    });

    it('opens nothing on a tap of the bottom half', () => {
      const onOpenPile = renderRow(threeDilemmas());
      tapMission(50);
      expect(onOpenPile).not.toHaveBeenCalled();
    });

    it('opens nothing on a tap of the top half when no dilemma is under the mission', () => {
      const onOpenPile = renderRow(emptySlot());
      tapMission(10);
      expect(onOpenPile).not.toHaveBeenCalled();
    });
  });
});

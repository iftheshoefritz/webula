jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MissionRow, {
  PLACED_ON_STRIP_MAX_VISIBLE,
  hasApMissionLayout,
  missionSlotWidth,
  missionSpanLayout,
  placedOnStripLayout,
  turnedMissionScale,
  underMissionHeadroom,
} from '../../../app/decks/practice/MissionRow';
import { COMPLETED_IMAGE_CLASSNAME } from '../../../app/decks/practice/TableCard';
import CountBadge from '../../../app/decks/practice/CountBadge';
import { CardHoldProvider, DOUBLE_TAP_MS, HOLD_DELAY_MS } from '../../../app/decks/practice/useCardHold';
import { CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';
import { LandedZoneProvider } from '../../../app/decks/practice/LandedZoneContext';
import eventIcon from '../../../../public/icons/icon_event.gif';
import dualIcon from '../../../../public/icons/icon_dual.gif';
import alphaQuadrantIcon from '../../../../public/icons/icon_quadrant_alpha.gif';

const card = (id: string, name: string): CardInstance => ({
  id,
  card: { name: name.toLowerCase(), originalName: name, imagefile: id },
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

  // #990: the top half reaches up over the slivers of the dilemmas under the mission, so a drop on
  // them, and the marker, cover them too. Two slivers show at most, each 6 px at scale 1.
  it.each([
    [0, ''],
    [1, '-6px'],
    [3, '-12px'],
  ])("reaches the mission's top half up over %i dilemma(s) under the mission", (count, top) => {
    const slot: MissionSlot = {
      ...emptySlot(),
      underMission: Array.from({ length: count }, (_, i) => card(`d${i}`, `Dilemma ${i}`)),
    };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
      />
    );

    const under = document.body.querySelector('[data-zone="mission-under-0"]') as HTMLElement;
    expect(under.style.top).toBe(top);
    expect(under.style.bottom).toBe('');
    if (top) expect(under.style.height).toBe(`calc(50% + ${top.slice(1)})`);
    const stack = document.body.querySelector('[data-testid="mission-under-0-stack"]') as HTMLElement | null;
    expect(stack?.style.top ?? '').toBe(top);
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

    const counter = screen.getByRole('button', { name: /^A Mission, 1 event on it$/ });
    expect(counter).toHaveTextContent('1');
    // #1069: it sits in the badge strip, to the right of the away team badge, not on the card's corner.
    const awayTeam = screen.getByTestId('mission-pile-awayTeam-0');
    expect(counter.parentElement).toBe(awayTeam.parentElement);
    expect(awayTeam.nextElementSibling).toBe(counter);
    expect(screen.getByTestId('mission-corners-0')).not.toContainElement(counter);
    // It shows the event icon.
    const icon = counter.querySelector('img') as HTMLImageElement;
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('src')).toBe(eventIcon.src);
    expect(icon).toHaveAttribute('alt', '');
    fireEvent.click(counter);
    expect(onOpenPlacedOn).toHaveBeenCalledWith('mission-0', 'events');
    // #1081: no dilemma is placed on the mission, so it shows no dilemma badge.
    expect(screen.queryByRole('button', { name: /dilemmas? on it$/ })).not.toBeInTheDocument();
  });

  const dilemma = (id: string, name: string): CardInstance => ({
    ...card(id, name),
    card: { ...card(id, name).card, type: 'dilemma' },
  });

  // #1081: the dilemmas placed on a mission count in a badge of their own, with the dual icon, to the
  // right of the events badge. The dilemmas under the mission count in neither.
  it('counts the dilemmas placed on the mission card in a badge of their own', () => {
    const onOpenPlacedOn = jest.fn();
    const slot: MissionSlot = {
      ...emptySlot(),
      mission: { ...card('mission-0', 'A Mission'), placedOn: [card('e1', 'An Event'), dilemma('d1', 'A Dilemma')] },
      underMission: [dilemma('d2', 'Under'), dilemma('d3', 'Under Too')],
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

    const events = screen.getByRole('button', { name: 'A Mission, 1 event on it' });
    const dilemmas = screen.getByRole('button', { name: 'A Mission, 1 dilemma on it' });
    expect(events).toHaveTextContent('1');
    expect(dilemmas).toHaveTextContent('1');
    expect(dilemmas).toHaveAttribute('data-testid', 'mission-on-dilemmas-0');
    expect(events).toHaveAttribute('data-testid', 'mission-on-events-0');
    expect(screen.getByTestId('mission-pile-awayTeam-0').nextElementSibling).toBe(events);
    expect(events.nextElementSibling).toBe(dilemmas);
    expect(dilemmas.querySelector('img')!.getAttribute('src')).toBe(dualIcon.src);
    fireEvent.click(dilemmas);
    expect(onOpenPlacedOn).toHaveBeenCalledWith('mission-0', 'dilemmas');
  });

  it('shows no events badge on a mission card with only dilemmas on it', () => {
    const slot: MissionSlot = {
      ...emptySlot(),
      mission: { ...card('mission-0', 'A Mission'), placedOn: [dilemma('d1', 'A'), dilemma('d2', 'B')] },
    };
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: 'A Mission, 2 dilemmas on it' })).toHaveTextContent('2');
    expect(screen.queryByRole('button', { name: /events? on it$/ })).not.toBeInTheDocument();
  });

  // Both badges share the landed key `on-<mission id>`, so only the badge whose count grew bumps.
  it('bumps only the badge of the group that gained the dropped card', () => {
    const before: MissionSlot = {
      ...emptySlot(),
      mission: { ...card('mission-0', 'A Mission'), placedOn: [card('e1', 'An Event'), dilemma('d1', 'A Dilemma')] },
    };
    const after: MissionSlot = {
      ...before,
      mission: { ...before.mission!, placedOn: [...before.mission!.placedOn!, dilemma('d2', 'Another')] },
    };
    const row = (slot: MissionSlot, landed: boolean) => (
      <LandedZoneProvider value={landed ? { keys: new Set(['on-mission-0']), nonce: 1 } : null}>
        <MissionRow
          missions={[slot]}
          onOpenPile={() => {}}
          onShipClick={() => {}}
          onOpenShipRow={() => {}}
          onOpenPlacedOn={() => {}}
        />
      </LandedZoneProvider>
    );
    const { rerender } = render(row(before, false));
    rerender(row(after, true));

    const bumped = (name: string) =>
      screen.getByRole('button', { name }).querySelector('.motion-safe\\:animate-landed-bump') !== null;
    expect(bumped('A Mission, 2 dilemmas on it')).toBe(true);
    expect(bumped('A Mission, 1 event on it')).toBe(false);
    // A later render within the same cue keeps the bump on the same badge.
    rerender(row(after, true));
    expect(bumped('A Mission, 2 dilemmas on it')).toBe(true);
    expect(bumped('A Mission, 1 event on it')).toBe(false);
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
        onOpenPlacedOn={() => {}}
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
        onOpenPlacedOn={() => {}}
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
        onOpenPlacedOn={() => {}}
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
    // A single tap acts only after the double-tap window (#1059).
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    // jsdom lays nothing out, so the mission card gets a 72x64 rect at the origin.
    const tapMission = (clientY: number) => {
      const button = document.body.querySelector('[data-card-id="mission-0"]') as HTMLElement;
      button.getBoundingClientRect = () =>
        ({ top: 0, left: 0, right: 72, bottom: 64, width: 72, height: 64, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
      fireEvent.click(button, { clientX: 10, clientY });
      act(() => {
        jest.advanceTimersByTime(DOUBLE_TAP_MS);
      });
    };

    it('shows two slivers, each offset by about 10% of the card height, and the true count', () => {
      renderRow(threeDilemmas());
      expect(document.body.querySelector('[data-card-id="d1"]')).toBeNull();
      const d2 = document.body.querySelector('[data-card-id="d2"]')!.parentElement!;
      const d3 = document.body.querySelector('[data-card-id="d3"]')!.parentElement!;
      expect(d2.style.top).toBe('0px');
      expect(d3.style.top).toBe('6px'); // 10% of 64px, rounded (#968)
      expect(d2.parentElement!.style.top).toBe('-12px');
      expect(screen.getByRole('button', { name: /under the mission pile, 3 cards, tap to open/i })).toBeInTheDocument();
      expect(d2.parentElement!.textContent).toBe('3');
    });

    // #996: the count uses the same badge as the draw deck, the hands, and the discard pile.
    it('shows the count in the common count badge', () => {
      renderRow(threeDilemmas());
      const stack = document.body.querySelector('[data-testid="mission-under-0-stack"]')!;
      const { container } = render(<CountBadge count={3} />);
      const badge = stack.querySelector('span[aria-hidden="true"] > span')!;
      expect(badge.className).toBe((container.firstChild as HTMLElement).className);
      expect(badge).toHaveTextContent('3');
    });

    // #968: the row moves down only once two slivers outgrow the padding above the row.
    it('moves the mission row down only by what two slivers need past the top padding', () => {
      expect(underMissionHeadroom(1)).toBe(0); // 2 x 6px fits the 16px padding
      expect(underMissionHeadroom(2)).toBe(10); // 2 x 13px, less 16px
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

    it('opens nothing on a tap of the bottom half when the away team is empty', () => {
      const onOpenPile = renderRow(threeDilemmas());
      tapMission(50);
      expect(onOpenPile).not.toHaveBeenCalled();
    });

    // #967: the bottom half opens the away team panel, the same panel the away team badge opens.
    it('opens the away team panel on a tap of the bottom half', () => {
      const onOpenPile = renderRow({ ...threeDilemmas(), awayTeam: [card('p1', 'Personnel One')] });
      tapMission(50);
      expect(onOpenPile).toHaveBeenCalledTimes(1);
      expect(onOpenPile).toHaveBeenCalledWith(0, 'awayTeam');
    });

    it('opens the under-the-mission panel, not the away team, on a tap of the top half', () => {
      const onOpenPile = renderRow({ ...threeDilemmas(), awayTeam: [card('p1', 'Personnel One')] });
      tapMission(10);
      expect(onOpenPile).toHaveBeenCalledTimes(1);
      expect(onOpenPile).toHaveBeenCalledWith(0, 'underMission');
    });

    it('opens nothing on a tap of the top half when no dilemma is under the mission', () => {
      const onOpenPile = renderRow(emptySlot());
      tapMission(10);
      expect(onOpenPile).not.toHaveBeenCalled();
    });

    // #1012: the slivers sit on top of the top half, so they take its tap and its hold.
    it('opens the under-the-mission panel on a tap of a sliver', () => {
      const onOpenPile = renderRow(threeDilemmas());
      fireEvent.click(document.body.querySelector('[data-card-id="d2"]')!);
      expect(onOpenPile).toHaveBeenCalledTimes(1);
      expect(onOpenPile).toHaveBeenCalledWith(0, 'underMission');
    });

    it('opens the under-the-mission panel on a tap of the count badge', () => {
      const onOpenPile = renderRow(threeDilemmas());
      const stack = document.body.querySelector('[data-testid="mission-under-0-stack"]')!;
      fireEvent.click(stack.querySelector('span[aria-hidden="true"] > span')!);
      expect(onOpenPile).toHaveBeenCalledTimes(1);
      expect(onOpenPile).toHaveBeenCalledWith(0, 'underMission');
    });

    it('opens the panel once from the hidden button', () => {
      const onOpenPile = renderRow(threeDilemmas());
      fireEvent.click(screen.getByRole('button', { name: /under the mission pile, 3 cards, tap to open/i }));
      expect(onOpenPile).toHaveBeenCalledTimes(1);
    });

    it('previews the mission on a hold of a sliver', () => {
      jest.useFakeTimers();
      try {
        const startHold = jest.fn();
        render(
          <CardHoldProvider value={{ startHold, endHold: () => {}, startHover: () => {}, endHover: () => {} }}>
            <MissionRow
              missions={[threeDilemmas()]}
              onOpenPile={() => {}}
              onShipClick={() => {}}
              onOpenShipRow={() => {}}
              onOpenPlacedOn={() => {}}
            />
          </CardHoldProvider>
        );
        fireEvent.pointerDown(document.body.querySelector('[data-card-id="d3"]')!, { button: 0 });
        act(() => {
          jest.advanceTimersByTime(HOLD_DELAY_MS);
        });
        expect(startHold).toHaveBeenCalledWith('mission-0', expect.anything());
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

// #930: with spare height the ship row fills a second and a third row of 2 ships before it
// overlaps, and only the last row overlaps.
describe('MissionRow: a completed mission (#991)', () => {
  const renderRow = (missions: MissionSlot[], onSetMissionCompleted = jest.fn(), onOpenPile = jest.fn()) =>
    render(
      <MissionRow
        missions={missions}
        onOpenPile={onOpenPile}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
        onSetMissionCompleted={onSetMissionCompleted}
      />
    );

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const missionButton = () => {
    const button = document.body.querySelector('[data-card-id="mission-0"]') as HTMLElement;
    button.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 72, bottom: 64, width: 72, height: 64, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
    return button;
  };
  const tap = (button: HTMLElement, clientX = 10, clientY = 50) => fireEvent.click(button, { clientX, clientY });

  // #1059: a double-tap toggles completion, and the single tap it starts with does nothing.
  it('marks a mission complete on two taps within the window, and opens no panel', () => {
    const onSet = jest.fn();
    const onOpenPile = jest.fn();
    renderRow([{ ...emptySlot(), awayTeam: [card('p1', 'Data')] }], onSet, onOpenPile);
    const button = missionButton();
    tap(button);
    act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS - 50);
    });
    tap(button, 12, 52);
    act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    });
    expect(onSet).toHaveBeenCalledTimes(1);
    expect(onSet).toHaveBeenCalledWith(0, true);
    expect(onOpenPile).not.toHaveBeenCalled();
  });

  it('marks a completed mission not complete on a double-tap', () => {
    const onSet = jest.fn();
    renderRow([{ ...emptySlot(), completed: true }], onSet);
    const button = missionButton();
    tap(button);
    tap(button);
    expect(onSet).toHaveBeenCalledWith(0, false);
  });

  it('opens the panel of a single tap only after the window passes', () => {
    const onSet = jest.fn();
    const onOpenPile = jest.fn();
    renderRow([{ ...emptySlot(), awayTeam: [card('p1', 'Data')] }], onSet, onOpenPile);
    tap(missionButton());
    act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS - 1);
    });
    expect(onOpenPile).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onOpenPile).toHaveBeenCalledWith(0, 'awayTeam');
    expect(onSet).not.toHaveBeenCalled();
  });

  it('does not count two taps far apart as a double-tap', () => {
    const onSet = jest.fn();
    const onOpenPile = jest.fn();
    renderRow([{ ...emptySlot(), awayTeam: [card('p1', 'Data')] }], onSet, onOpenPile);
    const button = missionButton();
    tap(button, 10, 10);
    tap(button, 10, 60);
    act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    expect(onSet).not.toHaveBeenCalled();
    expect(onOpenPile).toHaveBeenCalledTimes(1);
    expect(onOpenPile).toHaveBeenCalledWith(0, 'awayTeam');
  });

  it('draws no check toggle on the card or in the badge strip', () => {
    renderRow([{ ...emptySlot() }, { ...emptySlot(), completed: true }]);
    expect(document.body.querySelector('[data-testid^="mission-complete-"]')).toBeNull();
  });

  it('darkens a completed mission and says so in its accessible name', () => {
    renderRow([{ ...emptySlot(), completed: true }]);
    expect(screen.getByRole('img', { name: 'A Mission' })).toHaveClass('brightness-50');
    expect(document.body.querySelector('[data-card-id="mission-0"]')).toHaveAttribute(
      'aria-label',
      'A Mission, completed'
    );
  });

  it('names a mission that is not complete by its name alone, and does not darken it', () => {
    renderRow([{ ...emptySlot() }]);
    expect(screen.getByRole('img', { name: 'A Mission' })).not.toHaveClass('brightness-50');
    expect(document.body.querySelector('[data-card-id="mission-0"]')).toHaveAttribute('aria-label', 'A Mission');
  });

  it('toggles completion from the hidden focus button', () => {
    const onSet = jest.fn();
    const onOpenPile = jest.fn();
    const { unmount } = renderRow([{ ...emptySlot(), awayTeam: [card('p1', 'Data')] }], onSet, onOpenPile);
    const toggle = screen.getByRole('button', { name: 'Mark A Mission complete' });
    expect(toggle).toHaveAttribute('data-testid', 'mission-toggle-0');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveClass('sr-only', 'focus:not-sr-only');
    expect(toggle).not.toHaveAttribute('data-zone');
    fireEvent.click(toggle);
    expect(onSet).toHaveBeenCalledWith(0, true);
    expect(onOpenPile).not.toHaveBeenCalled();
    unmount();

    renderRow([{ ...emptySlot(), completed: true }], onSet);
    const pressed = screen.getByRole('button', { name: 'Mark A Mission not complete' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pressed);
    expect(onSet).toHaveBeenCalledWith(0, false);
  });

  it('shows no toggle in a slot with no mission card', () => {
    renderRow([{ ...emptySlot(), mission: null }]);
    expect(screen.queryByRole('button', { name: /^Mark / })).toBeNull();
  });
});

// #1060: a completed mission's card turns 90° inside its slot; nothing around it turns.
describe('MissionRow: a completed mission turns (#1060)', () => {
  const doubleSided: MissionSlot = {
    ...emptySlot(),
    mission: {
      ...card('mission-0', 'A Mission'),
      card: { name: 'a mission', originalName: 'A Mission', imagefile: 'mission-0', backimagefile: 'back' },
      placedOn: [card('e1', 'An Event')],
    },
    underMission: [card('d1', 'A Dilemma')],
  };
  const renderRow = (slot: MissionSlot, desktop = false, slotBudget?: number) =>
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
        desktop={desktop}
        slotBudget={slotBudget}
      />
    );
  const missionCard = () => document.body.querySelector('[data-card-id="mission-0"]') as HTMLElement;

  it('turns and darkens the card of a completed mission, and nothing else', () => {
    renderRow({ ...doubleSided, completed: true });
    expect(missionCard().style.transform).toBe(`rotate(90deg) scale(${turnedMissionScale(1)})`);
    expect(missionCard()).toHaveClass('motion-safe:transition-transform', 'motion-reduce:transition-none');
    expect(screen.getByRole('img', { name: 'A Mission' })).toHaveClass('brightness-50');
    const stack = screen.getByTestId('mission-under-0-stack');
    const counter = screen.getByRole('button', { name: 'A Mission, 1 event on it' });
    const flip = screen.getByRole('button', { name: /^Flip A Mission/ });
    for (const el of [stack, counter, flip]) {
      for (let a: HTMLElement | null = el; a && a !== document.body; a = a.parentElement) {
        expect(a.style.transform).not.toMatch(/rotate/);
      }
    }
  });

  it('draws a mission that is not complete upright', () => {
    renderRow(doubleSided);
    expect(missionCard().style.transform).toBe('');
  });

  it('puts the Flip button on the corner of the turned card, and the counter in the badge strip', () => {
    renderRow({ ...doubleSided, completed: true }, true);
    const corners = screen.getByTestId('mission-corners-0');
    expect(corners).toContainElement(screen.getByRole('button', { name: /^Flip A Mission/ }));
    expect(corners).not.toContainElement(screen.getByRole('button', { name: 'A Mission, 1 event on it' }));
    // The turned whole card at scale 1 is 100 px wide and 72 px tall.
    expect(corners.style.width).toBe('100px');
    expect(corners.style.height).toBe('72px');
  });

  it('reserves the width of a turned card for every desktop slot, and the card width on touch', () => {
    const { unmount } = renderRow(doubleSided, true);
    expect(missionCard().closest('div.flex-col')).toHaveStyle({ width: '100px' });
    unmount();
    renderRow(doubleSided);
    expect(missionCard().closest('div.flex-col')).toHaveStyle({ width: '72px' });
  });
});

describe('missionSlotWidth and turnedMissionScale (#1060)', () => {
  it('keeps the card width on a touch screen, and shrinks the turned crop to fit its height', () => {
    expect(missionSlotWidth(1)).toBe(72);
    expect(missionSlotWidth(1, false, 10)).toBe(72);
    // The 72 x 64 crop turned is 64 x 72: it fits the slot's 64 px height at 64 / 72.
    expect(turnedMissionScale(1)).toBeCloseTo(64 / 72, 5);
    expect(turnedMissionScale(2)).toBeCloseTo(128 / 144, 5);
  });

  it('reserves the turned card width on a desktop with room, and draws the turned card at full size', () => {
    expect(missionSlotWidth(1, true)).toBe(100);
    expect(missionSlotWidth(1, true, 500)).toBe(100);
    expect(missionSlotWidth(2, true, 500)).toBe(200);
    expect(turnedMissionScale(1, true)).toBe(1);
  });

  it('falls back to the slot width that fits on a narrow desktop, down to the card width', () => {
    expect(missionSlotWidth(1, true, 86.7)).toBe(86);
    expect(missionSlotWidth(1, true, 40)).toBe(72);
    expect(turnedMissionScale(1, true, 86)).toBeCloseTo(0.86, 5);
    expect(turnedMissionScale(1, true, 72)).toBeCloseTo(0.72, 5);
  });
});

describe('MissionRow: a ship row of more than one row (#930)', () => {
  const withShips = (count: number): MissionSlot => ({
    ...emptySlot(),
    ships: Array.from({ length: count }, (_, i) => card(`ship-${i}`, `Ship ${i}`)),
  });

  const renderRow = (count: number, shipRows: number, handlers: { onShipClick?: jest.Mock; onOpenShipRow?: jest.Mock } = {}) =>
    render(
      <MissionRow
        missions={[withShips(count)]}
        onOpenPile={() => {}}
        onShipClick={handlers.onShipClick ?? (() => {})}
        onOpenShipRow={handlers.onOpenShipRow ?? (() => {})}
        onOpenPlacedOn={() => {}}
        shipRows={shipRows}
      />
    );

  const linesOf = () =>
    Array.from(document.body.querySelectorAll('[data-testid^="ship-row-0-line-"]')).map(
      (line) => line.querySelectorAll('[data-zone^="crew-"]').length
    );

  const tapShip = (id: string) =>
    fireEvent.click(document.body.querySelector(`[data-zone="crew-${id}"] button`) as HTMLElement);

  it('keeps 4 ships in one row when only one row is available', () => {
    renderRow(4, 1);
    expect(linesOf()).toEqual([4]);
  });

  it('shows 4 ships as 2 rows of 2, and a tap opens the crew panel', () => {
    const onShipClick = jest.fn();
    const onOpenShipRow = jest.fn();
    renderRow(4, 2, { onShipClick, onOpenShipRow });
    expect(linesOf()).toEqual([2, 2]);
    const row = document.body.querySelector('[data-zone="ship-row-0"]') as HTMLElement;
    expect(row.style.height).toBe('68px'); // 2 rows of 32 px and a 4 px gap
    tapShip('ship-3');
    expect(onShipClick).toHaveBeenCalledWith('ship-3');
    expect(onOpenShipRow).not.toHaveBeenCalled();
  });

  it('shows 6 ships as 3 rows of 2', () => {
    renderRow(6, 3);
    expect(linesOf()).toEqual([2, 2, 2]);
  });

  it('uses only the rows its ships need', () => {
    renderRow(2, 3);
    expect(linesOf()).toEqual([2]);
  });

  it('overlaps the last row past the capacity of the rows, and a tap opens the ship row panel', () => {
    const onShipClick = jest.fn();
    const onOpenShipRow = jest.fn();
    renderRow(5, 2, { onShipClick, onOpenShipRow });
    expect(linesOf()).toEqual([2, 3]);
    tapShip('ship-0');
    expect(onOpenShipRow).toHaveBeenCalledWith(0);
    expect(onShipClick).not.toHaveBeenCalled();
  });
});

// #1099: the cards placed on a mission show in two strips over the mission card, the events on the
// left and the dilemmas on the right.
describe('MissionRow: the strips of the cards placed on a mission (#1099)', () => {
  const dilemma = (id: string, name: string): CardInstance => ({
    ...card(id, name),
    card: { ...card(id, name).card, type: 'dilemma' },
  });
  const withPlaced = (placedOn: CardInstance[], completed = false): MissionSlot => ({
    ...emptySlot(),
    mission: { ...card('mission-0', 'A Mission'), placedOn },
    completed,
  });
  const renderRow = (
    slot: MissionSlot,
    { onOpenPlacedOn = jest.fn(), onSetMissionCompleted = jest.fn(), startHold = jest.fn() } = {},
  ) => {
    render(
      <CardHoldProvider value={{ startHold, endHold: () => {}, startHover: () => {}, endHover: () => {} }}>
        <MissionRow
          missions={[slot]}
          onOpenPile={() => {}}
          onShipClick={() => {}}
          onOpenShipRow={() => {}}
          onOpenPlacedOn={onOpenPlacedOn}
          onSetMissionCompleted={onSetMissionCompleted}
        />
      </CardHoldProvider>
    );
    return { onOpenPlacedOn, onSetMissionCompleted, startHold };
  };
  const strip = (group: 'events' | 'dilemmas') => screen.getByTestId(`mission-on-${group}-strip-0`);
  const stripNames = (group: 'events' | 'dilemmas') =>
    Array.from(strip(group).querySelectorAll('img')).map((img) => img.getAttribute('alt'));

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the events past the left edge and the dilemmas past the right edge (#1126)', () => {
    renderRow(withPlaced([card('e1', 'Event 1'), dilemma('d1', 'Dilemma 1'), card('e2', 'Event 2')]));
    expect(stripNames('events')).toEqual(['Event 1', 'Event 2']);
    expect(stripNames('dilemmas')).toEqual(['Dilemma 1']);
    const layout = placedOnStripLayout(1);
    expect(layout.overhang).toBeGreaterThan(0);
    expect(strip('events').style.left).toBe(`-${layout.overhang}px`);
    expect(strip('dilemmas').style.right).toBe(`-${layout.overhang}px`);
    expect(strip('events').style.top).toBe(`${layout.top}px`);
    // Each small card is the art crop of a table card.
    expect(strip('events').querySelector('img')).toHaveClass('object-cover', 'object-top');
  });

  it('shows the last 3 cards of a group, and the badge keeps the full count', () => {
    renderRow(withPlaced([1, 2, 3, 4].map((n) => card(`e${n}`, `Event ${n}`))));
    expect(stripNames('events')).toEqual(['Event 2', 'Event 3', 'Event 4']);
    expect(screen.getByRole('button', { name: 'A Mission, 4 events on it' })).toBeInTheDocument();
    expect(screen.queryByTestId('mission-on-dilemmas-strip-0')).toBeNull();
  });

  it('gives no strip and no small card a data-zone or a data-card-id', () => {
    renderRow(withPlaced([card('e1', 'Event 1'), dilemma('d1', 'Dilemma 1')]));
    for (const group of ['events', 'dilemmas'] as const) {
      expect(strip(group).closest('[data-zone]')).toBeNull();
      expect(strip(group).querySelector('[data-zone], [data-card-id]')).toBeNull();
      expect(strip(group).closest('[data-card-id]')).toBeNull();
    }
    expect(document.body.querySelectorAll('[data-card-id="e1"]')).toHaveLength(0);
  });

  it("opens each strip's own panel once the double-tap window passes", () => {
    const { onOpenPlacedOn, onSetMissionCompleted } = renderRow(
      withPlaced([card('e1', 'Event 1'), dilemma('d1', 'Dilemma 1')]),
    );
    fireEvent.click(strip('events'), { clientX: 5, clientY: 20 });
    act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS - 1);
    });
    expect(onOpenPlacedOn).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onOpenPlacedOn).toHaveBeenCalledWith('mission-0', 'events');
    fireEvent.click(strip('dilemmas'), { clientX: 65, clientY: 20 });
    act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS);
    });
    expect(onOpenPlacedOn).toHaveBeenLastCalledWith('mission-0', 'dilemmas');
    expect(onSetMissionCompleted).not.toHaveBeenCalled();
  });

  it('toggles completion on a double-tap of a strip, and opens no panel', () => {
    const { onOpenPlacedOn, onSetMissionCompleted } = renderRow(withPlaced([card('e1', 'Event 1')]));
    fireEvent.click(strip('events'), { clientX: 5, clientY: 20 });
    fireEvent.click(strip('events'), { clientX: 6, clientY: 21 });
    act(() => {
      jest.advanceTimersByTime(DOUBLE_TAP_MS * 2);
    });
    expect(onSetMissionCompleted).toHaveBeenCalledWith(0, true);
    expect(onOpenPlacedOn).not.toHaveBeenCalled();
  });

  it('previews the small card on a hold, not the mission', () => {
    const { startHold } = renderRow(withPlaced([card('e1', 'Event 1')]));
    fireEvent.pointerDown(strip('events').querySelector('[data-testid="placed-on-strip-card"]')!, { button: 0 });
    act(() => {
      jest.advanceTimersByTime(HOLD_DELAY_MS);
    });
    expect(startHold).toHaveBeenCalledWith('e1', expect.anything());
  });

  it('turns the strips with a completed mission, and darkens their cards', () => {
    renderRow(withPlaced([card('e1', 'Event 1')], true));
    const strips = screen.getByTestId('mission-strips-0');
    expect(strips.style.transform).toBe(`translate(-50%, -50%) rotate(90deg) scale(${turnedMissionScale(1)})`);
    expect(strips).toContainElement(strip('events'));
    expect(strip('events').querySelector('img')).toHaveClass('brightness-50');
    expect(document.body.querySelector('[data-card-id="mission-0"]')!.closest('div.flex-col')).toHaveStyle({
      width: '72px',
    });
  });

  it('draws the strips upright on a mission that is not complete', () => {
    renderRow(withPlaced([card('e1', 'Event 1')]));
    expect(screen.getByTestId('mission-strips-0').style.transform).toBe('translate(-50%, -50%)');
  });
});

describe('placedOnStripLayout (#1099)', () => {
  it.each([1, 1.5, 2.4])('fits 3 cards between the title and the point box at scale %s', (scale) => {
    const layout = placedOnStripLayout(scale);
    const stripBottom = layout.top + layout.cardHeight + layout.step * (PLACED_ON_STRIP_MAX_VISIBLE - 1);
    expect(stripBottom).toBeLessThanOrEqual(layout.bottom);
    // The cards overlap no more than half their height, so each stays readable as a card.
    expect(layout.step).toBeGreaterThanOrEqual(layout.cardHeight / 2);
    // Both strips leave at least half the width of the mission art clear, and the strips stay on the art crop.
    expect(2 * (layout.cardWidth - layout.overhang)).toBeLessThanOrEqual(Math.round(72 * scale) / 2);
    // The strips of two neighbouring missions, 8 px apart (`gap-2`), do not touch (#1126).
    expect(2 * layout.overhang).toBeLessThan(8);
    expect(layout.bottom).toBeLessThanOrEqual(Math.round(64 * scale));
  });
});

// #1133: the touch crop cuts off the span, so it draws the span between the quadrant icon and the
// point box. A desktop shows the whole card, printed span included.
describe('MissionRow: the span on the cropped mission card (#1133)', () => {
  const withSpan = (span: string, completed = false): MissionSlot => ({
    ...emptySlot(),
    mission: { ...card('mission-0', 'A Mission'), card: { ...card('mission-0', 'A Mission').card, span } },
    completed,
  });
  const renderRow = (slot: MissionSlot, desktop = false) =>
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
        desktop={desktop}
      />
    );

  it('shows the span on a touch layout, and it is not a drop target', () => {
    renderRow(withSpan('3'));
    const span = screen.getByTestId('mission-span-0');
    expect(span).toHaveTextContent('3');
    expect(span).toHaveAccessibleName('Span 3');
    expect(span).toHaveClass('pointer-events-none');
    expect(span.closest('[data-zone]')).toBeNull();
    expect(span.closest('[data-card-id]')).toBeNull();
    expect(span.querySelector('[data-zone], [data-card-id]')).toBeNull();
    // The rail the disc breaks, and the grey plate under it (#1140).
    expect(span).toContainElement(screen.getByTestId('mission-span-0-rail'));
    expect(span).toContainElement(screen.getByTestId('mission-span-0-plate'));
    // The numeral is upright and skewed about its own centre, not italic (#1140).
    const numeral = screen.getByTestId('mission-span-0-numeral');
    expect(numeral.style.transform).toBe('skewX(-12deg)');
    expect(numeral.closest('.italic')).toBeNull();
  });

  it('shows no span on a desktop layout', () => {
    renderRow(withSpan('3'), true);
    expect(screen.queryByTestId('mission-span-0')).toBeNull();
  });

  it('shows no span for a mission with no span value', () => {
    renderRow(withSpan(''));
    expect(screen.queryByTestId('mission-span-0')).toBeNull();
  });

  it('turns the span with a completed mission', () => {
    renderRow(withSpan('2', true));
    expect(screen.getByTestId('mission-strips-0')).toContainElement(screen.getByTestId('mission-span-0'));
    expect(screen.getByTestId('mission-strips-0').style.transform).toMatch(/rotate\(90deg\)/);
  });

  it('darkens the span with a completed mission, as the card image (#1140)', () => {
    renderRow(withSpan('2', true));
    expect(screen.getByTestId('mission-span-0')).toHaveClass(COMPLETED_IMAGE_CLASSNAME);
  });

  it('does not darken the span of a mission that is not completed', () => {
    renderRow(withSpan('2'));
    expect(screen.getByTestId('mission-span-0')).not.toHaveClass(COMPLETED_IMAGE_CLASSNAME);
  });
});

// #1272: an AP mission prints its row of the quadrant icon, the span and the point box below the
// crop, so the crop draws the whole row from the card data.
describe('MissionRow: the row of an AP mission on the crop (#1272)', () => {
  // Argus Array, 60AP001, as `useDataFetching` lowercases it.
  const argusArray: MissionSlot = {
    ...emptySlot(),
    mission: {
      id: 'mission-0',
      card: {
        name: 'argus array',
        originalName: 'Argus Array',
        imagefile: 'stve-en60001',
        type: 'mission',
        rarity: 'ap',
        collectorsinfo: '60ap001',
        quadrant: 'a',
        span: '3',
        points: '30',
      },
      face: 'up',
    },
  };
  const moabIV: MissionSlot = {
    ...emptySlot(),
    mission: {
      id: 'mission-0',
      card: { name: 'moab iv', originalName: 'Moab IV', imagefile: 'x', type: 'mission', rarity: 'r', quadrant: 'a', span: '2', points: '35' },
      face: 'up',
    },
  };
  const renderRow = (slot: MissionSlot, desktop = false) =>
    render(
      <MissionRow
        missions={[slot]}
        onOpenPile={() => {}}
        onShipClick={() => {}}
        onOpenShipRow={() => {}}
        onOpenPlacedOn={() => {}}
        desktop={desktop}
      />
    );

  it('draws the quadrant icon, the span and the point box of an AP mission', () => {
    renderRow(argusArray);
    const row = screen.getByTestId('mission-span-0');
    expect(row).toHaveAccessibleName('Alpha Quadrant, Span 3, 30 points');
    expect(row).toContainElement(screen.getByTestId('mission-span-0-quadrant'));
    expect(screen.getByTestId('mission-span-0-quadrant').querySelector('img')).toHaveAttribute('src', alphaQuadrantIcon.src);
    expect(screen.getByTestId('mission-span-0-points')).toHaveTextContent('30');
    expect(screen.getByTestId('mission-span-0-numeral')).toHaveTextContent('3');
    expect(row.querySelector('[data-zone], [data-card-id]')).toBeNull();
  });

  it('runs the rail and the plate of an AP mission uncut', () => {
    renderRow(argusArray);
    expect(screen.getByTestId('mission-span-0-rail').style.maskImage).toBe('');
    expect(screen.getByTestId('mission-span-0-plate').style.maskImage).toBe('');
  });

  it('draws no quadrant icon or point box on a regular mission', () => {
    renderRow(moabIV);
    expect(screen.getByTestId('mission-span-0')).toHaveAccessibleName('Span 2');
    expect(screen.queryByTestId('mission-span-0-quadrant')).toBeNull();
    expect(screen.queryByTestId('mission-span-0-points')).toBeNull();
  });

  it('draws nothing over an AP mission on a desktop', () => {
    renderRow(argusArray, true);
    expect(screen.queryByTestId('mission-span-0')).toBeNull();
    expect(screen.queryByTestId('mission-span-0-quadrant')).toBeNull();
    expect(screen.queryByTestId('mission-span-0-points')).toBeNull();
  });
});

describe('hasApMissionLayout (#1272)', () => {
  it('is true for an AP mission only', () => {
    expect(hasApMissionLayout({ type: 'mission', rarity: 'ap' })).toBe(true);
    expect(hasApMissionLayout({ type: 'Mission', rarity: 'AP' })).toBe(true);
    expect(hasApMissionLayout({ type: 'personnel', rarity: 'ap' })).toBe(false);
    expect(hasApMissionLayout({ type: 'mission', rarity: 'r' })).toBe(false);
    expect(hasApMissionLayout(undefined)).toBe(false);
  });
});

describe('missionSpanLayout (#1133)', () => {
  const SCALES = [1, 375 / 320, 97 / 72, 2.4];
  const card = (scale: number) => {
    const width = Math.round(72 * scale);
    return { width, fullHeight: Math.round((width * 167) / 120), artHeight: Math.round(64 * scale) };
  };

  it.each(SCALES)('centres the disc on the line of the quadrant icon and the point box at scale %s (#1140)', (scale) => {
    const { top, width, axis, backing, backingLeft, ring, rim } = missionSpanLayout(scale);
    const { width: cardWidth, fullHeight } = card(scale);
    expect(width).toBe(cardWidth);
    // Both are centred at y 283.5 of the 499 px tall image.
    expect(top + axis).toBeCloseTo(fullHeight * (283.5 / 499), 5);
    // The disc is on whole pixels, centred across the card, and within half a pixel of that line.
    expect(Number.isInteger(top)).toBe(true);
    expect(Number.isInteger(backingLeft)).toBe(true);
    expect(backingLeft * 2 + backing).toBe(cardWidth);
    expect(Math.abs(axis - backing / 2)).toBeLessThanOrEqual(0.5);
    // The ring sits on whole pixels inside the backing, and its rim leaves a black disc inside it.
    expect(Number.isInteger((backing - ring) / 2)).toBe(true);
    expect(ring).toBeLessThan(backing);
    expect(ring - 2 * rim).toBeGreaterThan(0);
  });

  it.each(SCALES)('draws the disc as large as the quadrant icon and the point box at scale %s (#1141)', (scale) => {
    const { backing } = missionSpanLayout(scale);
    const { width: cardWidth } = card(scale);
    // 57 px across on the 357 px wide image, the outer edge of their chrome, to the nearest 2 px.
    expect(Math.abs(backing - (cardWidth * 57) / 357)).toBeLessThanOrEqual(1);
  });

  it.each(SCALES)('runs the rail and the plate from the chrome of one to the chrome of the other at scale %s (#1140)', (scale) => {
    const { bandLeft, bandWidth, chromeRadius } = missionSpanLayout(scale);
    const { width: cardWidth } = card(scale);
    // From the centre of the quadrant icon (x 37.5 of 357) to the centre of the point box (x 319.5),
    // with both cut at the chrome, 28.5 px in radius, the same on both sides.
    expect(bandLeft).toBeCloseTo((cardWidth * 37.5) / 357, 5);
    expect(bandLeft + bandWidth).toBeCloseTo((cardWidth * 319.5) / 357, 5);
    expect(chromeRadius).toBeCloseTo((cardWidth * 28.5) / 357, 5);
  });

  it.each(SCALES)('fills the plate down to the card\'s border at scale %s (#1140)', (scale) => {
    const { top, height, backing, plateBottom } = missionSpanLayout(scale);
    const { width: cardWidth, fullHeight, artHeight } = card(scale);
    // The black border is 6 of 240 of the card width, at least 2 px. The plate reaches half a pixel
    // into it. The disc ends level with the chrome of the two circles (y 312 of 499), which can
    // reach into the border, and inside the crop (#1141).
    const borderTop = artHeight - Math.max(2, Math.round((cardWidth * 6) / 240));
    expect(top + plateBottom).toBe(borderTop + 0.5);
    expect(height).toBe(Math.max(backing, plateBottom));
    expect(Math.abs(top + backing - (fullHeight * 312) / 499)).toBeLessThanOrEqual(1);
    expect(top + backing).toBeLessThanOrEqual(artHeight);
  });

  it.each(SCALES)('draws a rail of about the printed height on whole pixels at scale %s (#1140)', (scale) => {
    const { rail, backing } = missionSpanLayout(scale);
    const { width: cardWidth } = card(scale);
    expect(Math.abs(rail - (cardWidth * 18) / 357)).toBeLessThanOrEqual(1);
    expect(Number.isInteger((backing - rail) / 2)).toBe(true);
  });

  it.each([1, 375 / 320, 2.4])('draws the numeral 19/44 of the disc tall at scale %s (#1141)', (scale) => {
    const { numeral, fontSize, backing } = missionSpanLayout(scale);
    // The card prints a 19 px numeral on a 44 px disc.
    expect(numeral).toBeCloseTo((backing * 19) / 44, 5);
    expect(fontSize * 0.78).toBeCloseTo(numeral, 1);
  });
});

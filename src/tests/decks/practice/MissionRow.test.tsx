jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MissionRow, {
  missionSlotWidth,
  turnedMissionScale,
  underMissionHeadroom,
} from '../../../app/decks/practice/MissionRow';
import CountBadge from '../../../app/decks/practice/CountBadge';
import { CardHoldProvider, DOUBLE_TAP_MS, HOLD_DELAY_MS } from '../../../app/decks/practice/useCardHold';
import { CardInstance, MissionSlot } from '../../../app/decks/practice/tableReducer';
import eventIcon from '../../../../public/icons/icon_event.gif';

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

    const counter = screen.getByRole('button', { name: /^A Mission, 1 card on it$/ });
    expect(counter).toHaveTextContent('1');
    // #1069: it sits in the badge strip, to the right of the away team badge, not on the card's corner.
    const awayTeam = screen.getByTestId('mission-pile-awayTeam-0');
    expect(counter.parentElement).toBe(awayTeam.parentElement);
    expect(awayTeam.nextElementSibling).toBe(counter);
    expect(screen.getByTestId('mission-corners-0')).not.toContainElement(counter);
    // It shows the event icon, whatever the placed card is.
    const icon = counter.querySelector('img') as HTMLImageElement;
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('src')).toBe(eventIcon.src);
    expect(icon).toHaveAttribute('alt', '');
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
    const counter = screen.getByRole('button', { name: 'A Mission, 1 card on it' });
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
    expect(corners).not.toContainElement(screen.getByRole('button', { name: 'A Mission, 1 card on it' }));
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

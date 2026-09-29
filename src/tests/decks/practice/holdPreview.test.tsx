// Mock next/navigation hooks (required for App Router hooks in Jest/jsdom)
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

// Mock useDataFetching hook
jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock deckBuilderUtils to spy on deckFromTsv and extractDrawDeck
jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  extractDrawDeck: jest.fn(),
  shuffleArray: jest.fn((arr) => arr),
}));

// Mock react-icons to avoid jsdom noise
jest.mock('react-icons/fa', () => ({
  FaRedo: () => null,
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
}));

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// See discardDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd`
// directly and to capture the ids each draggable table card registers, since jsdom has no real
// pointer geometry for dnd-kit to detect drop targets with.
const mockDraggableIds: string[] = [];
let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
let mockOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
let mockOnDragCancel: (() => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd, onDragCancel }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragEnd = onDragEnd;
      mockOnDragCancel = onDragCancel;
      return children;
    },
    DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: ({ id }: { id: string }) => {
      mockDraggableIds.push(id);
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
    },
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';
import { HOLD_DELAY_MS, HOVER_DELAY_MS } from '../../../app/decks/practice/useCardHold';

// jsdom has no PointerEvent, so `fireEvent.pointerEnter` would drop `pointerType` and `buttons`,
// which the hover reads (#766).
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

// Press and hold a card to preview it (#763), on the whole page. Since #764 the hold is the only
// way to open the preview: the tap acts, the hold looks, and the preview is read-only.

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'drawDeck', count: 1 },
];

const mockShipCard = {
  collectorsinfo: '1R900',
  originalName: 'U.S.S. Relativity',
  type: 'ship',
  name: 'u.s.s. relativity',
  imagefile: 'relativity',
  pile: 'drawDeck',
  count: 1,
};

const mockPersonnelCard = {
  collectorsinfo: '2C002',
  originalName: 'Data',
  type: 'personnel',
  name: 'data',
  imagefile: 'data',
  pile: 'drawDeck',
  count: 1,
};

const mockEquipmentCard = {
  collectorsinfo: '1U001',
  originalName: 'Tricorder',
  type: 'equipment',
  name: 'tricorder',
  imagefile: 'tricorder',
  pile: 'drawDeck',
  count: 1,
};

const mockMissionCard = {
  collectorsinfo: '1R100',
  originalName: 'First Contact',
  type: 'mission',
  name: 'first contact',
  imagefile: 'first_contact',
  pile: 'mission',
  count: 1,
};

const deckOf = (...cards: any[]) =>
  Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

// The enlarged image of the preview, if the preview shows the named card.
const preview = (name: string) => {
  const image = screen.queryByTestId('card-preview-enlarged');
  return image && image.getAttribute('alt')?.toLowerCase() === name.toLowerCase() ? image : null;
};

const hold = (element: Element) => {
  fireEvent.pointerDown(element, { button: 0 });
  act(() => {
    jest.advanceTimersByTime(HOLD_DELAY_MS);
  });
};

// A tap as the browser sends it: a press, a release, and the click.
const tap = (element: Element) => {
  act(() => {
    fireEvent.pointerDown(element, { button: 0 });
    fireEvent.pointerUp(element);
    fireEvent.click(element);
  });
};

const release = () => {
  act(() => {
    fireEvent.pointerUp(window);
  });
};

describe('Practice draw: press and hold a card to preview it (#763)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockOnDragCancel = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    (deckFromTsv as jest.Mock).mockReturnValue({});
    (shuffleArray as jest.Mock).mockImplementation((arr) => arr);
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    Object.defineProperty(screen, 'orientation', {
      value: { lock: jest.fn().mockResolvedValue(undefined), unlock: jest.fn() },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Renders the page with the given hand cards (and the given missions) and opens the hand.
  const setupOpenHand = async (cards: any[], missions: any[] = []) => {
    localStorage.setItem('currentDeck', JSON.stringify(deckOf(...cards, ...missions)));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (extractDrawDeck as jest.Mock).mockReturnValue(cards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // The game menu opens on every load (#781), and the first press outside it closes it and
    // swallows that press's click. A tap on the menu button itself closes it instead, so every
    // test below starts with a table that acts on the first tap.
    const menuButton = screen.queryByRole('button', { name: 'Game menu' });
    if (menuButton?.getAttribute('aria-expanded') === 'true') {
      await act(async () => {
        fireEvent.pointerDown(menuButton, { button: 0 });
        fireEvent.pointerUp(menuButton);
        fireEvent.click(menuButton);
      });
    }

    const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
    jest.useFakeTimers();
  };

  const drag = (id: string, over: string) => {
    act(() => {
      mockOnDragStart!({ active: { id } });
    });
    act(() => {
      mockOnDragEnd!({ active: { id }, over: { id: over } });
    });
  };

  it('a hold on a mission card shows its preview, and the release hides it', async () => {
    await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
    const mission = screen.getByRole('button', { name: 'first contact' });

    fireEvent.pointerDown(mission, { button: 0 });
    act(() => {
      jest.advanceTimersByTime(HOLD_DELAY_MS - 1);
    });
    expect(preview('first contact')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(preview('first contact')).toBeInTheDocument();

    release();
    // The click that follows the release does not reopen it.
    fireEvent.click(mission);
    expect(preview('first contact')).toBeNull();
  });

  it('a release before 500 ms shows no preview', async () => {
    await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'first contact' }), { button: 0 });
    act(() => {
      jest.advanceTimersByTime(HOLD_DELAY_MS - 1);
    });
    release();
    act(() => {
      jest.advanceTimersByTime(HOLD_DELAY_MS);
    });
    expect(preview('first contact')).toBeNull();
  });

  it('a hold on an open-hand card shows its preview', async () => {
    await setupOpenHand([mockEquipmentCard]);
    hold(screen.getByRole('button', { name: 'tricorder' }));
    expect(preview('tricorder')).toBeInTheDocument();
    release();
    expect(preview('tricorder')).toBeNull();
  });

  it('a drag start closes a hold-opened preview', async () => {
    await setupOpenHand([mockEquipmentCard]);
    const [id] = mockDraggableIds;
    hold(screen.getByRole('button', { name: 'tricorder' }));
    expect(preview('tricorder')).toBeInTheDocument();
    act(() => {
      mockOnDragStart!({ active: { id } });
    });
    expect(preview('tricorder')).toBeNull();
  });

  describe('a drag end closes a hold-opened preview (#776)', () => {
    // `handleDragStart` already closes a preview, so each test opens one again during the drag,
    // with a hold on the mission card. Only a preview that comes back during the drag can show
    // that the drag's end clears it.
    const holdDuringDrag = async (endDrag: (id: string) => void) => {
      await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
      const element = screen.getByRole('button', { name: 'tricorder' });
      const id = element.getAttribute('data-card-id')!;
      element.getBoundingClientRect = () =>
        ({ left: 370, top: 503, right: 443, bottom: 607, width: 73, height: 104, x: 370, y: 503, toJSON: () => ({}) }) as DOMRect;
      act(() => {
        mockOnDragStart!({ active: { id }, activatorEvent: { clientX: 406.5, clientY: 555, target: element } } as any);
      });
      hold(screen.getByRole('button', { name: 'first contact' }));
      expect(preview('first contact')).toBeInTheDocument();
      act(() => endDrag(id));
      expect(screen.queryByTestId('card-preview')).toBeNull();
      return id;
    };

    it('a release within the cancel radius (the #774 cancel)', async () => {
      const id = await holdDuringDrag((id) =>
        mockOnDragEnd!({ active: { id }, over: { id: 'core' }, delta: { x: 9, y: 0 } } as any)
      );
      // The card did not move, and the hand is open again.
      expect(document.body.querySelector(`[data-zone="core"] [data-card-id="${id}"]`)).toBeNull();
    });

    it('a drop onto the core', async () => {
      const id = await holdDuringDrag((id) =>
        mockOnDragEnd!({ active: { id }, over: { id: 'core' }, delta: { x: 0, y: -300 } } as any)
      );
      expect(document.body.querySelector(`[data-zone="core"] [data-card-id="${id}"]`)).not.toBeNull();
    });

    it('onDragCancel', async () => {
      await holdDuringDrag(() => mockOnDragCancel!());
    });
  });

  it('a press that closes a stuck hold preview does not act on the table (#776)', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    drag(shipId, 'mission-under-2');
    drag(personnelId, `crew-${shipId}`);
    const ship = screen.getByRole('button', { name: 'u.s.s. relativity' });
    // A hold whose release the page never sees.
    hold(ship);
    expect(preview('u.s.s. relativity')).toBeInTheDocument();
    // The next tap, on the ship, closes the preview and opens no crew panel.
    tap(ship);
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(screen.queryByTestId('card-preview')).toBeNull();
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).toBeNull();
    // The tap after that acts as usual.
    tap(ship);
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).not.toBeNull();
  });

  it('a hold on a ship shows its preview only, without its crew panel; a hold on a crew card keeps the panel open', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    drag(shipId, 'mission-under-2');
    drag(personnelId, `crew-${shipId}`);

    const ship = screen.getByRole('button', { name: 'u.s.s. relativity' });
    hold(ship);
    expect(preview('u.s.s. relativity')).toBeInTheDocument();
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).toBeNull();
    release();
    expect(preview('u.s.s. relativity')).toBeNull();

    // A tap on the ship opens its crew panel and no preview. A hold on the crew card shows that
    // card; the release hides it, the panel stays open, and the card's selection is unchanged.
    tap(ship);
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).not.toBeNull();
    expect(screen.queryByTestId('card-preview')).toBeNull();
    const crewCard = screen.getByRole('button', { name: 'data' });
    hold(crewCard);
    expect(preview('data')).toBeInTheDocument();
    release();
    fireEvent.click(crewCard);
    expect(screen.queryByTestId('card-preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'Select data' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).not.toBeNull();
  });

  it("a hold on the ship in its crew panel shows the ship's preview and keeps the panel open (#832)", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;
    drag(shipId, 'mission-under-2');
    drag(personnelId, `crew-${shipId}`);
    tap(screen.getByRole('button', { name: 'u.s.s. relativity' }));

    const panelShip = screen.getByTestId('card-list-panel-crew-ship').querySelector('[aria-label="u.s.s. relativity"]')!;
    hold(panelShip);
    expect(preview('u.s.s. relativity')).toBeInTheDocument();
    release();
    expect(preview('u.s.s. relativity')).toBeNull();
    expect(document.body.querySelector('[data-testid="card-list-panel-crew"]')).not.toBeNull();
  });

  it('the preview holds no button and takes no pointer events (#764)', async () => {
    await setupOpenHand([mockEquipmentCard]);
    hold(screen.getByRole('button', { name: 'tricorder' }));
    const layer = screen.getByTestId('card-preview');
    expect(layer).toHaveClass('pointer-events-none');
    expect(layer.querySelector('button')).toBeNull();
    release();
  });

  describe('the preview takes the side away from the press point (#879)', () => {
    // jsdom's viewport is 1024 px wide, so the middle is at 512.
    const holdAt = (element: Element, clientX: number) => {
      fireEvent.pointerDown(element, { button: 0, clientX, clientY: 100 });
      act(() => {
        jest.advanceTimersByTime(HOLD_DELAY_MS);
      });
    };

    it('a press on the left half keeps the preview on the right edge', async () => {
      await setupOpenHand([mockEquipmentCard]);
      holdAt(screen.getByRole('button', { name: 'tricorder' }), 100);
      const image = preview('tricorder');
      expect(image).toHaveClass('right-4');
      expect(image).not.toHaveClass('left-4');
      release();
    });

    it('a press on the right half puts the preview on the left edge', async () => {
      await setupOpenHand([mockEquipmentCard]);
      holdAt(screen.getByRole('button', { name: 'tricorder' }), 900);
      const image = preview('tricorder');
      expect(image).toHaveClass('left-4');
      expect(image).not.toHaveClass('right-4');
      release();
    });

    it('a mouse hover on the right half puts the preview on the left edge', async () => {
      await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
      fireEvent.pointerEnter(screen.getByRole('button', { name: 'first contact' }), {
        pointerType: 'mouse',
        buttons: 0,
        clientX: 900,
        clientY: 100,
      });
      act(() => {
        jest.advanceTimersByTime(HOVER_DELAY_MS);
      });
      expect(preview('first contact')).toHaveClass('left-4');
    });
  });

  describe('a mouse hover (#766)', () => {
    const enter = (element: Element, init: PointerEventInit = {}) =>
      fireEvent.pointerEnter(element, { pointerType: 'mouse', buttons: 0, ...init });
    const leave = (element: Element) => fireEvent.pointerLeave(element, { pointerType: 'mouse' });
    const wait = (ms: number) =>
      act(() => {
        jest.advanceTimersByTime(ms);
      });

    it('a hover on a mission card shows its preview after 300 ms, and a leave hides it', async () => {
      await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
      const mission = screen.getByRole('button', { name: 'first contact' });
      enter(mission);
      wait(HOVER_DELAY_MS - 1);
      expect(preview('first contact')).toBeNull();
      wait(1);
      expect(preview('first contact')).toBeInTheDocument();
      act(() => {
        leave(mission);
      });
      expect(preview('first contact')).toBeNull();
    });

    it('a drag start closes a hover preview', async () => {
      await setupOpenHand([mockEquipmentCard]);
      const [id] = mockDraggableIds;
      enter(screen.getByRole('button', { name: 'tricorder' }));
      wait(HOVER_DELAY_MS);
      expect(preview('tricorder')).toBeInTheDocument();
      act(() => {
        mockOnDragStart!({ active: { id } });
      });
      expect(preview('tricorder')).toBeNull();
    });

    it('a hover that starts during a drag shows nothing', async () => {
      await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
      const [id] = mockDraggableIds;
      act(() => {
        mockOnDragStart!({ active: { id } });
      });
      enter(screen.getByRole('button', { name: 'first contact' }));
      wait(HOVER_DELAY_MS);
      act(() => {
        mockOnDragCancel!();
      });
      expect(preview('first contact')).toBeNull();
    });

    it('a hover, then a hold on the same card, then a release with no move closes the preview (#784)', async () => {
      await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
      const mission = screen.getByRole('button', { name: 'first contact' });
      enter(mission);
      wait(HOVER_DELAY_MS);
      hold(mission);
      expect(preview('first contact')).toBeInTheDocument();
      release();
      expect(preview('first contact')).toBeNull();
    });
  });

  describe('a press closes the preview (#784)', () => {
    it('a press on the table closes a stuck preview, and its click does nothing else', async () => {
      await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
      const mission = screen.getByRole('button', { name: 'first contact' });
      const tricorder = screen.getByRole('button', { name: 'tricorder' });
      hold(mission);
      expect(preview('first contact')).toBeInTheDocument();
      // The release never reaches the page, so the preview stays up.
      const onClick = jest.fn();
      tricorder.addEventListener('click', onClick);
      tap(tricorder);
      expect(preview('first contact')).toBeNull();
      expect(onClick).not.toHaveBeenCalled();
      // The next tap acts as normal.
      tap(tricorder);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('a press off the hovered card closes a hover preview whose card moved away, and does nothing else', async () => {
      await setupOpenHand([mockEquipmentCard], [mockMissionCard]);
      const mission = screen.getByRole('button', { name: 'first contact' });
      const tricorder = screen.getByRole('button', { name: 'tricorder' });
      fireEvent.pointerEnter(mission, { pointerType: 'mouse', buttons: 0 });
      act(() => {
        jest.advanceTimersByTime(HOVER_DELAY_MS);
      });
      expect(preview('first contact')).toBeInTheDocument();
      // No `pointerleave` arrives: the card moved out from under a still pointer.
      const onClick = jest.fn();
      tricorder.addEventListener('click', onClick);
      tap(tricorder);
      expect(preview('first contact')).toBeNull();
      expect(onClick).not.toHaveBeenCalled();
    });

    it('a click on the hovered card itself still acts', async () => {
      await setupOpenHand([mockEquipmentCard]);
      const tricorder = screen.getByRole('button', { name: 'tricorder' });
      fireEvent.pointerEnter(tricorder, { pointerType: 'mouse', buttons: 0 });
      act(() => {
        jest.advanceTimersByTime(HOVER_DELAY_MS);
      });
      expect(preview('tricorder')).toBeInTheDocument();
      const onClick = jest.fn();
      tricorder.addEventListener('click', onClick);
      tap(tricorder);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});

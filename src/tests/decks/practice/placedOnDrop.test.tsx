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
let mockOnDragOver: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragOver, onDragEnd, onDragCancel }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragOver = onDragOver;
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
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import { PLACE_ON_HOLD_MS } from '../../../app/decks/practice/useCardHold';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'drawDeck', count: 1 },
];

const mockEventCard = {
  collectorsinfo: '1U002',
  originalName: 'Distress Call',
  type: 'event',
  name: 'distress call',
  imagefile: 'distress_call',
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

const mockShipCard = {
  collectorsinfo: '1R900',
  originalName: 'U.S.S. Relativity',
  type: 'ship',
  name: 'u.s.s. relativity',
  imagefile: 'relativity',
  pile: 'drawDeck',
  count: 1,
};

const mockManyDeck = {
  [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard },
  [mockPersonnelCard.collectorsinfo]: { count: 1, row: mockPersonnelCard },
  [mockShipCard.collectorsinfo]: { count: 1, row: mockShipCard },
};

// Issue #810: a card in the core or the brig takes a placed card. A drop on its own droppable places the
// dragged card on it, a counter shows how many cards sit on it, and a tap on it opens those cards
// in a panel, the only place a placed card comes off.
describe('Practice draw: a card in the core or the brig takes a placed card (#810)', () => {
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

  const openHand = async () => {
    const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
  };

  const drag = async (id: string, overId: string) => {
    await act(async () => {
      mockOnDragStart!({ active: { id } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: { id: overId } });
    });
  };

  // A drag that holds over the drop target for `holdMs` before the drop (#1029). The drag moves
  // onto the target, then the timers run on.
  const holdDrag = async (id: string, overId: string, holdMs = PLACE_ON_HOLD_MS) => {
    jest.useFakeTimers();
    try {
      await act(async () => {
        mockOnDragStart!({ active: { id } });
      });
      await act(async () => {
        mockOnDragOver!({ active: { id }, over: { id: overId } });
      });
      await act(async () => {
        jest.advanceTimersByTime(holdMs);
      });
      await act(async () => {
        mockOnDragEnd!({ active: { id }, over: { id: overId } });
      });
    } finally {
      jest.useRealTimers();
    }
  };

  const cardIdOf = (name: string): string =>
    screen.getByRole('button', { name }).getAttribute('data-card-id')!;

  // Deals an event and a personnel card to the hand, and drags the event into the core.
  const setupCorePlacedOn = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (extractDrawDeck as jest.Mock).mockReturnValue([mockEventCard, mockPersonnelCard]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await openHand();
    const eventId = cardIdOf('Distress Call');
    const personnelId = cardIdOf('Data');
    await drag(eventId, 'core');
    await openHand();
    return { eventId, personnelId };
  };

  it('gives each card in the core a droppable named after its id', async () => {
    const { eventId } = await setupCorePlacedOn();

    const target = document.body.querySelector(`[data-zone="on-${eventId}"]`);
    expect(target).not.toBeNull();
    expect(document.body.querySelector('[data-zone="core"]')!.contains(target)).toBe(true);
  });

  it('places a card dropped on a core card on that card, and counts it', async () => {
    const { eventId, personnelId } = await setupCorePlacedOn();

    await holdDrag(personnelId, `on-${eventId}`);

    // The personnel card is placed on the event, not a card of its own in the core.
    expect(screen.queryByRole('button', { name: 'Data' })).toBeNull();
    expect(screen.getByLabelText('Distress Call, 1 card on it')).toBeInTheDocument();
  });

  // #1029: with the core full of cards, any drop on the zone lands on a card. A drop there with no
  // hold, or a hold shorter than `PLACE_ON_HOLD_MS`, adds the card to the core.
  it.each([
    ['no hold', 0],
    ['a hold shorter than PLACE_ON_HOLD_MS', PLACE_ON_HOLD_MS - 1],
  ])('puts a card dropped on a core card after %s in the core, not on the card', async (_, holdMs) => {
    const { eventId, personnelId } = await setupCorePlacedOn();

    if (holdMs === 0) await drag(personnelId, `on-${eventId}`);
    else await holdDrag(personnelId, `on-${eventId}`, holdMs);

    const coreZone = document.body.querySelector('[data-zone="core"]')!;
    expect(coreZone.contains(screen.getByRole('button', { name: 'Data' }))).toBe(true);
    expect(screen.queryByLabelText(/card on it$/)).toBeNull();
  });

  it('starts the hold again when the drag leaves the card before PLACE_ON_HOLD_MS', async () => {
    const { eventId, personnelId } = await setupCorePlacedOn();

    jest.useFakeTimers();
    try {
      await act(async () => {
        mockOnDragStart!({ active: { id: personnelId } });
      });
      await act(async () => {
        mockOnDragOver!({ active: { id: personnelId }, over: { id: `on-${eventId}` } });
      });
      await act(async () => {
        jest.advanceTimersByTime(PLACE_ON_HOLD_MS - 100);
      });
      await act(async () => {
        mockOnDragOver!({ active: { id: personnelId }, over: { id: 'core' } });
      });
      await act(async () => {
        mockOnDragOver!({ active: { id: personnelId }, over: { id: `on-${eventId}` } });
      });
      await act(async () => {
        jest.advanceTimersByTime(PLACE_ON_HOLD_MS - 100);
      });
      await act(async () => {
        mockOnDragEnd!({ active: { id: personnelId }, over: { id: `on-${eventId}` } });
      });
    } finally {
      jest.useRealTimers();
    }

    const coreZone = document.body.querySelector('[data-zone="core"]')!;
    expect(coreZone.contains(screen.getByRole('button', { name: 'Data' }))).toBe(true);
    expect(screen.queryByLabelText(/card on it$/)).toBeNull();
  });

  it('still puts a card dropped on the core, off any card, in the core', async () => {
    const { personnelId } = await setupCorePlacedOn();

    await drag(personnelId, 'core');

    const coreZone = document.body.querySelector('[data-zone="core"]')!;
    expect(coreZone.contains(screen.getByRole('button', { name: 'Data' }))).toBe(true);
    expect(screen.queryByLabelText(/card on it$/)).toBeNull();
  });

  it('keeps a core card dropped on its own droppable in the core', async () => {
    const { eventId } = await setupCorePlacedOn();

    await drag(eventId, `on-${eventId}`);

    const coreZone = document.body.querySelector('[data-zone="core"]')!;
    expect(coreZone.contains(screen.getByRole('button', { name: 'Distress Call' }))).toBe(true);
  });

  it('lists the placed cards in a panel, and a drag out of the panel takes one off', async () => {
    const { eventId, personnelId } = await setupCorePlacedOn();
    await holdDrag(personnelId, `on-${eventId}`);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Distress Call' }));
    });

    const panel = document.body.querySelector('[data-testid="card-list-panel-on"]');
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByRole('button', { name: 'Data' })).toBeInTheDocument();

    await drag(personnelId, 'core');

    const coreZone = document.body.querySelector('[data-zone="core"]')!;
    expect(coreZone.contains(screen.getByRole('button', { name: 'Data' }))).toBe(true);
    expect(screen.queryByLabelText(/card on it$/)).toBeNull();
    // #881: the panel shows the host card too, so it stays open with an empty grid.
    const emptyGrid = document.body.querySelector('[data-testid="card-list-panel-on"]');
    expect(emptyGrid).not.toBeNull();
    expect(within(emptyGrid as HTMLElement).queryAllByRole('button')).toHaveLength(0);
    expect(document.body.querySelector('[data-testid="card-list-panel-on-host"]')).not.toBeNull();
  });

  it('shows the host card in its own section, outside the grid of the placed cards (#881)', async () => {
    const { eventId, personnelId } = await setupCorePlacedOn();
    await holdDrag(personnelId, `on-${eventId}`);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Distress Call' }));
    });

    const grid = document.body.querySelector('[data-testid="card-list-panel-on"]') as HTMLElement;
    const hostSection = document.body.querySelector('[data-testid="card-list-panel-on-host"]') as HTMLElement;
    expect(hostSection).not.toBeNull();
    expect(hostSection.querySelector('img[alt="Distress Call"]')).not.toBeNull();
    expect(grid.contains(hostSection)).toBe(false);
    expect(hostSection.contains(grid)).toBe(false);
    expect(within(grid).queryByRole('button', { name: 'Distress Call' })).toBeNull();

    // Display only: neither a drop target nor a drag source.
    expect(hostSection.querySelector('[data-zone]')).toBeNull();
    expect(hostSection.querySelector('[data-card-id]')).toBeNull();
    expect(hostSection.hasAttribute('data-zone')).toBe(false);
    expect(hostSection.hasAttribute('data-card-id')).toBe(false);
  });

  it('keeps a placed card in the grid selectable and draggable (#881)', async () => {
    const { eventId, personnelId } = await setupCorePlacedOn();
    await holdDrag(personnelId, `on-${eventId}`);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Distress Call' }));
    });

    const grid = document.body.querySelector('[data-testid="card-list-panel-on"]') as HTMLElement;
    const placed = within(grid).getByRole('button', { name: 'Data' });
    expect(placed.getAttribute('data-card-id')).toBe(personnelId);
    expect(mockDraggableIds).toContain(personnelId);

    await act(async () => {
      fireEvent.click(placed);
    });
    expect(within(grid).getByRole('button', { name: 'Deselect Data' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the core panel, not a panel of placed cards, on a tap on a card with nothing on it', async () => {
    await setupCorePlacedOn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Distress Call' }));
    });

    expect(document.body.querySelector('[data-testid="card-list-panel-core"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="card-list-panel-on"]')).toBeNull();
  });
});

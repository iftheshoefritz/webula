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

// Mock deckBuilderUtils to spy on deckFromTsv and expandDeck
jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  expandDeck: jest.fn(),
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
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, expandDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

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

// Issue #810: a card in the core or the brig is a host. A drop on its own droppable places the
// dragged card on it, a counter shows how many cards sit on it, and a tap on it opens those cards
// in a panel, the only place a card comes off the host.
describe('Practice draw: a card in the core or the brig is a host (#810)', () => {
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

  const cardIdOf = (name: string): string =>
    screen.getByRole('button', { name }).getAttribute('data-card-id')!;

  // Deals an event and a personnel card to the hand, and drags the event into the core.
  const setupCoreHost = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockEventCard, mockPersonnelCard]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await openHand();
    const eventId = cardIdOf('distress call');
    const personnelId = cardIdOf('data');
    await drag(eventId, 'core');
    await openHand();
    return { eventId, personnelId };
  };

  it('gives each card in the core a droppable named after its id', async () => {
    const { eventId } = await setupCoreHost();

    const host = document.body.querySelector(`[data-zone="on-${eventId}"]`);
    expect(host).not.toBeNull();
    expect(document.body.querySelector('[data-zone="core"]')!.contains(host)).toBe(true);
  });

  it('places a card dropped on a core card on that card, and counts it', async () => {
    const { eventId, personnelId } = await setupCoreHost();

    await drag(personnelId, `on-${eventId}`);

    // The personnel card is on the host, not a card of its own in the core.
    expect(screen.queryByRole('button', { name: 'data' })).toBeNull();
    expect(screen.getByLabelText('distress call, 1 card on it')).toBeInTheDocument();
  });

  it('still puts a card dropped on the core, off any card, in the core', async () => {
    const { personnelId } = await setupCoreHost();

    await drag(personnelId, 'core');

    const coreZone = document.body.querySelector('[data-zone="core"]')!;
    expect(coreZone.contains(screen.getByRole('button', { name: 'data' }))).toBe(true);
    expect(screen.queryByLabelText(/card on it$/)).toBeNull();
  });

  it('keeps a core card dropped on its own droppable in the core', async () => {
    const { eventId } = await setupCoreHost();

    await drag(eventId, `on-${eventId}`);

    const coreZone = document.body.querySelector('[data-zone="core"]')!;
    expect(coreZone.contains(screen.getByRole('button', { name: 'distress call' }))).toBe(true);
  });

  it('lists the cards on the host in a panel, and a drag out of the panel takes one off', async () => {
    const { eventId, personnelId } = await setupCoreHost();
    await drag(personnelId, `on-${eventId}`);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'distress call' }));
    });

    const panel = document.body.querySelector('[data-zone="pile-panel-on"]');
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByRole('button', { name: 'data' })).toBeInTheDocument();

    await drag(personnelId, 'core');

    const coreZone = document.body.querySelector('[data-zone="core"]')!;
    expect(coreZone.contains(screen.getByRole('button', { name: 'data' }))).toBe(true);
    expect(screen.queryByLabelText(/card on it$/)).toBeNull();
    expect(document.body.querySelector('[data-zone="pile-panel-on"]')).toBeNull();
  });

  it('opens the core panel, not a host panel, on a tap on a card with nothing on it', async () => {
    await setupCoreHost();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'distress call' }));
    });

    expect(document.body.querySelector('[data-zone="pile-panel-core"]')).not.toBeNull();
    expect(document.body.querySelector('[data-zone="pile-panel-on"]')).toBeNull();
  });
});

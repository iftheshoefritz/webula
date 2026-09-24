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

// See coreBrigDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd`
// directly, since jsdom has no real pointer geometry for dnd-kit to detect drop targets with.
const mockDraggableIds: string[] = [];
let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
let mockOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragEnd = onDragEnd;
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
import { deckFromTsv, expandDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
];

const mockEventCard = {
  collectorsinfo: '1U002',
  originalName: 'Distress Call',
  type: 'event',
  name: 'distress call',
  imagefile: 'distress_call',
  pile: 'draw',
  count: 1,
};

const mockPersonnelCard = {
  collectorsinfo: '2C002',
  originalName: 'Data',
  type: 'personnel',
  name: 'data',
  imagefile: 'data',
  pile: 'draw',
  count: 1,
};

const mockManyDeck = {
  [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard },
  [mockPersonnelCard.collectorsinfo]: { count: 1, row: mockPersonnelCard },
};

// #711: opening a mission's pile panel, then tapping a core (or brig) card behind it without
// closing it first, used to open a second panel that showed the first panel's cards until it was
// closed and reopened — `openPile`/`openFlatZone`/`openCrewShipId` each opened a panel but none
// cleared the other two, so `openPanelCards` kept reading whichever one it checked first.
describe('Practice draw: only one pile panel is ever open at a time (#711)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
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

  it('opening the core panel over an open mission pile panel closes the mission panel and shows the core\'s own cards', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockPersonnelCard, mockEventCard]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // #740 keeps the hand open after a drag out of it, so this helper taps the closed row only
    // when the hand is closed.
    const openHand = () =>
      act(async () => {
        const closed = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
        if (closed) fireEvent.click(closed);
      });

    // Drag the personnel card into mission 0's personnel pile.
    await openHand();
    const [personnelId, eventId] = mockDraggableIds;
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: 'mission-0' } });
    });

    // Drag the event card into the core (a drag closes the hand, so reopen it first).
    await openHand();
    await act(async () => {
      mockOnDragStart!({ active: { id: eventId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: eventId }, over: { id: 'core' } });
    });

    // Open the mission's personnel pile panel.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^personnel pile, 1 card, tap to open$/i }));
    });
    expect(document.body.querySelector('[data-zone="pile-panel-personnel"]')).not.toBeNull();

    // Without closing it, tap the core card sitting behind it.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'distress call' }));
    });

    // The mission's pile panel is gone; the core's own panel is open and shows the core's card.
    expect(document.body.querySelector('[data-zone="pile-panel-personnel"]')).toBeNull();
    const corePanel = document.body.querySelector('[data-zone="pile-panel-core"]');
    expect(corePanel).not.toBeNull();
    expect(corePanel!.querySelector('[data-card-id]')?.getAttribute('data-card-id')).toBe(eventId);
    expect(screen.queryByRole('button', { name: 'data' })).not.toBeInTheDocument();
  });
});

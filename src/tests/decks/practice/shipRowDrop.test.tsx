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
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd, onDragCancel }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragEnd = onDragEnd;
      void onDragCancel;
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

const mockShipCard = {
  collectorsinfo: '1R900',
  originalName: 'U.S.S. Relativity',
  type: 'ship',
  name: 'u.s.s. relativity',
  imagefile: 'relativity',
  pile: 'draw',
  count: 1,
};

const mockEquipmentCard = {
  collectorsinfo: '1U001',
  originalName: 'Tricorder',
  type: 'equipment',
  name: 'tricorder',
  imagefile: 'tricorder',
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
  [mockShipCard.collectorsinfo]: { count: 1, row: mockShipCard },
  [mockEquipmentCard.collectorsinfo]: { count: 1, row: mockEquipmentCard },
};

describe('Practice draw: dropping a hand card on a mission or its ship row', () => {
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

  // Renders the page with the given deck and opens the hand, so its cards are draggable.
  const setupOpenHand = async (cards: any[]) => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(cards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const closedHandButton = screen.getByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
  };

  it('moves a dragged ship out of the hand and into the target mission\'s ship row when dropped on the mission card', async () => {
    await setupOpenHand([mockShipCard]);
    const [draggedId] = mockDraggableIds;
    expect(screen.getByRole('button', { name: 'u.s.s. relativity' })).toBeInTheDocument();

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'mission-1' } });
    });

    // Gone from the (re-opened) hand fan...
    const closedHandButton = screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i });
    expect(closedHandButton).toBeInTheDocument();

    // ...and now shown in mission 1's ship row.
    const shipRow = document.body.querySelector('[data-zone="ship-row-1"]');
    expect(shipRow).not.toBeNull();
    expect(screen.getByRole('button', { name: 'u.s.s. relativity' })).toBeInTheDocument();
    expect(shipRow!.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
  });

  it('moves a dragged ship into the target mission\'s ship row when dropped on the ship row itself', async () => {
    await setupOpenHand([mockShipCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'ship-row-3' } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-3"]');
    expect(shipRow!.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
  });

  it('files a non-ship card into the personnel pile when dropped on a mission card (#602)', async () => {
    await setupOpenHand([mockEquipmentCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'mission-0' } });
    });

    // Gone from the (re-opened) hand...
    const closedHandButton = screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i });
    expect(closedHandButton).toBeInTheDocument();

    // ...and now filed into mission 0's personnel pile badge.
    expect(screen.getByRole('button', { name: /personnel pile, 1 card/i })).toBeInTheDocument();
  });

  it('files a non-ship card into the personnel pile when dropped on a ship row (#602)', async () => {
    await setupOpenHand([mockEquipmentCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'ship-row-0' } });
    });

    const closedHandButton = screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i });
    expect(closedHandButton).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /personnel pile, 1 card/i })).toBeInTheDocument();
  });

  it('drags a ship out of a ship row to the discard pile', async () => {
    await setupOpenHand([mockShipCard]);
    // A card's instance id stays the same across a move (only its face changes), so the id the
    // hand fan first registered with useDraggable also names the ship once it sits in the ship
    // row.
    const [shipId] = mockDraggableIds;

    // First drop the ship on a mission's ship row.
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-2' } });
    });

    // Then drag it from the ship row to the discard pile.
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'discard' } });
    });

    expect(document.body.querySelector('[data-zone="ship-row-2"] [data-card-id]')).toBeNull();
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();
  });

  it("moves a ship with a crew member to a different mission's ship row, keeping its crew aboard (#601)", async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;

    // Place the ship on mission 0.
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-0' } });
    });

    // Re-open the hand (drag start closed it) and board the personnel card as crew.
    const closedHandButton = screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: `crew-${shipId}` } });
    });
    expect(
      screen.getByRole('button', { name: /u\.s\.s\. relativity crew, 1 card, tap to open/i })
    ).toBeInTheDocument();

    // Drag the crewed ship to mission 4's ship row, crossing over the missions in between.
    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-4' } });
    });

    const sourceRow = document.body.querySelector('[data-zone="ship-row-0"]');
    const destinationRow = document.body.querySelector('[data-zone="ship-row-4"]');
    expect(sourceRow!.querySelector('[data-card-id]')).toBeNull();
    expect(destinationRow!.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
    const badge = screen.getByRole('button', { name: /u\.s\.s\. relativity crew, 1 card, tap to open/i });
    expect(destinationRow!.contains(badge)).toBe(true);

    await act(async () => {
      fireEvent.click(badge);
    });
    expect(screen.getByRole('button', { name: 'data' })).toBeInTheDocument();
  });

  it('does not change the ship row when a ship is dropped back on the mission it already occupies (#601)', async () => {
    await setupOpenHand([mockShipCard]);
    const [shipId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-2' } });
    });

    await act(async () => {
      mockOnDragStart!({ active: { id: shipId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: shipId }, over: { id: 'mission-2' } });
    });

    const shipRow = document.body.querySelector('[data-zone="ship-row-2"]');
    expect(shipRow!.contains(screen.getByRole('button', { name: 'u.s.s. relativity' }))).toBe(true);
  });
});

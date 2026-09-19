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

const mockShipCard = {
  collectorsinfo: '1R900',
  originalName: 'U.S.S. Relativity',
  type: 'ship',
  name: 'u.s.s. relativity',
  imagefile: 'relativity',
  pile: 'draw',
  count: 1,
};

const mockManyDeck = {
  [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard },
  [mockPersonnelCard.collectorsinfo]: { count: 1, row: mockPersonnelCard },
  [mockShipCard.collectorsinfo]: { count: 1, row: mockShipCard },
};

describe('Practice draw: dropping cards on the core and the brig (#603)', () => {
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

  it('shows an event dragged from the hand face up in the core', async () => {
    await setupOpenHand([mockEventCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'core' } });
    });

    const coreZone = document.body.querySelector('[data-zone="core"]');
    expect(coreZone).not.toBeNull();
    const card = screen.getByRole('button', { name: 'distress call' });
    expect(coreZone!.contains(card)).toBe(true);
  });

  it('shows a personnel card dragged from the hand face up in the brig', async () => {
    await setupOpenHand([mockPersonnelCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'brig' } });
    });

    const brigZone = document.body.querySelector('[data-zone="brig"]');
    expect(brigZone).not.toBeNull();
    const card = screen.getByRole('button', { name: 'data' });
    expect(brigZone!.contains(card)).toBe(true);
  });

  it('shows a personnel card dragged from a crew row face up in the brig', async () => {
    await setupOpenHand([mockShipCard, mockPersonnelCard]);
    const [shipId, personnelId] = mockDraggableIds;

    // Place the ship on a mission's ship row.
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

    // Drag the crew member off the ship and into the brig.
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: 'brig' } });
    });

    const brigZone = document.body.querySelector('[data-zone="brig"]');
    expect(brigZone!.querySelector(`[data-card-id="${personnelId}"]`)).not.toBeNull();
  });

  it('removes a card from the brig when it is dragged to the discard pile', async () => {
    await setupOpenHand([mockPersonnelCard]);
    const [draggedId] = mockDraggableIds;

    // Drop into the brig first.
    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'brig' } });
    });
    const brigZone = document.body.querySelector('[data-zone="brig"]');
    expect(brigZone!.querySelector(`[data-card-id="${draggedId}"]`)).not.toBeNull();

    // Then drag it out to the discard pile.
    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'discard' } });
    });

    expect(document.body.querySelector('[data-zone="brig"] [data-card-id]')).toBeNull();
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();
  });

  it('opens the card preview when a card in the core is tapped', async () => {
    await setupOpenHand([mockEventCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'core' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'distress call' }));
    });

    expect(screen.getByRole('button', { name: /distress call, tap to shrink/i })).toBeInTheDocument();
  });

  // #635: the dashed outline and the full 56x80 box (the same size the empty zone always shows,
  // see FlatCardRow.tsx) helped the player see the drop target before a card was ever put there.
  // Once the zone holds a card, both disappeared. These checks put a card in the zone first, then
  // start a second drag mid-flight (mockOnDragStart with no mockOnDragEnd, the zoneHighlight.test.tsx
  // pattern) to inspect the outline and size while that drag is still active.
  it("shows the core's outline and full box size while a second card is dragged, after a card already sits there", async () => {
    await setupOpenHand([mockEventCard, mockPersonnelCard]);
    const [firstId, secondId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'core' } });
    });

    const coreZone = () => document.body.querySelector('[data-zone="core"]') as HTMLElement;
    expect(coreZone().className).not.toEqual(expect.stringContaining('border-dashed'));

    // Re-open the hand (the first drag start closed it) and start dragging the second card.
    const closedHandButton = screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });

    expect(coreZone().className).toEqual(expect.stringContaining('border-dashed'));
    expect(coreZone().style.width).toBe('56px');
    expect(coreZone().style.height).toBe('80px');
  });

  it("shows the brig's outline and full box size while a second card is dragged, after a card already sits there", async () => {
    await setupOpenHand([mockPersonnelCard, mockEventCard]);
    const [firstId, secondId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'brig' } });
    });

    const brigZone = () => document.body.querySelector('[data-zone="brig"]') as HTMLElement;
    expect(brigZone().className).not.toEqual(expect.stringContaining('border-dashed'));

    // Re-open the hand (the first drag start closed it) and start dragging the second card.
    const closedHandButton = screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });

    expect(brigZone().className).toEqual(expect.stringContaining('border-dashed'));
    expect(brigZone().style.width).toBe('56px');
    expect(brigZone().style.height).toBe('80px');
  });
});

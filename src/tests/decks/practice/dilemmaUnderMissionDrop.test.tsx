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
import { expandDeck } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
];

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemma',
  count: 2,
};

const mockDilemmaDeck = {
  [mockDilemmaCard.collectorsinfo]: { count: 2, row: mockDilemmaCard },
};

// Issue #733 took the per-mission dilemma stack (`MissionSlot.dilemma`, #605) out of the table
// state. A dilemma dropped on a mission card now always goes under that mission (#606), whatever
// zone it comes from, so the tests here cover that one route. The face-down stack itself is now a
// single top-level `dilemmaStack` zone, which #630 draws on the table.
describe('Practice table: a dilemma dropped on a mission goes under it (#606, #733)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    (expandDeck as jest.Mock).mockReturnValue([]);
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });

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

  // Renders the page with a deck holding 2 copies of a dilemma, draws both into the dilemma
  // hand, and opens it so its cards are draggable.
  const setupOpenDilemmaHand = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDilemmaDeck));

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const drawDilemmaButton = screen.getByRole('button', { name: 'Dilemma pile top, tap to draw' });
    await act(async () => {
      fireEvent.click(drawDilemmaButton);
    });
    await act(async () => {
      fireEvent.click(drawDilemmaButton);
    });

    const closedDilemmaHandButton = screen.getByRole('button', { name: /^dilemma hand, 2 cards, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedDilemmaHandButton);
    });
  };

  it('puts a dilemma dragged out of the dilemma hand under the mission, not in a stack', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-0' } });
    });

    // No mission column has a dilemma pile or its badge any more (#733).
    expect(document.body.querySelector('[data-zone="mission-pile-dilemma-0"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Dilemma pile, 1 card, tap to open/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Under the mission pile, 1 card, tap to open/i })).toBeInTheDocument();
  });

  it('moves a dilemma from under one mission to under another', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-0' } });
    });

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-1' } });
    });

    // One under-the-mission pile of 1 card, now at mission-1 rather than mission-0.
    const underMissionButtons = screen.getAllByRole('button', {
      name: /Under the mission pile, 1 card, tap to open/i,
    });
    expect(underMissionButtons).toHaveLength(1);
  });

  it('moves the discard pile\'s top dilemma under a mission when dragged there (#606 review)', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = mockDraggableIds;

    // Discard the dilemma from the dilemma hand first, so it sits on top of the discard pile.
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'discard' } });
    });
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-0' } });
    });

    expect(screen.getByRole('button', { name: /Under the mission pile, 1 card, tap to open/i })).toBeInTheDocument();
  });
});

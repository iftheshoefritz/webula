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

const mockPersonnelCard = {
  collectorsinfo: '2C002',
  originalName: 'Data',
  type: 'personnel',
  name: 'data',
  imagefile: 'data',
  pile: 'draw',
  count: 1,
};

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemma',
  count: 2,
};

const mockPersonnelDeck = {
  [mockPersonnelCard.collectorsinfo]: { count: 1, row: mockPersonnelCard },
};

const mockDilemmaDeck = {
  [mockDilemmaCard.collectorsinfo]: { count: 2, row: mockDilemmaCard },
};

// Issue #644: the closed hand (and the closed dilemma hand) are real drop targets, so a card
// dragged from anywhere on the table can land back in the hand it belongs to.
describe('Practice draw: dropping a table card back into the hand (#644)', () => {
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

  it("moves a personnel card dragged from a mission's personnel pile back into the hand, raising the hand count", async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockPersonnelDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockPersonnelCard]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const closedHandButton = screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
    const [personnelId] = mockDraggableIds;

    // Drop the card from the hand onto a mission, filing it into that mission's personnel pile.
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: 'mission-0' } });
    });
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();

    // Open the mission's personnel pile panel and drag the card back into the hand.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^personnel pile, 1 card, tap to open$/i }));
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: personnelId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: personnelId }, over: { id: 'hand' } });
    });

    expect(screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i })).toBeInTheDocument();
    const handZone = document.body.querySelector('[data-zone="hand"]');
    expect(handZone).not.toBeNull();
    expect(document.body.querySelector('[data-zone="pile-panel-personnel"]')).toBeNull();
  });

  it('moves a dilemma dragged from a mission\'s dilemma stack back into the dilemma hand', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDilemmaDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([]);

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
    const [firstId] = mockDraggableIds;

    // Build a one-card dilemma stack at mission-0, leaving one dilemma in the dilemma hand.
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-0' } });
    });
    expect(screen.getByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i })).toBeInTheDocument();

    // Open the mission's dilemma stack panel and drag the stacked card back into the dilemma hand.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^dilemma pile, 1 card, tap to open$/i }));
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaHand' } });
    });

    expect(screen.getByRole('button', { name: /^dilemma hand, 2 cards, tap to open$/i })).toBeInTheDocument();
  });

  // Browser checks drag with `agent-browser drag '[data-card-id="..."]' '[data-zone="hand"]'`
  // (see AGENTS.md), so this selector is part of the page's contract.
  it('marks the closed hand with the data-zone selector browser checks use', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockPersonnelDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockPersonnelCard]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(document.body.querySelector('[data-zone="hand"]')).not.toBeNull();
  });
});

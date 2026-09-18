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

// See dilemmaStackDrop.test.tsx: same mock dnd-kit setup used elsewhere to drive `onDragStart`
// directly. Here `useDroppable` is stubbed so only the dilemma pile's top half reports
// `isOver: true`, which is the one thing no browser drag can hold still for long enough to check
// (#607 review): the "Top"/"Bottom" position label only appears while `isOver` is true for that
// half, and a CLI drag completes in a single call with no lingering hover state.
const mockDraggableIds: string[] = [];
let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragCancel }: any) => {
      mockOnDragStart = onDragStart;
      void onDragCancel;
      return children;
    },
    DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
    useDraggable: ({ id }: { id: string }) => {
      mockDraggableIds.push(id);
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
    },
    useDroppable: ({ id }: { id: string }) => ({ setNodeRef: () => {}, isOver: id === 'dilemma-pile-top' }),
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
  [mockDilemmaCard.collectorsinfo]: { count: 1, row: mockDilemmaCard },
  [mockPersonnelCard.collectorsinfo]: { count: 1, row: mockPersonnelCard },
};

describe('Practice table: dilemma pile position label during a drag (#607 review)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
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

  // Renders the page with the given hand cards and opens the hand, so its cards are draggable.
  const setupOpenHand = async (cards: any[]) => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (expandDeck as jest.Mock).mockReturnValue(cards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const closedHandButton = screen.getByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
  };

  it('shows "Top" and not "Bottom" while dragging a dilemma over the pile', async () => {
    await setupOpenHand([mockDilemmaCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });

    expect(screen.getByText('Top')).toBeInTheDocument();
    expect(screen.queryByText('Bottom')).not.toBeInTheDocument();
  });

  it('shows neither label while dragging a non-dilemma card', async () => {
    await setupOpenHand([mockPersonnelCard]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });

    expect(screen.queryByText('Top')).not.toBeInTheDocument();
    expect(screen.queryByText('Bottom')).not.toBeInTheDocument();
  });
});

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

// dnd-kit needs real pointer geometry to detect drop targets, which jsdom doesn't provide.
// Mock just enough of it to capture the DndContext's `onDragEnd` and the ids each hand card
// registers with `useDraggable`, so tests can simulate a drop by calling `onDragEnd` directly
// with the id of the card actually rendered in the hand.
const mockDraggableIds: string[] = [];
let mockOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: any) => {
      mockOnDragEnd = onDragEnd;
      return children;
    },
    useDraggable: ({ id }: { id: string }) => {
      mockDraggableIds.push(id);
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
    },
    useDroppable: () => ({ setNodeRef: () => {} }),
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

const makeManyCards = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    collectorsinfo: `1U${String(i + 1).padStart(3, '0')}`,
    originalName: `Card ${i + 1}`,
    type: 'equipment',
    name: `card ${i + 1}`,
    imagefile: `card_${i + 1}`,
    pile: 'draw',
    count: 1,
  }));

const mockManyCards = makeManyCards(10);

const mockManyDeck = Object.fromEntries(
  mockManyCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]),
);

describe('Practice draw: dropping a hand card on the discard pile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
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

  const setupHandWithOneCard = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });

    return mockDraggableIds[mockDraggableIds.length - 1];
  };

  it('moves the dropped card out of the hand and into the discard pile', async () => {
    const draggedId = await setupHandWithOneCard();
    expect(screen.getByRole('button', { name: 'card 1' })).toBeInTheDocument();

    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'discard' } });
    });

    expect(screen.queryByRole('button', { name: 'card 1' })).not.toBeInTheDocument();
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('moves only the dropped copy when the hand has two copies of the same card', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockManyCards[0], mockManyCards[0]]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });

    expect(screen.getAllByRole('button', { name: 'card 1' })).toHaveLength(2);
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'discard' } });
    });

    expect(screen.getAllByRole('button', { name: 'card 1' })).toHaveLength(1);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('leaves the card in the hand when the drop misses the discard pile', async () => {
    const draggedId = await setupHandWithOneCard();

    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: null });
    });

    expect(screen.getByRole('button', { name: 'card 1' })).toBeInTheDocument();
    expect(screen.queryByAltText('Discard pile')).not.toBeInTheDocument();
  });

  it('reset clears the discard pile along with the pile and hand', async () => {
    const draggedId = await setupHandWithOneCard();
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'discard' } });
    });
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();

    const resetButton = screen.getByRole('button', { name: /^reset$/i });
    await act(async () => {
      fireEvent.click(resetButton);
    });

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByAltText('Discard pile')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'card 1' })).not.toBeInTheDocument();
  });
});

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

// Issue #743: gives the draw pile the same two drop halves the dilemma pile already has
// (#607). See discardDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/
// `onDragEnd` directly and to capture the ids each draggable table card registers, since jsdom
// has no real pointer geometry for dnd-kit to detect drop targets with.
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

// 8 cards: a new game deals 7 into the hand, leaving exactly one ("card 8") in the draw pile,
// so a drop onto either half has a single pile card to reorder around.
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

const mockManyCards = makeManyCards(8);
const mockManyDeck = Object.fromEntries(mockManyCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

describe('Practice draw: dropping a card on the draw pile (#743)', () => {
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
  const setupOpenHand = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
  };

  it("drops a card from the hand onto the draw pile's top half, so the next draw returns that same card", async () => {
    await setupOpenHand();
    const [draggedId] = mockDraggableIds; // "card 1", the first card dealt into the hand

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'draw-pile-top' } });
    });

    // The hand holds one card less, and the draw pile holds one card more (2, up from 1).
    // #740 keeps the hand open after a drag out of it, and a hidden element has no
    // accessible name, so read the closed row's `aria-label` from the DOM.
    expect(document.body.querySelector('[aria-label="hand, 6 cards, tap to open"]')).not.toBeNull();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Tap the draw pile: the hand gets the same card ("card 1") back.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Draw pile bottom, tap to draw' }));
    });
    expect(screen.getByRole('button', { name: 'card 1' })).toBeInTheDocument();
  });

  it("drops a card from the hand onto the draw pile's bottom half, so the next draw returns a different card", async () => {
    await setupOpenHand();
    const [draggedId] = mockDraggableIds; // "card 1"

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'draw-pile-bottom' } });
    });

    // #740 keeps the hand open after a drag out of it, and a hidden element has no
    // accessible name, so read the closed row's `aria-label` from the DOM.
    expect(document.body.querySelector('[aria-label="hand, 6 cards, tap to open"]')).not.toBeNull();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Tap the draw pile: the hand gets "card 8" (the pile's original sole card) back, not the
    // card just dropped onto the bottom.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Draw pile top, tap to draw' }));
    });
    expect(screen.getByRole('button', { name: 'card 8' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'card 1' })).not.toBeInTheDocument();
  });

  it('drags a card from the core onto the draw pile, leaving the core', async () => {
    await setupOpenHand();
    const [draggedId] = mockDraggableIds; // "card 1"

    // File it into the core first.
    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'core' } });
    });
    const coreZone = document.body.querySelector('[data-zone="core"]');
    expect(coreZone).not.toBeNull();
    expect(coreZone!.querySelector(`[data-card-id="${draggedId}"]`)).not.toBeNull();

    // Then drag it from the core onto the draw pile's bottom half.
    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'draw-pile-bottom' } });
    });

    expect(coreZone!.querySelector(`[data-card-id="${draggedId}"]`)).toBeNull();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('still draws a card on a tap', async () => {
    await setupOpenHand();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Draw pile top, tap to draw' }));
    });

    // #740 keeps the hand open after a drag out of it, and a hidden element has no
    // accessible name, so read the closed row's `aria-label` from the DOM.
    expect(document.body.querySelector('[aria-label="hand, 8 cards, tap to open"]')).not.toBeNull();
  });

  // Browser checks drag with `scripts/practice_drag.sh` (see AGENTS.md), so these selectors are
  // part of the page's contract.
  it('marks both halves with the data-zone selectors browser checks use', async () => {
    await setupOpenHand();

    expect(document.body.querySelector('[data-zone="draw-pile-top"]')).not.toBeNull();
    expect(document.body.querySelector('[data-zone="draw-pile-bottom"]')).not.toBeNull();
  });
});

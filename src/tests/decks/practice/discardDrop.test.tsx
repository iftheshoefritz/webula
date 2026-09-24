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

// dnd-kit needs real pointer geometry to detect drop targets, which jsdom doesn't provide.
// Mock just enough of it to capture the DndContext's `onDragStart`/`onDragEnd`, to render
// `DragOverlay`'s children so tests can assert what it shows mid-drag, and to capture the ids
// each open-hand card registers with `useDraggable`, so tests can simulate a drag by calling
// `onDragStart`/`onDragEnd` directly with the id of the card actually rendered in the hand.
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
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockOnDragCancel = null;
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

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: /^hand, \d+ cards?, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
  };

  it('moves the dropped card out of the hand and into the discard pile', async () => {
    await setupOpenHand([mockManyCards[0]]);
    const [draggedId] = mockDraggableIds;
    expect(screen.getByRole('button', { name: 'card 1' })).toBeInTheDocument();

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'discard' } });
    });

    expect(screen.queryByRole('button', { name: 'card 1' })).not.toBeInTheDocument();
    const discardCard = screen.getByAltText('Discard pile');
    expect(discardCard).toBeInTheDocument();
    expect(discardCard.parentElement).toHaveTextContent('1');
  });

  it('moves only the dropped copy when the hand has two copies of the same card', async () => {
    await setupOpenHand([mockManyCards[0], mockManyCards[0]]);

    expect(screen.getAllByRole('button', { name: 'card 1' })).toHaveLength(2);
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'discard' } });
    });

    // The hand closed on drag start; re-open it to check the remaining copy.
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: /^hand, 1 card, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }

    expect(screen.getAllByRole('button', { name: 'card 1' })).toHaveLength(1);
    const discardCard = screen.getByAltText('Discard pile');
    expect(discardCard.parentElement).toHaveTextContent('1');
  });

  // Browser checks drag with `agent-browser drag '[data-zone="hand"] [data-card-id]' '[data-zone="discard"]'`
  // (see AGENTS.md), so these selectors are part of the page's contract. Dragging is only
  // possible from the open hand.
  it('marks the zones and the open-hand cards with the selectors that browser checks use', async () => {
    await setupOpenHand([mockManyCards[0]]);
    const [draggedId] = mockDraggableIds;
    const handZone = document.body.querySelector('[data-zone="hand"]');
    expect(handZone).not.toBeNull();
    expect(handZone!.querySelector(`[data-card-id="${draggedId}"]`)).not.toBeNull();
    expect(document.body.querySelector('[data-zone="pile"]')).not.toBeNull();
    expect(document.body.querySelector('[data-zone="discard"]')).not.toBeNull();
  });

  it('starting a drag from the open hand closes it and shows the card in the drag overlay', async () => {
    await setupOpenHand([mockManyCards[0]]);
    const [draggedId] = mockDraggableIds;
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });

    // The fan (and its backdrop) is gone; the closed hand button is back.
    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i })).toBeInTheDocument();

    // The DragOverlay carries a copy of the dragged card under the pointer.
    const overlay = screen.getByTestId('drag-overlay');
    expect(overlay.querySelector('img')).toHaveAttribute('src', '/cardimages/card_1.jpg');
  });

  it('clears the drag overlay when the browser cancels the drag', async () => {
    await setupOpenHand([mockManyCards[0]]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    expect(screen.getByTestId('drag-overlay').querySelector('img')).not.toBeNull();

    await act(async () => {
      mockOnDragCancel!();
    });

    expect(screen.getByTestId('drag-overlay').querySelector('img')).toBeNull();
    // #740: the cancelled drag puts the hand back on screen, because the hand still holds the
    // card. Before #740 the hand stayed closed and the table held no card at all.
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
    expect(document.body.querySelectorAll('[data-card-id]')).toHaveLength(1);
    expect(document.body.querySelector('[aria-label="hand, 1 card, tap to open"]')).not.toBeNull();
  });

  it('leaves the card in the hand when the drop misses the discard pile', async () => {
    await setupOpenHand([mockManyCards[0]]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: null });
    });

    // #740: the hand is open again, so its closed row is hidden. The row still carries the
    // count, which is what this check reads.
    expect(document.body.querySelector('[aria-label="hand, 1 card, tap to open"]')).not.toBeNull();
    expect(screen.queryByAltText('Discard pile')).not.toBeInTheDocument();
  });

  // #721: the button above the draw pile shuffles it in place; it no longer resets the game,
  // so a discarded card stays in the discard pile.
  it('the button above the draw pile leaves the discard pile untouched', async () => {
    await setupOpenHand([mockManyCards[0]]);
    const [draggedId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'discard' } });
    });
    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();

    const shuffleButton = screen.getByRole('button', { name: /^shuffle$/i });
    await act(async () => {
      fireEvent.click(shuffleButton);
    });

    expect(screen.getByAltText('Discard pile')).toBeInTheDocument();
  });
});

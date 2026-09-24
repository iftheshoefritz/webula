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

// See dilemmaUnderMissionDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/
// `onDragEnd` directly, since jsdom has no real pointer geometry for dnd-kit to detect drop
// targets with.
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

const mockEventCard = {
  collectorsinfo: '1U002',
  originalName: 'Distress Call',
  type: 'event',
  name: 'distress call',
  imagefile: 'distress_call',
  pile: 'draw',
  count: 1,
};

const mockDeck = {
  [mockDilemmaCard.collectorsinfo]: { count: 2, row: mockDilemmaCard },
  [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard },
};

// #630: a face-down top-level zone to the right of the missions (the state side, `dilemmaStack`
// on `TableState`, was already added by #733). A drop onto it appends to the bottom, so the
// first card dropped stays first in stack order (index 0), the first revealed. A tap opens its
// own `PilePanel`, under the same one-panel-at-a-time rule as every other flat zone (#711), and a
// tap on a card inside that panel gets a working Flip button (the `flip` reducer case already
// handles any plain string zone).
describe('Practice table: the dilemma stack (#630)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    (expandDeck as jest.Mock).mockReturnValue([mockEventCard]);
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

  // Draws both dilemma copies into the dilemma hand and opens it, so its cards are draggable.
  const setupOpenDilemmaHand = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));

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

  it('moves a dropped dilemma onto the stack, appending a second drop after the first', async () => {
    await setupOpenDilemmaHand();
    const [firstId, secondId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });

    expect(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' })).toBeInTheDocument();

    // Reopen the dilemma hand (a drag closes it) to drag the second card too.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i }));
    });
    await act(async () => {
      mockOnDragStart!({ active: { id: secondId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: secondId }, over: { id: 'dilemmaStack' } });
    });

    expect(screen.getByRole('button', { name: 'Dilemma stack, 2 cards, tap to open' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 2 cards, tap to open' }));
    });

    const stackPanel = document.body.querySelector('[data-zone="pile-panel-dilemmaStack"]');
    expect(stackPanel).not.toBeNull();
    const cardIds = Array.from(stackPanel!.querySelectorAll('[data-card-id]')).map((el) =>
      el.getAttribute('data-card-id')
    );
    expect(cardIds).toEqual([firstId, secondId]);
  });

  it('a tap on the stack opens its panel and closes another open panel (#711)', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });

    // Open the regular hand (the drag above already closed the dilemma hand), so the event
    // card's own draggable registers, and drag it into the core.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i }));
    });
    const eventDraggableId = mockDraggableIds[mockDraggableIds.length - 1];
    await act(async () => {
      mockOnDragStart!({ active: { id: eventDraggableId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: eventDraggableId }, over: { id: 'core' } });
    });

    // Open the core's own pile panel.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'distress call' }));
    });
    expect(document.body.querySelector('[data-zone="pile-panel-core"]')).not.toBeNull();

    // Without closing it, tap the dilemma stack.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' }));
    });

    expect(document.body.querySelector('[data-zone="pile-panel-core"]')).toBeNull();
    expect(document.body.querySelector('[data-zone="pile-panel-dilemmaStack"]')).not.toBeNull();
  });

  it('a tap on a card in the stack panel opens a preview with a working Flip button', async () => {
    await setupOpenDilemmaHand();
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'dilemmaStack' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dilemma stack, 1 card, tap to open' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'cardassian trap' }));
    });

    expect(screen.getByText('Face down')).toBeInTheDocument();
    const flipButton = screen.getByRole('button', { name: 'Flip' });
    await act(async () => {
      fireEvent.click(flipButton);
    });

    expect(screen.queryByText('Face down')).not.toBeInTheDocument();
  });
});

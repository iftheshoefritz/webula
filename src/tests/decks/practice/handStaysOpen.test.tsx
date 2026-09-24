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
// directly, since jsdom has no real pointer geometry for dnd-kit to detect drop targets with.
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

const makePersonnel = (n: number) => ({
  collectorsinfo: `2C10${n}`,
  originalName: `Personnel ${n}`,
  type: 'personnel',
  name: `personnel ${n}`,
  imagefile: `personnel_${n}`,
  pile: 'draw',
  count: 1,
});

const mockPersonnelCards = [1, 2, 3].map(makePersonnel);

const mockEventCard = {
  collectorsinfo: '1U002',
  originalName: 'Distress Call',
  type: 'event',
  name: 'distress call',
  imagefile: 'distress_call',
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

// Issue #740: the open hand (and the open dilemma hand) used to close as soon as a drag started
// from it (`handleDragStart`), and nothing ever reopened it — unlike the four pile panels, which
// #675 already taught to stay open after a drag out of them, if they still hold a card.
describe('Practice draw: the open hand stays open after a drag out of it (#740)', () => {
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

  it('stays open, showing the remaining cards, after one of three cards is dragged to the core', async () => {
    const deck = Object.fromEntries(mockPersonnelCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockPersonnelCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand = screen.queryByRole('button', { name: /^hand, 3 cards, tap to open$/i });
    if (closedHand) {
      await act(async () => {
        fireEvent.click(closedHand);
      });
    }
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'core' } });
    });

    // The hand is still open — its backdrop close button is present — and shows the two cards
    // still in it.
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
    const fan = document.body.querySelector('[data-zone="hand"]') as HTMLElement;
    expect(fan).not.toBeNull();
    expect(fan.querySelectorAll('[data-card-id]')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'personnel 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'personnel 3' })).toBeInTheDocument();
  });

  it('closes once the last card is dragged out of a hand that held only one', async () => {
    const deck = { [mockPersonnelCards[0].collectorsinfo]: { count: 1, row: mockPersonnelCards[0] } };
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockPersonnelCards[0]]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand2 = screen.queryByRole('button', { name: /^hand, 1 card, tap to open$/i });
    if (closedHand2) {
      await act(async () => {
        fireEvent.click(closedHand2);
      });
    }
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'core' } });
    });

    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^hand, 0 cards, tap to open$/i })).toBeInTheDocument();
  });

  it('stays open, showing the remaining dilemma, after one of two dilemmas is dragged onto a mission', async () => {
    const deck = { [mockDilemmaCard.collectorsinfo]: { count: 2, row: mockDilemmaCard } };
    localStorage.setItem('currentDeck', JSON.stringify(deck));
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

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand3 = screen.queryByRole('button', { name: /^dilemma hand, 2 cards, tap to open$/i });
    if (closedHand3) {
      await act(async () => {
        fireEvent.click(closedHand3);
      });
    }
    const [firstId] = mockDraggableIds;

    await act(async () => {
      mockOnDragStart!({ active: { id: firstId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: firstId }, over: { id: 'mission-0' } });
    });

    expect(screen.getByRole('button', { name: /^close dilemma hand$/i })).toBeInTheDocument();
    const fan = document.body.querySelector('[data-zone="dilemmaHand"]') as HTMLElement;
    expect(fan).not.toBeNull();
    expect(fan.querySelectorAll('[data-card-id]')).toHaveLength(1);
  });

  it('closes if a drag starts from an open pile panel while the hand is open, unchanged from before #740', async () => {
    const deck = {
      [mockPersonnelCards[0].collectorsinfo]: { count: 1, row: mockPersonnelCards[0] },
      [mockEventCard.collectorsinfo]: { count: 1, row: mockEventCard },
    };
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockPersonnelCards[0], mockEventCard]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // Open the hand and drag the event card to the core (a drag from the hand closes it).
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand4 = screen.queryByRole('button', { name: /^hand, 2 cards, tap to open$/i });
    if (closedHand4) {
      await act(async () => {
        fireEvent.click(closedHand4);
      });
    }
    const [, eventId] = mockDraggableIds;
    await act(async () => {
      mockOnDragStart!({ active: { id: eventId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: eventId }, over: { id: 'core' } });
    });

    // Reopen the hand — it still holds the personnel card.
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand5 = screen.queryByRole('button', { name: /^hand, 1 card, tap to open$/i });
    if (closedHand5) {
      await act(async () => {
        fireEvent.click(closedHand5);
      });
    }
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();

    // Open the core's own pile panel, and drag out of it — this drag starts from the panel, not
    // from the hand, even though the hand is still open.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'distress call' }));
    });
    expect(document.body.querySelector('[data-zone="pile-panel-core"]')).not.toBeNull();

    await act(async () => {
      mockOnDragStart!({ active: { id: eventId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: eventId }, over: null });
    });

    expect(screen.queryByRole('button', { name: /^close hand$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i })).toBeInTheDocument();
  });
});

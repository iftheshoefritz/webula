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
    useDraggable: ({ id }: { id: string }) => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      isDragging: false,
    }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
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

const mockPersonnelCards = [1, 2, 3, 4].map(makePersonnel);

const mockManyDeck = Object.fromEntries(mockPersonnelCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

// #691: the same multi-select-then-drag-together interaction a pile panel already has (#677),
// extended to the open draw-deck hand.
describe('Practice draw: selecting more than one card in the open hand and dragging them together (#691)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  // Renders the page with the given deck and opens the hand, so its cards are visible and
  // selectable.
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

  // Reads a card's own instance id straight off its `data-card-id` attribute, found by its
  // (distinct, in these tests) name, scoped to the open hand's own fan.
  const cardIdFor = (name: string): string => {
    const fan = document.body.querySelector('[data-zone="hand"]');
    const scope = fan ? within(fan as HTMLElement) : screen;
    return scope.getByRole('button', { name }).getAttribute('data-card-id')!;
  };

  const selectCard = async (name: string) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Select ${name}` }));
    });
  };

  it('drags every selected card together, leaving the rest of the hand behind', async () => {
    await setupOpenHand(mockPersonnelCards);

    await selectCard('personnel 1');
    await selectCard('personnel 2');
    await selectCard('personnel 3');

    // Drag one of the three selected cards — the other two go along with it.
    const draggedId = cardIdFor('personnel 2');
    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'core' } });
    });

    expect(screen.getByRole('button', { name: /^hand, 1 card, tap to open$/i })).toBeInTheDocument();
    const coreZone = document.body.querySelector('[data-zone="core"]') as HTMLElement;
    expect(coreZone.querySelectorAll('[data-card-id]')).toHaveLength(3);
  });

  it('drags only the touched card when it is not part of the selection', async () => {
    await setupOpenHand(mockPersonnelCards.slice(0, 3));

    await selectCard('personnel 1');
    await selectCard('personnel 2');

    // personnel 3 is not selected: dragging it moves only itself.
    const draggedId = cardIdFor('personnel 3');
    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggedId }, over: { id: 'core' } });
    });

    expect(screen.getByRole('button', { name: /^hand, 2 cards, tap to open$/i })).toBeInTheDocument();
    const coreZone = document.body.querySelector('[data-zone="core"]') as HTMLElement;
    expect(coreZone.querySelectorAll('[data-card-id]')).toHaveLength(1);
  });

  it('shows the number of cards carried in the drag overlay for a multi-card drag from the hand', async () => {
    await setupOpenHand(mockPersonnelCards.slice(0, 3));

    await selectCard('personnel 1');
    await selectCard('personnel 2');

    const draggedId = cardIdFor('personnel 1');
    await act(async () => {
      mockOnDragStart!({ active: { id: draggedId } });
    });

    expect(screen.getByTestId('drag-overlay')).toHaveTextContent('2');
  });

  it('clears the selection when the hand is closed', async () => {
    await setupOpenHand(mockPersonnelCards.slice(0, 2));
    await selectCard('personnel 1');
    expect(screen.getByRole('button', { name: 'Deselect personnel 1' })).toHaveAttribute('aria-pressed', 'true');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^hand, 2 cards, tap to open$/i }));
    });

    expect(screen.getByRole('button', { name: 'Select personnel 1' })).toHaveAttribute('aria-pressed', 'false');
  });
});

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

// Mock deckBuilderUtils so the test controls expandDeck and sees each shuffleArray call
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

// See coreBrigDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd`
// directly, since jsdom has no real pointer geometry for dnd-kit to detect drop targets with.
const mockDraggableIds: string[] = [];
let mockOnDragStart: ((event: { active: { id: string } }) => void) | null = null;
let mockOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | null = null;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd }: any) => {
      mockOnDragStart = onDragStart;
      mockOnDragEnd = onDragEnd;
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
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, expandDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const card = (collectorsinfo: string, name: string, type: string, pile: string) => ({
  collectorsinfo,
  originalName: name,
  type,
  name,
  imagefile: name,
  pile,
  count: 1,
});

const drawCards = [card('1U001', 'tricorder', 'equipment', 'draw'), card('1U002', 'data', 'personnel', 'draw')];
const dilemmaCards = [
  card('1U101', 'alpha dilemma', 'dilemma', 'dilemma'),
  card('1U102', 'beta dilemma', 'dilemma', 'dilemma'),
  card('1U103', 'gamma dilemma', 'dilemma', 'dilemma'),
];
const allCards = [...drawCards, ...dilemmaCards];
const mockDeck = Object.fromEntries(allCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

// #785: the dilemma pile has its own Shuffle button above it, beside its search button, the same
// as the draw pile. Each button shuffles its own pile only.
describe('Practice draw: the dilemma pile has a Shuffle button (#785)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    (deckFromTsv as jest.Mock).mockReturnValue({});
    (shuffleArray as jest.Mock).mockImplementation((arr) => arr);
    (useDataFetching as jest.Mock).mockReturnValue({ data: allCards, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(allCards);
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));

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

  const panelNames = () => {
    const panel = document.body.querySelector('[data-zone="pile-panel-dilemmaPile"]') as HTMLElement;
    expect(panel).not.toBeNull();
    return Array.from(panel.querySelectorAll('img')).map((img) => img.getAttribute('alt'));
  };

  it('shuffles the dilemma pile, keeps its count, and leaves the draw pile alone', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const dilemmaPile = screen.getByTestId('dilemma-pile');
    const countBefore = dilemmaPile.textContent;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download from the dilemma pile' }));
    });
    const before = panelNames();
    expect(before).toHaveLength(dilemmaCards.length);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download from the dilemma pile' }));
    });

    (shuffleArray as jest.Mock).mockClear();
    (shuffleArray as jest.Mock).mockImplementation((arr) => [...arr].reverse());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Shuffle dilemma pile' }));
    });

    // Only the dilemma pile was shuffled.
    expect(shuffleArray).toHaveBeenCalledTimes(1);
    const shuffled = (shuffleArray as jest.Mock).mock.calls[0][0] as { card: { type: string } }[];
    expect(shuffled).toHaveLength(dilemmaCards.length);
    expect(shuffled.every((c) => c.card.type === 'dilemma')).toBe(true);

    expect(screen.getByTestId('dilemma-pile').textContent).toBe(countBefore);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download from the dilemma pile' }));
    });
    expect(panelNames()).toEqual([...before].reverse());
    expect(within(dilemmaPile).queryByRole('button', { name: /shuffle/i })).toBeNull();
  });

  it('keeps the draw pile\'s own Shuffle button, which shuffles only the draw pile', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });

    (shuffleArray as jest.Mock).mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    });

    expect(shuffleArray).toHaveBeenCalledTimes(1);
    const shuffled = (shuffleArray as jest.Mock).mock.calls[0][0] as { card: { type: string } }[];
    expect(shuffled.every((c) => c.card.type !== 'dilemma')).toBe(true);
  });
});

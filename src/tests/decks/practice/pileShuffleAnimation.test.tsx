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

// More than an opening hand, so the draw pile still has cards after the deal.
const drawCards = Array.from({ length: 12 }, (_, i) =>
  card(`1U0${String(i + 10)}`, `draw card ${i}`, 'personnel', 'draw')
);
const dilemmaCards = [
  card('1U101', 'alpha dilemma', 'dilemma', 'dilemma'),
  card('1U102', 'beta dilemma', 'dilemma', 'dilemma'),
  card('1U103', 'gamma dilemma', 'dilemma', 'dilemma'),
];
const allCards = [...drawCards, ...dilemmaCards];
const mockDeck = Object.fromEntries(allCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

const pileArt = (alt: string) => screen.getByAltText(alt).closest('[data-testid="pile-art"]') as HTMLElement;
const drawArt = () => pileArt('Face-down draw pile');
const dilemmaArt = () => pileArt('Face-down dilemma pile');

// #786: a shuffle changes nothing visible, so the pile's own card art animates when its Shuffle
// button runs, and only that pile's art.
describe('Practice draw: a pile animates when its Shuffle button runs (#786)', () => {
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

  it('does not animate either pile before a shuffle', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(drawArt().className).not.toMatch(/animate-pile-shuffle/);
    expect(dilemmaArt().className).not.toMatch(/animate-pile-shuffle/);
  });

  it('animates only the draw pile when the draw pile Shuffle button runs', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    });

    expect(drawArt().className).toMatch(/motion-safe:animate-pile-shuffle\b/);
    expect(drawArt().className).toMatch(/motion-reduce:animate-pile-shuffle-ring/);
    expect(dilemmaArt().className).not.toMatch(/animate-pile-shuffle/);
  });

  it('animates only the dilemma pile when the dilemma pile Shuffle button runs', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Shuffle dilemma pile' }));
    });

    expect(dilemmaArt().className).toMatch(/motion-safe:animate-pile-shuffle\b/);
    expect(drawArt().className).not.toMatch(/animate-pile-shuffle/);
  });

  it('restarts the animation on each tap by remounting the pile art', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const seen = new Set<HTMLElement>();
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
      });
      seen.add(drawArt());
    }
    expect(seen.size).toBe(3);
  });

  it('leaves taps to the pile halves: the art takes no pointer events, and a tap still draws', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    });
    expect(drawArt().className).toMatch(/pointer-events-none/);

    const countBefore = drawArt().parentElement!.textContent;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Draw pile top, tap to draw' }));
    });
    expect(drawArt().parentElement!.textContent).not.toBe(countBefore);
  });
});

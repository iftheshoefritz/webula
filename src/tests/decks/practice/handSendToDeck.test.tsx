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

// Mock deckBuilderUtils to spy on deckFromTsv and extractDrawDeck
jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  extractDrawDeck: jest.fn(),
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
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'drawDeck', count: 1 },
];

const makePersonnel = (n: number) => ({
  collectorsinfo: `2C10${n}`,
  originalName: `Personnel ${n}`,
  type: 'personnel',
  name: `personnel ${n}`,
  imagefile: `personnel_${n}`,
  pile: 'drawDeck',
  count: 1,
});

const mockPersonnelCards = [1, 2, 3, 4].map(makePersonnel);

const mockManyDeck = Object.fromEntries(mockPersonnelCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

// #994: the "→ top" and "→ bottom" buttons of the open hand send its selected cards to the draw deck.
describe('Practice draw: sending the selected cards of the hand to the draw deck (#994)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnDragStart = null;
    mockOnDragEnd = null;
    void mockOnDragStart;
    void mockOnDragEnd;
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

  const setupOpenHand = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (extractDrawDeck as jest.Mock).mockReturnValue(mockPersonnelCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await click(/^hand, 4 cards, tap to open$/i);
  };

  const click = async (name: string | RegExp) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });
  };

  const handNames = () =>
    Array.from(document.body.querySelectorAll('[data-zone="hand"] [data-card-id]')).map((el) => el.getAttribute('aria-label'));

  it('shows the two buttons only while a card of the hand is selected', async () => {
    await setupOpenHand();
    expect(screen.queryByRole('button', { name: 'Selected cards to the top of the draw deck' })).toBeNull();

    await click('Select personnel 1');
    expect(screen.getByRole('button', { name: 'Selected cards to the top of the draw deck' })).toHaveTextContent('→ top');
    expect(screen.getByRole('button', { name: 'Selected cards to the bottom of the draw deck' })).toHaveTextContent('→ bottom');
  });

  it('puts the cards on the top or the bottom of the draw deck, in the order of the hand', async () => {
    await setupOpenHand();

    await click('Select personnel 3');
    await click('Select personnel 2');
    await click('Selected cards to the top of the draw deck');
    expect(screen.getByLabelText('hand, 2 cards, tap to open')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Selected cards to the top of the draw deck' })).toBeNull();

    await click('Select personnel 4');
    await click('Selected cards to the bottom of the draw deck');
    expect(screen.getByLabelText('hand, 1 card, tap to open')).toBeInTheDocument();

    // The draw deck now reads personnel 2, personnel 3, personnel 4 from the top.
    await click('Draw deck top, tap to draw');
    await click('Draw deck top, tap to draw');
    await click('Draw deck top, tap to draw');
    expect(handNames()).toEqual(['personnel 1', 'personnel 2', 'personnel 3', 'personnel 4']);
  });

  it('closes the hand when it sends every card', async () => {
    await setupOpenHand();

    for (const n of [1, 2, 3, 4]) await click(`Select personnel ${n}`);
    await click('Selected cards to the bottom of the draw deck');

    // The closed row shows again, so the hand is closed.
    expect(screen.getByLabelText('hand, 0 cards, tap to open')).toHaveStyle({ visibility: 'visible' });
    expect(screen.getByRole('button', { name: 'Draw deck top, tap to draw' })).not.toBeDisabled();
  });
});

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

// Issue #1070: the reveal panel of the draw deck's and the dilemma pile's top cards. See
// drawPileDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/`onDragEnd`
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
    useDraggable: ({ id, data }: { id: string; data?: { showBack?: boolean } }) => {
      // The top card of the draw deck and the dilemma pile (#814) is left out, so the ids here
      // stay the table cards' ids, in the order these tests expect.
      if (!data?.showBack) mockDraggableIds.push(id);
      return { attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, isDragging: false };
    },
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'drawDeck', count: 1 },
];

// 11 cards: a new game deals 7 into the hand, leaving "Card 8" to "Card 11" in the draw deck,
// in that order, with "Card 8" on top.
const makeManyCards = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    collectorsinfo: `1U${String(i + 1).padStart(3, '0')}`,
    originalName: `Card ${i + 1}`,
    type: 'equipment',
    name: `card ${i + 1}`,
    imagefile: `card_${i + 1}`,
    pile: 'drawDeck',
    count: 1,
  }));

const mockManyCards = makeManyCards(11);
const mockManyDeck = Object.fromEntries(mockManyCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

const PANEL = 'card-list-panel-drawDeckReveal';

const drawPileCount = () => document.querySelector('[data-testid="draw-pile"]')!.getAttribute('data-pile-count');
const handSize = () => {
  const label = document.querySelector('[aria-label^="hand, "]')!.getAttribute('aria-label')!;
  return Number(/hand, (\d+) cards?/.exec(label)![1]);
};
// The names of the cards in the reveal panel, left to right.
const panelNames = () =>
  Array.from(screen.getByTestId(PANEL).querySelectorAll('[data-card-id] img')).map((img) => img.getAttribute('alt'));
const panelId = (name: string) =>
  within(screen.getByTestId(PANEL)).getByRole('button', { name }).closest('[data-card-id]')!.getAttribute('data-card-id')!;

describe('Practice draw: the reveal panel of a pile (#1070)', () => {
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

  const setup = async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (extractDrawDeck as jest.Mock).mockReturnValue(mockManyCards);
    await act(async () => {
      render(<PracticeDrawPage />);
    });
  };

  const click = async (element: HTMLElement) => {
    await act(async () => {
      fireEvent.click(element);
    });
  };
  const openReveal = () => click(screen.getByRole('button', { name: 'Reveal the draw deck' }));
  const revealNext = () => click(screen.getByRole('button', { name: 'Reveal top' }));
  const revealBottom = () => click(screen.getByRole('button', { name: 'Reveal bottom' }));
  const drawOne = () => click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
  const drag = async (draggableId: string, overId: string | null) => {
    await act(async () => {
      mockOnDragStart!({ active: { id: draggableId } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id: draggableId }, over: overId ? { id: overId } : null });
    });
  };

  it('opens an empty panel from the eye, and draws nothing', async () => {
    await setup();
    expect(drawPileCount()).toBe('4');
    expect(handSize()).toBe(7);

    await openReveal();

    expect(screen.getByTestId(PANEL)).toBeInTheDocument();
    expect(panelNames()).toEqual([]);
    expect(drawPileCount()).toBe('4');
    expect(handSize()).toBe(7);
  });

  it('the dilemma pile has its own eye and its own panel', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'Reveal the dilemma pile' })).toBeInTheDocument();
  });

  // #1077: the pile buttons overlap the pile's edge, so they are opaque, at rest and on hover.
  // jsdom computes no Tailwind styles, so this checks the class names only.
  it('the six pile buttons are opaque, and the other icon buttons keep their tint', async () => {
    await setup();
    const columns = screen.getAllByTestId('pile-controls');
    expect(columns).toHaveLength(2);
    const buttons = columns.flatMap((column) => within(column).getAllByRole('button'));
    expect(buttons).toHaveLength(6);
    for (const button of buttons) {
      expect(button).toHaveClass('btn-icon', 'bg-bg-raised', 'hover:bg-[#323832]');
    }
    const nextTurn = screen.getByRole('button', { name: 'Next turn' });
    expect(nextTurn).toHaveClass('btn-icon');
    expect(nextTurn).not.toHaveClass('bg-bg-raised');
  });

  it('reveals one more card from the top with each tap, without moving it', async () => {
    await setup();
    await openReveal();

    await revealNext();
    expect(panelNames()).toEqual(['Card 8']);
    await revealNext();
    await revealNext();
    expect(panelNames()).toEqual(['Card 8', 'Card 9', 'Card 10']);
    expect(drawPileCount()).toBe('4');

    await revealNext();
    expect(panelNames()).toEqual(['Card 8', 'Card 9', 'Card 10', 'Card 11']);
    expect(screen.getByRole('button', { name: 'Reveal top' })).toBeDisabled();
  });

  it('shows "Reveal top" and "Reveal bottom", and no "Reveal next" (#1078)', async () => {
    await setup();
    await openReveal();
    expect(screen.getByRole('button', { name: 'Reveal top' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reveal bottom' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Reveal next' })).not.toBeInTheDocument();
  });

  it('shows one end of the pile at a time, in pile order (#1078)', async () => {
    await setup();
    await openReveal();

    await revealNext();
    await revealNext();
    expect(panelNames()).toEqual(['Card 8', 'Card 9']);

    await revealBottom();
    expect(panelNames()).toEqual(['Card 11']);
    expect(screen.getByRole('button', { name: 'Close bottom of the draw deck' })).toBeInTheDocument();
    await revealBottom();
    expect(panelNames()).toEqual(['Card 10', 'Card 11']);
    expect(drawPileCount()).toBe('4');

    await revealNext();
    expect(panelNames()).toEqual(['Card 8']);
    expect(drawPileCount()).toBe('4');
  });

  it('"Reveal bottom" is disabled once every card is revealed from the bottom, and "Reveal top" is not (#1078)', async () => {
    await setup();
    await openReveal();
    for (let i = 0; i < 4; i += 1) await revealBottom();
    expect(panelNames()).toEqual(['Card 8', 'Card 9', 'Card 10', 'Card 11']);
    expect(screen.getByRole('button', { name: 'Reveal bottom' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reveal top' })).toBeEnabled();
  });

  it('a reorder between two bottom cards changes the order at the bottom of the pile (#1078)', async () => {
    await setup();
    await openReveal();
    await revealBottom();
    await revealBottom();

    await drag(`panel:${panelId('Card 11')}`, panelId('Card 10'));
    expect(panelNames()).toEqual(['Card 11', 'Card 10']);

    await click(screen.getByRole('button', { name: 'Close bottom of the draw deck' }));
    await openReveal();
    await revealBottom();
    await revealBottom();
    expect(panelNames()).toEqual(['Card 11', 'Card 10']);
    expect(drawPileCount()).toBe('4');
  });

  it('with bottom cards shown, Bottom keeps a card listed and Top takes it out (#1078)', async () => {
    await setup();
    await openReveal();
    await revealBottom();
    await revealBottom();
    await revealBottom();
    expect(panelNames()).toEqual(['Card 9', 'Card 10', 'Card 11']);

    // Card 9 to the bottom: it stays revealed, now last.
    await click(within(screen.getByTestId(PANEL)).getByRole('button', { name: 'Card 9' }));
    await click(screen.getByRole('button', { name: 'Selected cards to the bottom of the draw deck' }));
    expect(panelNames()).toEqual(['Card 10', 'Card 11', 'Card 9']);

    // Card 10 to the top: it leaves the panel and is the pile's first card.
    await click(within(screen.getByTestId(PANEL)).getByRole('button', { name: 'Card 10' }));
    await click(screen.getByRole('button', { name: 'Selected cards to the top of the draw deck' }));
    expect(panelNames()).toEqual(['Card 11', 'Card 9']);
    expect(drawPileCount()).toBe('4');

    await revealNext();
    expect(panelNames()).toEqual(['Card 10']);
  });

  it('a reorder in the panel changes the order of the pile', async () => {
    await setup();
    await openReveal();
    await revealNext();
    await revealNext();
    await revealNext();

    // Card 10 onto Card 8: Card 10 becomes the top of the pile.
    await drag(`panel:${panelId('Card 10')}`, panelId('Card 8'));
    expect(panelNames()).toEqual(['Card 10', 'Card 8', 'Card 9']);
    expect(drawPileCount()).toBe('4');

    await click(screen.getByRole('button', { name: 'Close top of the draw deck' }));
    await drawOne();
    expect(screen.getByRole('button', { name: 'hand, 8 cards, tap to open' })).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'hand, 8 cards, tap to open' }));
    const handNames = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(handNames).toContain('Card 10');
    expect(handNames).not.toContain('Card 8');
  });

  it('Top and Bottom send the selected cards to either end of the pile', async () => {
    await setup();
    await openReveal();
    await revealNext();
    await revealNext();
    await revealNext();

    // Card 10 to the top: it stays revealed, now first.
    await click(within(screen.getByTestId(PANEL)).getByRole('button', { name: 'Card 10' }));
    await click(screen.getByRole('button', { name: 'Selected cards to the top of the draw deck' }));
    expect(panelNames()).toEqual(['Card 10', 'Card 8', 'Card 9']);

    // Card 8 to the bottom: it leaves the panel.
    await click(within(screen.getByTestId(PANEL)).getByRole('button', { name: 'Card 8' }));
    await click(screen.getByRole('button', { name: 'Selected cards to the bottom of the draw deck' }));
    expect(panelNames()).toEqual(['Card 10', 'Card 9']);
    expect(drawPileCount()).toBe('4');

    // The next card to reveal is Card 11, and Card 8 comes after it.
    await revealNext();
    await revealNext();
    expect(panelNames()).toEqual(['Card 10', 'Card 9', 'Card 11', 'Card 8']);
  });

  it('the Top and Bottom buttons are disabled with no selection', async () => {
    await setup();
    await openReveal();
    await revealNext();
    expect(screen.getByRole('button', { name: 'Selected cards to the top of the draw deck' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Selected cards to the bottom of the draw deck' })).toBeDisabled();
  });

  it.each(['hand', 'core'])('a drag of a revealed card to the %s takes it out of the pile and the panel', async (zone) => {
    await setup();
    await openReveal();
    await revealNext();
    await revealNext();

    await drag(`panel:${panelId('Card 8')}`, zone);

    expect(drawPileCount()).toBe('3');
    expect(panelNames()).toEqual(['Card 9']);
  });

  it('closing the panel forgets what was revealed', async () => {
    await setup();
    await openReveal();
    await revealNext();
    await revealNext();

    await click(screen.getByRole('button', { name: 'Close top of the draw deck' }));
    expect(screen.queryByTestId(PANEL)).not.toBeInTheDocument();
    await openReveal();
    expect(panelNames()).toEqual([]);

    // Opening another panel closes it too.
    await revealNext();
    await click(screen.getByRole('button', { name: 'Download from the draw deck' }));
    expect(screen.queryByTestId(PANEL)).not.toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Close draw deck' }));
    await openReveal();
    expect(panelNames()).toEqual([]);
  });
});

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

// See dilemmaStackDrop.test.tsx: mocks just enough of dnd-kit to drive `onDragStart`/
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
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { expandDeck } from '../../../app/decks/deckBuilderUtils';

const makePersonnel = (n: number) => ({
  collectorsinfo: `2C10${n}`,
  originalName: `Personnel ${n}`,
  type: 'personnel',
  name: `personnel ${n}`,
  imagefile: `personnel_${n}`,
  pile: 'draw',
  count: 1,
});

const mockPersonnelCards = [1, 2].map(makePersonnel);

// #787: a "Discard" button beside "Stop" and "Flip" moves every selected card of a pile panel to
// the discard pile, in the panel's order. The selection clears, and the panel stays open until its
// zone runs empty.
describe('Practice table: the pile panel Discard button (#787)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDraggableIds.length = 0;
    mockOnDragStart = null;
    mockOnDragEnd = null;
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

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

  const renderWithDeck = async (cards: any[], dilemmas: any[] = []) => {
    const deck = Object.fromEntries([...cards, ...dilemmas].map((c) => [c.collectorsinfo, { count: 1, row: c }]));
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    (expandDeck as jest.Mock).mockReturnValue(cards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });
  };

  const openClosedHand = async (pattern: RegExp) => {
    const closedHand = screen.queryByRole('button', { name: pattern });
    if (closedHand) {
      await act(async () => {
        fireEvent.click(closedHand);
      });
    }
  };

  const cardIdFor = (name: string): string => {
    const panel = document.body.querySelector('[data-zone^="pile-panel-"]');
    const scope = panel ? within(panel as HTMLElement) : screen;
    return scope.getByRole('button', { name }).getAttribute('data-card-id')!;
  };

  const drop = async (id: string, over: string) => {
    await act(async () => {
      mockOnDragStart!({ active: { id } });
    });
    await act(async () => {
      mockOnDragEnd!({ active: { id }, over: { id: over } });
    });
  };

  const click = async (name: string | RegExp) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });
  };

  // Drops both personnel cards from the hand onto the first mission, where they go face down into
  // its personnel pile, and opens that pile's panel.
  const openPersonnelPile = async () => {
    await renderWithDeck(mockPersonnelCards);
    for (const name of ['personnel 1', 'personnel 2']) {
      await openClosedHand(/^hand, \d+ cards?, tap to open$/i);
      await drop(cardIdFor(name), 'mission-0');
    }
    await click(/personnel pile, 2 cards, tap to open/i);
  };

  const discardCount = () => screen.getByAltText('Discard pile').parentElement!.textContent;

  it('shows no Discard button without a selection', async () => {
    await openPersonnelPile();
    expect(screen.queryByRole('button', { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it('discards one selected card, keeps the panel open, and clears the selection', async () => {
    await openPersonnelPile();

    await click('Select personnel 1');
    await click(/^discard$/i);

    expect(screen.getByRole('button', { name: /^close personnel pile$/i })).toBeInTheDocument();
    const panel = document.body.querySelector('[data-zone="pile-panel-personnel"]') as HTMLElement;
    expect(within(panel).queryByRole('button', { name: 'personnel 1' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Select personnel 2' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /^discard$/i })).not.toBeInTheDocument();
    expect(discardCount()).toContain('1');
    expect(screen.getByAltText('Discard pile')).toHaveAttribute('src', '/cardimages/personnel_1.jpg');
  });

  it('discards every selected card in the panel order, and closes the panel once it is empty', async () => {
    await openPersonnelPile();

    await click('Select personnel 2');
    await click('Select personnel 1');
    await click(/^discard$/i);

    expect(screen.queryByRole('button', { name: /^close personnel pile$/i })).not.toBeInTheDocument();
    expect(document.body.querySelector('[data-zone="pile-panel-personnel"]')).toBeNull();
    expect(discardCount()).toContain('2');
    expect(screen.getByAltText('Discard pile')).toHaveAttribute('src', '/cardimages/personnel_2.jpg');
  });

  it('shows no Discard button in the discard pile panel', async () => {
    await openPersonnelPile();
    await click('Select personnel 1');
    await click(/^discard$/i);

    await click('Close personnel pile');
    await act(async () => {
      fireEvent.click(screen.getByAltText('Discard pile').parentElement!);
    });
    await click('Select personnel 1');

    expect(document.body.querySelector('[data-zone="pile-panel-discard"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^discard$/i })).not.toBeInTheDocument();
  });
});

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

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemma',
  count: 1,
};

const CARD_BACK = '/cardimages/cardback.jpg';

// #762: a "Flip" button beside "Stop"/"Unstop" in the panels whose cards the preview can flip (a
// mission's personnel, event, and under-the-mission piles, and the dilemma stack). It turns each
// selected card over on its own. In those panels a face-down card shows the card back.
describe('Practice table: the pile panel Flip button (#762)', () => {
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

  const panelImage = (zone: string, name: string) => {
    const panel = document.body.querySelector(`[data-zone="pile-panel-${zone}"]`) as HTMLElement;
    return within(panel).getByRole('button', { name }).querySelector('img')!;
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

  it('draws face-down cards in a personnel pile panel as the card back, and shows no Flip without a selection', async () => {
    await openPersonnelPile();

    expect(panelImage('personnel', 'personnel 1')).toHaveAttribute('src', CARD_BACK);
    expect(panelImage('personnel', 'personnel 2')).toHaveAttribute('src', CARD_BACK);
    expect(screen.queryByRole('button', { name: /^flip$/i })).not.toBeInTheDocument();
  });

  it('flips a selected face-down card face up, beside the Stop button, and keeps the selection', async () => {
    await openPersonnelPile();

    await click('Select personnel 1');
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^flip$/i })).toBeInTheDocument();

    await click(/^flip$/i);

    expect(panelImage('personnel', 'personnel 1')).toHaveAttribute('src', '/cardimages/personnel_1.jpg');
    expect(panelImage('personnel', 'personnel 2')).toHaveAttribute('src', CARD_BACK);
    expect(screen.getByRole('button', { name: 'Deselect personnel 1' })).toHaveAttribute('aria-pressed', 'true');
    // Stop is unchanged by a flip.
    expect(panelImage('personnel', 'personnel 1')).not.toHaveClass('grayscale');
  });

  it('turns each card of a mixed selection over on its own', async () => {
    await openPersonnelPile();

    await click('Select personnel 1');
    await click(/^flip$/i);
    await click('Select personnel 2');
    await click(/^flip$/i);

    expect(panelImage('personnel', 'personnel 1')).toHaveAttribute('src', CARD_BACK);
    expect(panelImage('personnel', 'personnel 2')).toHaveAttribute('src', '/cardimages/personnel_2.jpg');
  });

  it('shows no Flip button in the core panel, even with a selection, and keeps its cards face up', async () => {
    await renderWithDeck(mockPersonnelCards);
    await openClosedHand(/^hand, \d+ cards?, tap to open$/i);
    await drop(cardIdFor('personnel 1'), 'core');
    await click('personnel 1');

    await click('Select personnel 1');

    expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^flip$/i })).not.toBeInTheDocument();
    expect(panelImage('core', 'personnel 1')).toHaveAttribute('src', '/cardimages/personnel_1.jpg');
  });

  it('flips the dilemma stack top card face up from its panel, and the table shows it face up', async () => {
    await renderWithDeck([], [mockDilemmaCard]);
    await click('Dilemma pile top, tap to draw');
    await openClosedHand(/^dilemma hand, 1 card, tap to open$/i);
    await drop(cardIdFor('cardassian trap'), 'dilemmaStack');

    await click('Dilemma stack, 1 card, tap to open');
    expect(panelImage('dilemmaStack', 'cardassian trap')).toHaveAttribute('src', CARD_BACK);

    await click('Select cardassian trap');
    await click(/^flip$/i);
    expect(panelImage('dilemmaStack', 'cardassian trap')).toHaveAttribute('src', '/cardimages/cardassian_trap.jpg');

    await click('Close dilemma stack');

    const stackZone = document.body.querySelector('[data-zone="dilemmaStack"]') as HTMLElement;
    expect(stackZone.querySelector('img')).toHaveAttribute('src', '/cardimages/cardassian_trap.jpg');
  });
});

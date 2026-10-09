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
import { extractDrawDeck } from '../../../app/decks/deckBuilderUtils';

// #1015: an unselected panel card shows no checkbox, so a test selects it with a tap on the card
// itself, the one inside the open card list panel rather than its copy on the table.
const panelCard = (name: string) => {
  const card = screen
    .getAllByRole('button', { name })
    .find((button) => button.closest('[data-testid^="card-list-panel-"]'));
  if (!card) throw new Error(`No card named ${name} in an open card list panel`);
  return card;
};

const makePersonnel = (n: number) => ({
  collectorsinfo: `2C10${n}`,
  originalName: `Personnel ${n}`,
  type: 'personnel',
  name: `personnel ${n}`,
  imagefile: `personnel_${n}`,
  pile: 'drawDeck',
  count: 1,
});

const mockPersonnelCards = [1, 2].map(makePersonnel);

const mockDilemmaCard = {
  collectorsinfo: '1R100',
  originalName: 'Cardassian Trap',
  type: 'dilemma',
  name: 'cardassian trap',
  imagefile: 'cardassian_trap',
  pile: 'dilemmaPile',
  count: 1,
};

const mockDilemmaCards = [
  mockDilemmaCard,
  { ...mockDilemmaCard, collectorsinfo: '1R101', originalName: 'Hard Time', name: 'hard time', imagefile: 'hard_time' },
];

const CARD_BACK = '/cardimages/cardback.jpg';

// #762: a "Flip" button beside "Stop"/"Unstop" in the panels whose cards the preview can flip (a
// mission's away team and under-the-mission piles). It turns each selected card over on its own.
// #826: in those panels every card draws its own image, and a face-down card carries a "Face down"
// mark, so the player can read the card and still see a Flip. #964: except in the away team panel.
describe('Practice table: the card list panel Flip button (#762)', () => {
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
    (extractDrawDeck as jest.Mock).mockReturnValue(cards);

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
    const panel = document.body.querySelector('[data-testid^="card-list-panel-"]');
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
    const panel = document.body.querySelector(`[data-testid="card-list-panel-${zone}"]`) as HTMLElement;
    return within(panel).getByRole('button', { name }).querySelector('img')!;
  };

  const hasMark = (zone: string, name: string) =>
    panelImage(zone, name).parentElement!.querySelector('[data-testid="face-down-mark"]') !== null;

  // Drops both personnel cards from the hand onto the first mission, where they go face down into
  // its Away team, and opens that pile's panel.
  const openAwayTeam = async () => {
    await renderWithDeck(mockPersonnelCards);
    for (const name of ['Personnel 1', 'Personnel 2']) {
      await openClosedHand(/^hand, \d+ cards?, tap to open$/i);
      await drop(cardIdFor(name), 'mission-under-0');
    }
    await click(/Away team, 2 cards, tap to open/i);
  };

  // Drops both dilemmas from the dilemma hand under the first mission, where they go face up, and
  // opens that pile's panel.
  const openUnderMission = async () => {
    await renderWithDeck([], mockDilemmaCards);
    for (const name of ['Cardassian Trap', 'Hard Time']) {
      await click('Dilemma pile top, tap to draw');
      await openClosedHand(/^dilemma hand, \d+ cards?, tap to open$/i);
      await drop(cardIdFor(name), 'mission-under-0');
    }
    await click(/Under the mission pile, 2 cards, tap to open/i);
  };

  // #964: an away team card is face down by default, so its panel shows no "Face down" mark.
  it('draws face-down cards in an away team panel as their own image with no mark, and shows no Flip without a selection', async () => {
    await openAwayTeam();

    expect(panelImage('awayTeam', 'Personnel 1')).toHaveAttribute('src', '/cardimages/personnel_1.jpg');
    expect(panelImage('awayTeam', 'Personnel 2')).toHaveAttribute('src', '/cardimages/personnel_2.jpg');
    expect(hasMark('awayTeam', 'Personnel 1')).toBe(false);
    expect(hasMark('awayTeam', 'Personnel 2')).toBe(false);
    expect(screen.queryByRole('button', { name: /^flip$/i })).not.toBeInTheDocument();
  });

  it('flips a selected away team card, beside the Stop button, keeps the selection, and shows no mark either way', async () => {
    await openAwayTeam();

    await act(async () => { fireEvent.click(panelCard('Personnel 1')); });
    expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^flip$/i })).toBeInTheDocument();

    await click(/^flip$/i);
    expect(hasMark('awayTeam', 'Personnel 1')).toBe(false);
    expect(screen.getByRole('button', { name: 'Deselect Personnel 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(panelImage('awayTeam', 'Personnel 1')).not.toHaveClass('grayscale');

    await click(/^flip$/i);
    expect(hasMark('awayTeam', 'Personnel 1')).toBe(false);
  });

  it('marks a face-down card in the under-the-mission panel, and a flip turns the mark on and off', async () => {
    await openUnderMission();

    expect(hasMark('underMission', 'Cardassian Trap')).toBe(false);

    await act(async () => { fireEvent.click(panelCard('Cardassian Trap')); });
    await click(/^flip$/i);

    expect(panelImage('underMission', 'Cardassian Trap')).toHaveAttribute('src', '/cardimages/cardassian_trap.jpg');
    expect(hasMark('underMission', 'Cardassian Trap')).toBe(true);
    expect(hasMark('underMission', 'Hard Time')).toBe(false);
    expect(screen.getByRole('button', { name: 'Deselect Cardassian Trap' })).toHaveAttribute('aria-pressed', 'true');

    await click(/^flip$/i);
    expect(hasMark('underMission', 'Cardassian Trap')).toBe(false);
  });

  it('turns each card of a mixed selection over on its own', async () => {
    await openUnderMission();

    await act(async () => { fireEvent.click(panelCard('Cardassian Trap')); });
    await click(/^flip$/i);
    await act(async () => { fireEvent.click(panelCard('Hard Time')); });
    await click(/^flip$/i);

    expect(hasMark('underMission', 'Cardassian Trap')).toBe(false);
    expect(hasMark('underMission', 'Hard Time')).toBe(true);
  });

  it('gives a stopped away team card the stopped look and no mark', async () => {
    await openAwayTeam();

    await act(async () => { fireEvent.click(panelCard('Personnel 1')); });
    await click(/^stop$/i);

    expect(panelImage('awayTeam', 'Personnel 1')).toHaveClass('grayscale');
    expect(hasMark('awayTeam', 'Personnel 1')).toBe(false);
  });

  it('shows no Flip button in the core panel, even with a selection, and keeps its cards face up', async () => {
    await renderWithDeck(mockPersonnelCards);
    await openClosedHand(/^hand, \d+ cards?, tap to open$/i);
    await drop(cardIdFor('Personnel 1'), 'core');
    await click('Personnel 1');

    await act(async () => { fireEvent.click(panelCard('Personnel 1')); });

    expect(screen.getByRole('button', { name: /^stop$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^flip$/i })).not.toBeInTheDocument();
    expect(panelImage('core', 'Personnel 1')).toHaveAttribute('src', '/cardimages/personnel_1.jpg');
    expect(document.body.querySelector('[data-testid="face-down-mark"]')).not.toBeInTheDocument();
  });

  // #819: the stack's panel lists its cards face up so the player can read them to order the
  // stack, while the stack stays face down on the table. The panel has no Flip button; the
  // table's Reveal control turns the top card over.
  it('draws a face-down dilemma stack card face up in its panel, shows no Flip, and keeps it face down on the table', async () => {
    await renderWithDeck([], [mockDilemmaCard]);
    await click('Dilemma pile top, tap to draw');
    await openClosedHand(/^dilemma hand, 1 card, tap to open$/i);
    await drop(cardIdFor('Cardassian Trap'), 'dilemmaStack');

    const stackZone = document.body.querySelector('[data-zone="dilemmaStack"]') as HTMLElement;
    expect(stackZone.querySelector('img')).toHaveAttribute('src', CARD_BACK);

    await click('Dilemma stack, 1 card, tap to open');
    expect(panelImage('dilemmaStack', 'Cardassian Trap')).toHaveAttribute('src', '/cardimages/cardassian_trap.jpg');
    expect(screen.queryByRole('button', { name: /^flip$/i })).not.toBeInTheDocument();

    expect(document.body.querySelector('[data-testid="face-down-mark"]')).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(panelCard('Cardassian Trap')); });
    expect(screen.queryByRole('button', { name: /^flip$/i })).not.toBeInTheDocument();
    expect(panelImage('dilemmaStack', 'Cardassian Trap')).toHaveAttribute('src', '/cardimages/cardassian_trap.jpg');

    await click('Close dilemma stack');

    const stackAfter = document.body.querySelector('[data-zone="dilemmaStack"]') as HTMLElement;
    expect(stackAfter.querySelector('img')).toHaveAttribute('src', CARD_BACK);
  });
});

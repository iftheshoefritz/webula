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

// Mock deckBuilderUtils so the test controls extractDrawDeck and sees each shuffleArray call
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
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import CardListPanel from '../../../app/decks/practice/CardListPanel';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

// #1015: an unselected panel card shows no checkbox, so a test selects it with a tap on the card
// itself, the one inside the open card list panel rather than its copy on the table.
const panelCard = (name: string) => {
  const card = screen
    .getAllByRole('button', { name })
    .find((button) => button.closest('[data-testid^="card-list-panel-"]'));
  if (!card) throw new Error(`No card named ${name} in an open card list panel`);
  return card;
};

const card = (collectorsinfo: string, name: string, type: string, pile: string) => ({
  collectorsinfo,
  originalName: name,
  type,
  name,
  imagefile: name,
  pile,
  count: 1,
});

// The opening hand takes seven draw cards, so ten leave three in the draw deck.
const drawCards = Array.from({ length: 10 }, (_, i) => card(`1U0${10 + i}`, `draw ${i + 1}`, 'equipment', 'draw'));
const dilemmaCards = [1, 2, 3].map((n) => card(`1U10${n}`, `dilemma ${n}`, 'dilemma', 'dilemma'));
const allCards = [...drawCards, ...dilemmaCards];
const mockDeck = Object.fromEntries(allCards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

const handCount = (label: string): number | null => {
  const badge = screen.queryByRole('button', { name: new RegExp(`^${label}, \\d+ cards?, tap to open$`, 'i') });
  if (!badge) return null;
  return Number(badge.getAttribute('aria-label')!.match(/, (\d+) card/)![1]);
};

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

const panelFor = (location: string) =>
  document.body.querySelector(`[data-testid="card-list-panel-${location}"]`) as HTMLElement | null;

const panelNames = (location: string) =>
  Array.from(panelFor(location)!.querySelectorAll('img')).map((img) => img.alt);

// #827: the draw deck's and the dilemma pile's panels have a Download button. It moves the
// selected cards into the matching hand, closes the panel, clears the selection, and then
// shuffles the rest of the pile. The hand stays closed.
describe.each([
  { pile: 'drawDeck', label: 'draw deck', hand: 'hand', otherHand: 'dilemma hand' },
  { pile: 'dilemmaPile', label: 'dilemma pile', hand: 'dilemma hand', otherHand: 'hand' },
])('Practice table: the $label panel Download button (#827)', ({ pile, label, hand, otherHand }) => {
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
    (extractDrawDeck as jest.Mock).mockReturnValue(drawCards);
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

  const openPanel = async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await click(`Download from the ${label}`);
  };

  it('shows a disabled Download button until a card is selected', async () => {
    await openPanel();
    const panel = panelFor(pile)!;
    const names = panelNames(pile);
    expect(names).toHaveLength(3);

    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
    await act(async () => { fireEvent.click(panelCard(names[0])); });
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
    await act(async () => { fireEvent.click(panelCard(names[1])); });
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
    expect(panel).toBeInTheDocument();
  });

  it('moves the selected cards into the hand, closes the panel, and shuffles the rest of the pile', async () => {
    await openPanel();
    const names = panelNames(pile);
    const handBefore = handCount(hand)!;
    const otherHandBefore = handCount(otherHand)!;

    await act(async () => { fireEvent.click(panelCard(names[0])); });
    await act(async () => { fireEvent.click(panelCard(names[2])); });
    (shuffleArray as jest.Mock).mockClear();
    await click('Download');

    // The panel closed, and the hand stayed closed with two more cards.
    expect(panelFor(pile)).toBeNull();
    expect(handCount(hand)).toBe(handBefore + 2);
    expect(handCount(otherHand)).toBe(otherHandBefore);

    // The shuffle ran once, over the one card left in the pile.
    expect(shuffleArray).toHaveBeenCalledTimes(1);
    const shuffled = (shuffleArray as jest.Mock).mock.calls[0][0] as { card: { name: string } }[];
    expect(shuffled.map((c) => c.card.name)).toEqual([names[1]]);
    const pileArt = pile === 'drawDeck'
      ? screen.getAllByTestId('pile-art')[0]
      : within(screen.getByTestId('dilemma-pile')).getByTestId('pile-art');
    expect(pileArt).toHaveAttribute('data-shuffled', 'true');

    // The cards are in the hand, face up.
    await click(new RegExp(`^${hand}, \\d+ cards?, tap to open$`, 'i'));
    expect(screen.getByRole('img', { name: names[0]! })).toHaveAttribute('src', `/cardimages/${names[0]}.jpg`);
    expect(screen.getByRole('img', { name: names[2]! })).toHaveAttribute('src', `/cardimages/${names[2]}.jpg`);

    // The selection cleared: the panel reopens with nothing selected.
    await click(`Close ${hand}`);
    await click(`Download from the ${label}`);
    expect(panelNames(pile)).toEqual([names[1]]);
    expect(screen.queryByRole('button', { name: `Deselect ${names[1]}` })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
  });
});

describe('CardListPanel: the Download button (#827)', () => {
  const instance = (id: string, name: string) =>
    ({ id, face: 'up', card: card(id, name, 'equipment', 'draw') }) as any;
  const cards = [instance('a', 'first'), instance('b', 'second'), instance('c', 'third')];

  it('shows no Download button without onDownload', () => {
    render(<CardListPanel location="core" cards={cards} onClose={() => {}} selectedIds={['a']} onToggleSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('passes the selected ids in the panel order', () => {
    const onDownload = jest.fn();
    const { rerender } = render(
      <CardListPanel location="drawDeck" cards={cards} onClose={() => {}} selectedIds={[]} onToggleSelect={() => {}} onDownload={onDownload} />
    );
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
    rerender(
      <CardListPanel location="drawDeck" cards={cards} onClose={() => {}} selectedIds={['c', 'a']} onToggleSelect={() => {}} onDownload={onDownload} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledWith(['a', 'c']);
  });
});

describe('Practice table: panels with no Download button (#827)', () => {
  beforeEach(() => {
    localStorage.clear();
    (deckFromTsv as jest.Mock).mockReturnValue({});
    (shuffleArray as jest.Mock).mockImplementation((arr) => arr);
    (useDataFetching as jest.Mock).mockReturnValue({ data: allCards, loading: false });
    (extractDrawDeck as jest.Mock).mockReturnValue(drawCards);
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
  });

  it('shows none in the discard pile panel', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await click('Download from the draw deck');
    const name = panelNames('drawDeck')[0]!;
    await act(async () => { fireEvent.click(panelCard(name)); });
    await click(/^discard$/i);
    await click('Close draw deck');
    await act(async () => {
      fireEvent.click(screen.getByAltText('Discard pile').parentElement!);
    });
    expect(panelFor('discard')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });
});

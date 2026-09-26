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

import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, expandDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';
import { HOLD_DELAY_MS } from '../../../app/decks/practice/useCardHold';

const mockCardData = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
  { collectorsinfo: '2C002', originalName: 'Test Personnel', type: 'personnel', name: 'test personnel', imagefile: 'test_personnel', pile: 'draw', count: 1 },
];

const mockDeck = {
  '1U001': { count: 1, row: { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 } },
};

const mockExpandedCards = [
  { collectorsinfo: '1U001', originalName: 'Tricorder', type: 'equipment', name: 'tricorder', imagefile: 'tricorder', pile: 'draw', count: 1 },
];

// A deck large enough to test draw mechanics (10 cards)
const makeManyCards = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    collectorsinfo: `1U${String(i + 1).padStart(3, '0')}`,
    originalName: `Card ${i + 1}`,
    type: 'equipment',
    name: `card ${i + 1}`,
    imagefile: `card_${i + 1}`,
    pile: 'draw',
    count: 1,
  }));

const mockManyCards = makeManyCards(10);

const mockManyDeck = Object.fromEntries(
  mockManyCards.map((c) => [
    c.collectorsinfo,
    { count: 1, row: c },
  ]),
);

describe('PracticeDrawPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();

    // Default mock implementations
    (deckFromTsv as jest.Mock).mockReturnValue(mockDeck);
    (expandDeck as jest.Mock).mockReturnValue(mockExpandedCards);
    (shuffleArray as jest.Mock).mockImplementation((arr) => arr);

    // Default: loaded, no data
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    // Mock screen.orientation
    Object.defineProperty(screen, 'orientation', {
      value: {
        lock: jest.fn().mockResolvedValue(undefined),
        unlock: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Mock window.matchMedia
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

  // Behaviour 3: Suspense boundary
  it('renders without throwing inside the Suspense wrapper', async () => {
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // The page container or some content should be rendered
    expect(document.body).toBeTruthy();
  });

  // Behaviour 2: Fixture path — deckFromTsv called with correct args
  it('loads fixture deck when ?fixture=1 is present and data has loaded', async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=1');
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(deckFromTsv).toHaveBeenCalledWith(PRACTICE_DECK_TSV, mockCardData);
    expect(expandDeck).toHaveBeenCalledWith(mockDeck);
  });

  // Behaviour 4: Correct arguments to deckFromTsv
  it('passes PRACTICE_DECK_TSV and loaded card data to deckFromTsv', async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=1');
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(deckFromTsv).toHaveBeenCalledWith(PRACTICE_DECK_TSV, mockCardData);
  });

  // Behaviour 2: Non-fixture path — uses localStorage
  it('loads deck from localStorage when ?fixture=1 is absent', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(deckFromTsv).not.toHaveBeenCalled();
    expect(expandDeck).toHaveBeenCalledWith(mockDeck);
  });

  // Behaviour 5: Data dependency — no premature fire while loading
  it('does not call deckFromTsv while loading is true', async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=1');
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: true });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(deckFromTsv).not.toHaveBeenCalled();
  });

  // Behaviour 5: Data dependency — fixture init is a no-op while data is empty
  it('does not call deckFromTsv when fixture=1 but data is empty (loading=false, data=[])', async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=1');
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(deckFromTsv).not.toHaveBeenCalled();
  });

  // Behaviour 5: Data dependency — calls deckFromTsv after data becomes available
  it('calls deckFromTsv after data becomes available', async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=1');

    const { rerender } = render(<PracticeDrawPage />);

    // Initially loading
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: true });
    await act(async () => {
      rerender(<PracticeDrawPage />);
    });
    expect(deckFromTsv).not.toHaveBeenCalled();

    // Now data is available
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    await act(async () => {
      rerender(<PracticeDrawPage />);
    });
    expect(deckFromTsv).toHaveBeenCalledWith(PRACTICE_DECK_TSV, mockCardData);
  });

  // Behaviour 4 (row #4 from table): Malformed localStorage silently ignored
  it('ignores malformed JSON in localStorage silently', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', 'not-valid-json');
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    let error: Error | null = null;
    try {
      await act(async () => {
        render(<PracticeDrawPage />);
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeNull();
    // Empty state message should be shown
    expect(screen.getByText('No draw cards in deck.')).toBeInTheDocument();
  });

  // Layout: no header chrome above the game table; the browser back button returns to the deck builder
  it('does not render the "Practice Draw" title or "Back to Deck Builder" link', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(screen.queryByText('Practice Draw')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /back to deck builder/i })).not.toBeInTheDocument();
  });

  // Behaviour: Empty state rendered when pile and hand are both empty
  it('renders empty state when no deck is loaded', async () => {
    mockSearchParamsValue = new URLSearchParams();
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(screen.getByText('No draw cards in deck.')).toBeInTheDocument();
  });

  // Behaviour: Empty state NOT shown when a valid deck is loaded from localStorage
  it('does not show empty state after a valid deck loads from localStorage', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(screen.queryByText('No draw cards in deck.')).not.toBeInTheDocument();
  });

  // Behaviour: "Go to Deck Builder" link inside empty state points to /decks
  it('renders "Go to Deck Builder" link inside empty state pointing to /decks', async () => {
    mockSearchParamsValue = new URLSearchParams();
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const link = screen.getByRole('link', { name: /go to deck builder/i });
    expect(link).toHaveAttribute('href', '/decks');
  });

  // Draw Mechanics: drawOne — clicking the pile reduces pile by 1 and adds to hand
  it('drawOne: clicking the draw pile button reduces pile by 1 and adds a card to hand', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // A new game deals 7 of the 10 cards into the (closed) hand; the rest stay in the pile.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i })).toBeInTheDocument();

    // Click the draw pile button (#743: the draw pile is now two drop-half buttons; either
    // one draws, same as the old single button).
    const drawPileButton = screen.getByRole('button', { name: 'Draw pile bottom, tap to draw' });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });

    // pile badge now shows 2, hand grows to 8
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^hand, 8 cards, tap to open$/i })).toBeInTheDocument();
  });

  // #638: a tap on the draw pile draws a card and leaves the hand open, rather than only
  // closing the hand's full-screen backdrop.
  it('drawOne: a tap on the draw pile through an open hand draws a card and keeps the hand open', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // #743: the draw pile is now two drop-half buttons; the passthrough only needs one of them
    // to cover the tap point below.
    const drawPileButton = screen.getByRole('button', { name: 'Draw pile top, tap to draw' });
    drawPileButton.getBoundingClientRect = () => ({
      left: 0,
      right: 60,
      top: 0,
      bottom: 80,
      width: 60,
      height: 80,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed.
    const closedHand = screen.queryByRole('button', { name: /^hand, 7 cards, tap to open$/i });
    if (closedHand) {
      await act(async () => {
        fireEvent.click(closedHand);
      });
    }
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^close hand$/i }), { clientX: 20, clientY: 20 });
    });

    // The hand stayed open, and it now shows the drawn card.
    expect(screen.getByRole('button', { name: /^close hand$/i })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // Draw Mechanics: pile count badge shows remaining count
  it('pile count badge shows correct count as cards are drawn', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // 10-card deck: 7 dealt into the hand, 3 left in the pile.
    expect(screen.getByText('3')).toBeInTheDocument();

    const drawPileButton = screen.getByRole('button', { name: 'Draw pile bottom, tap to draw' });

    for (let remaining = 2; remaining >= 1; remaining--) {
      await act(async () => {
        fireEvent.click(drawPileButton);
      });
      expect(screen.getByText(String(remaining))).toBeInTheDocument();
    }

    // The pile shows its "Empty" placeholder rather than a "0" badge once exhausted, and its
    // two drop-half buttons disable, same as the old single button (#743).
    await act(async () => {
      fireEvent.click(drawPileButton);
    });
    // The empty dilemma hand carries its own "Empty" placeholder (#631), so scope this check to
    // the draw pile's own box — the parent of its two drop halves (#743).
    const drawPileBox = document.body.querySelector('[data-zone="draw-pile-top"]')!.parentElement!;
    expect(within(drawPileBox).getByText('Empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draw pile top, tap to draw' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Draw pile bottom, tap to draw' })).toBeDisabled();
  });

  // Controls: the "Draw to 7" control is gone
  it('does not render a "Draw to 7" button', async () => {
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(screen.queryByRole('button', { name: /draw to 7/i })).not.toBeInTheDocument();
  });

  // Draw Mechanics: draw pile button is disabled when pile is exhausted
  it('draw pile button is disabled when pile is exhausted', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    // A single-card deck is dealt entirely into the hand, so the pile starts empty.
    (expandDeck as jest.Mock).mockReturnValue([mockManyCards[0]]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // #743: the draw pile's two drop halves are its tap controls now, in place of the single
    // button that used to carry the "Empty" placeholder's own accessible name.
    expect(screen.getByRole('button', { name: 'Draw pile top, tap to draw' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Draw pile bottom, tap to draw' })).toBeDisabled();
  });

  // Bottom row layout (issue #596): discard pile, draw pile, closed hand, core, brig, and the
  // dilemma pile at the right side.
  it('renders the bottom row zones in order: discard, pile, hand, core, brig, dilemma', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const zones = Array.from(document.body.querySelectorAll('[data-zone]')).map((el) =>
      el.getAttribute('data-zone')
    );
    expect(zones).toEqual([
      'mission-0',
      'ship-row-0',
      'mission-1',
      'ship-row-1',
      'mission-2',
      'ship-row-2',
      'mission-3',
      'ship-row-3',
      'mission-4',
      'ship-row-4',
      'dilemmaStack',
      'discard',
      'draw-pile-top',
      'draw-pile-bottom',
      'hand',
      'core',
      'brig',
      'dilemmaHand',
      'dilemma-pile-top',
      'dilemma-pile-bottom',
    ]);
  });

  // UI State: after drawing all cards, pile renders the "Empty" placeholder
  it('after drawing all cards, the pile shows the "Empty" placeholder', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    // A single-card deck is dealt entirely into the hand, so the pile starts empty.
    (expandDeck as jest.Mock).mockReturnValue([mockManyCards[0]]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // The empty draw pile and the empty dilemma hand (#631) both show "Empty"; the still-empty
    // discard pile shows its own "Discard" label.
    expect(screen.getAllByText('Empty').length).toBe(2);
    expect(screen.getByText('Discard')).toBeInTheDocument();
    expect(screen.queryByAltText('Face-down draw pile')).not.toBeInTheDocument();
  });

  // UI State: hand renders drawn cards with correct images and aria-labels
  it('hand renders drawn cards with correct aria-labels and images', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // A new game already dealt 7 cards, including "card 1", into the (closed) hand. Open it
    // to reach the individual card buttons.
    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: /^hand, 7 cards, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }

    const cardButton = screen.getByRole('button', { name: 'card 1' });
    expect(cardButton).toBeInTheDocument();
    const cardImg = cardButton.querySelector('img');
    expect(cardImg).toHaveAttribute('src', '/cardimages/card_1.jpg');
  });

  // Open/closed hand (issue #596): a tap on the closed hand opens it, a tap outside closes it
  it('tapping the closed hand opens it, and tapping outside the fan closes it', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(screen.queryByRole('button', { name: 'card 1' })).not.toBeInTheDocument();

    // #740 keeps a hand open after a drag out of it, so this tap only runs when the
    // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
    const closedHandButton = screen.queryByRole('button', { name: /^hand, 7 cards, tap to open$/i });
    if (closedHandButton) {
      await act(async () => {
        fireEvent.click(closedHandButton);
      });
    }
    expect(screen.getByRole('button', { name: 'card 1' })).toBeInTheDocument();

    const backdrop = screen.getByRole('button', { name: /^close hand$/i });
    await act(async () => {
      fireEvent.click(backdrop);
    });
    expect(screen.queryByRole('button', { name: 'card 1' })).not.toBeInTheDocument();
  });

  // The tap acts, the hold looks (#764): a tap never opens the preview, a press and hold does,
  // and the preview is read-only.
  describe('hold-only, read-only preview', () => {
    const missionCard = {
      collectorsinfo: '1R100',
      originalName: 'First Contact',
      type: 'mission',
      name: 'first contact',
      imagefile: 'first_contact',
      pile: 'mission',
      count: 1,
    };
    const mockDeckWithMission = {
      ...mockManyDeck,
      '1R100': { count: 1, row: missionCard },
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    // Renders the page with a mission and seven hand cards, and opens the hand.
    const renderWithOpenHand = async () => {
      mockSearchParamsValue = new URLSearchParams();
      localStorage.setItem('currentDeck', JSON.stringify(mockDeckWithMission));
      (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
      (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

      await act(async () => {
        render(<PracticeDrawPage />);
      });

      // #740 keeps a hand open after a drag out of it, so this tap only runs when the
      // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
      const closedHandButton = screen.queryByRole('button', { name: /^hand, 7 cards, tap to open$/i });
      if (closedHandButton) {
        await act(async () => {
          fireEvent.click(closedHandButton);
        });
      }
      jest.useFakeTimers();
    };

    const hold = (element: Element) => {
      fireEvent.pointerDown(element, { button: 0 });
      act(() => {
        jest.advanceTimersByTime(HOLD_DELAY_MS);
      });
    };

    const release = () => {
      act(() => {
        fireEvent.pointerUp(window);
      });
    };

    it('a tap on a mission card opens no preview', async () => {
      await renderWithOpenHand();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'first contact' }));
      });
      expect(screen.queryByTestId('card-preview-enlarged')).toBeNull();
    });

    it('a tap on a hand card opens no preview, and selects the card', async () => {
      await renderWithOpenHand();
      const card = screen.getByRole('button', { name: 'card 1' });
      act(() => {
        fireEvent.click(card);
      });
      expect(screen.queryByTestId('card-preview-enlarged')).toBeNull();
      expect(screen.getByRole('button', { name: 'Deselect card 1' })).toHaveAttribute('aria-pressed', 'true');
      expect(card).toHaveClass('ring-2');

      act(() => {
        fireEvent.click(card);
      });
      expect(screen.getByRole('button', { name: 'Select card 1' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('a hold on a mission shows its image in a read-only preview, with no Flip button', async () => {
      await renderWithOpenHand();
      hold(screen.getByRole('button', { name: 'first contact' }));

      const layer = screen.getByTestId('card-preview');
      expect(screen.getByTestId('card-preview-enlarged')).toHaveAttribute('src', '/cardimages/first_contact.jpg');
      expect(layer).toHaveClass('pointer-events-none');
      expect(layer.querySelector('button')).toBeNull();
      expect(screen.queryByRole('button', { name: /^flip$/i })).not.toBeInTheDocument();

      release();
      expect(screen.queryByTestId('card-preview')).toBeNull();
    });

    it('the preview appears in the same right-anchored, full-height position for any card', async () => {
      await renderWithOpenHand();
      const expectedClasses = ['absolute', 'right-4', 'top-1/2', '-translate-y-1/2', 'h-[90%]', 'w-auto'];

      hold(screen.getByRole('button', { name: 'card 1' }));
      expect(screen.getByTestId('card-preview-enlarged')).toHaveAttribute('alt', 'card 1');
      expect(screen.getByTestId('card-preview-enlarged')).toHaveClass(...expectedClasses);
      // The hand card stays visible in the open fan while its preview shows.
      expect(screen.getByRole('button', { name: 'card 1' })).toBeVisible();
      release();

      hold(screen.getByRole('button', { name: 'card 2' }));
      expect(screen.getByTestId('card-preview-enlarged')).toHaveAttribute('alt', 'card 2');
      expect(screen.getByTestId('card-preview-enlarged')).toHaveClass(...expectedClasses);
      release();
    });
  });

  // The dilemma pile and the dilemma hand (#604)
  describe('dilemma pile and dilemma hand', () => {
    const dilemmaCards = [1, 2, 3].map((n) => ({
      collectorsinfo: `9D00${n}`,
      originalName: `Dilemma ${n}`,
      type: 'dilemma',
      name: `dilemma ${n}`,
      imagefile: `dilemma_${n}`,
      pile: 'dilemma',
      count: 1,
    }));

    const renderWithDilemmas = async () => {
      mockSearchParamsValue = new URLSearchParams();
      localStorage.setItem(
        'currentDeck',
        JSON.stringify({
          ...mockManyDeck,
          ...Object.fromEntries(dilemmaCards.map((c) => [c.collectorsinfo, { count: 1, row: c }])),
        }),
      );
      (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
      (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

      await act(async () => {
        render(<PracticeDrawPage />);
      });
    };

    it('starts with every dilemma in the dilemma pile and an empty dilemma hand', async () => {
      await renderWithDilemmas();

      // The two drop halves (#607) split the old single button; the count now sits in their
      // shared, non-interactive wrapper instead of either button's own text.
      const dilemmaPile = document.body.querySelector('[data-testid="dilemma-pile"]');
      expect(dilemmaPile!.textContent).toContain('3');
      // The dilemma hand renders even at zero cards (#631), as a drop target for a dilemma
      // dragged back from the stack popup, so it shows disabled with a "0 cards" label instead
      // of not rendering at all.
      expect(screen.getByRole('button', { name: /^dilemma hand, 0 cards, tap to open$/i })).toBeDisabled();
    });

    it('draws one dilemma into the dilemma hand on a tap', async () => {
      await renderWithDilemmas();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /dilemma pile top, tap to draw/i }));
      });

      expect(document.body.querySelector('[data-testid="dilemma-pile"]')!.textContent).toContain('2');
      expect(screen.getByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i })).toBeInTheDocument();
    });

    it('closes the open hand when the dilemma hand opens', async () => {
      await renderWithDilemmas();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /dilemma pile top, tap to draw/i }));
      });
      // #740 keeps a hand open after a drag out of it, so this tap only runs when the
      // hand is closed.
      const closedHand2 = screen.queryByRole('button', { name: /^hand, 7 cards, tap to open$/i });
      if (closedHand2) {
        await act(async () => {
          fireEvent.click(closedHand2);
        });
      }
      expect(screen.queryByRole('button', { name: /^hand, 7 cards, tap to open$/i })).not.toBeInTheDocument();

      // #740 keeps a hand open after a drag out of it, so this tap only runs when the
      // hand is closed.
      const closedHand3 = screen.queryByRole('button', { name: /^dilemma hand, 1 card, tap to open$/i });
      if (closedHand3) {
        await act(async () => {
          fireEvent.click(closedHand3);
        });
      }

      // The ordinary hand is closed again, so its closed button is back.
      expect(screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i })).toBeInTheDocument();
    });
  });

  // Shuffle (#721): the button above the draw pile shuffles it in place instead of resetting
  // the game — the cards already on the table (here, the drawn card sitting in the hand) stay
  // exactly where they are, and only the order of the remaining draw pile changes.
  describe('game menu on load (#781)', () => {
    const renderManyCards = async () => {
      localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
      (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
      (expandDeck as jest.Mock).mockReturnValue(mockManyCards);
      await act(async () => {
        render(<PracticeDrawPage />);
      });
    };

    const tap = async (element: Element) => {
      await act(async () => {
        fireEvent.pointerDown(element, { button: 0 });
        fireEvent.pointerUp(element);
        fireEvent.click(element);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };

    it('opens the game menu as soon as the table shows', async () => {
      await renderManyCards();

      expect(screen.getByRole('button', { name: 'Game menu' })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    });

    it('closes the menu on the first tap outside it, without acting on the table', async () => {
      await renderManyCards();
      const drawPileButton = screen.getByRole('button', { name: 'Draw pile bottom, tap to draw' });

      await tap(drawPileButton);

      expect(screen.getByRole('button', { name: 'Game menu' })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i })).toBeInTheDocument();

      // The next tap acts as usual.
      await tap(drawPileButton);
      expect(screen.getByRole('button', { name: /^hand, 8 cards, tap to open$/i })).toBeInTheDocument();
    });

    it('lets the press that closes the menu reach the table, so a drag can start', async () => {
      await renderManyCards();
      const drawPileButton = screen.getByRole('button', { name: 'Draw pile bottom, tap to draw' });
      const onPointerDown = jest.fn();
      drawPileButton.addEventListener('pointerdown', onPointerDown);

      await act(async () => {
        fireEvent.pointerDown(drawPileButton, { button: 0 });
      });

      expect(onPointerDown).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Game menu' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('keeps the menu open for a tap inside it, and the menu button still closes it', async () => {
      await renderManyCards();
      const menuButton = screen.getByRole('button', { name: 'Game menu' });

      await tap(menuButton);

      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      await tap(menuButton);
      expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes the menu on Escape', async () => {
      await renderManyCards();

      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      expect(screen.getByRole('button', { name: 'Game menu' })).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('clicking the button above the draw pile shuffles it without resetting the game', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // Draw one card, leaving cards on the table beyond the initial opening hand.
    const drawPileButton = screen.getByRole('button', { name: 'Draw pile bottom, tap to draw' });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });
    expect(screen.getByRole('button', { name: /^hand, 8 cards, tap to open$/i })).toBeInTheDocument();

    // Record the draw pile's card order before shuffling.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^download from the draw pile$/i }));
    });
    const idsBefore = Array.from(
      document.querySelectorAll('[data-zone="pile-panel-pile"] [data-card-id]')
    ).map((el) => el.getAttribute('data-card-id'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^close draw pile$/i }));
    });

    // The initial deal uses the same shuffleArray mocked as identity in beforeEach; make the
    // shuffle button's own call actually reorder, so the test can tell the two apart.
    (shuffleArray as jest.Mock).mockImplementation((arr) => [...arr].reverse());

    const shuffleButton = screen.getByRole('button', { name: /^shuffle$/i });
    await act(async () => {
      fireEvent.click(shuffleButton);
    });

    // The hand still holds the drawn card: the button did not reset the game.
    expect(screen.getByRole('button', { name: /^hand, 8 cards, tap to open$/i })).toBeInTheDocument();

    // The draw pile holds the same cards, in a different order.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^download from the draw pile$/i }));
    });
    const idsAfter = Array.from(
      document.querySelectorAll('[data-zone="pile-panel-pile"] [data-card-id]')
    ).map((el) => el.getAttribute('data-card-id'));

    expect(new Set(idsAfter)).toEqual(new Set(idsBefore));
    expect(idsAfter).not.toEqual(idsBefore);
  });

  // Viewport sizing (issue #592): the game UI is a fixed layer that fills the visible area,
  // and a separate in-flow spacer taller than 100lvh lets mobile Safari hide its toolbar
  // on scroll and keep it hidden.
  it('renders a fixed game layer and a scroll spacer taller than the large viewport', async () => {
    mockSearchParamsValue = new URLSearchParams();
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    render(<PracticeDrawPage />);
    await act(async () => {});

    expect(screen.getByTestId('practice-scroll-spacer')).toHaveClass('h-[calc(100lvh+120px)]');
    const gameLayer = screen.getByTestId('practice-game-layer');
    expect(gameLayer).toHaveClass('fixed', 'inset-0');
    expect(gameLayer).not.toHaveClass('overflow-hidden');
  });

  // Orientation: RotateDeviceOverlay is rendered when matchMedia reports portrait
  it('renders RotateDeviceOverlay when orientation is portrait', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === '(orientation: portrait)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(screen.getByText('Rotate your device')).toBeInTheDocument();
  });

  // Orientation: simulating a MediaQueryListEvent with matches: true causes the overlay to appear
  it('overlay appears when a portrait MediaQueryListEvent fires', async () => {
    let capturedHandler: ((e: MediaQueryListEvent) => void) | null = null;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn().mockImplementation((_event: string, handler: (e: MediaQueryListEvent) => void) => {
          capturedHandler = handler;
        }),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // Initially landscape — overlay not shown
    expect(screen.queryByText('Rotate your device')).not.toBeInTheDocument();

    // Fire portrait event
    await act(async () => {
      capturedHandler!({ matches: true } as MediaQueryListEvent);
    });

    expect(screen.getByText('Rotate your device')).toBeInTheDocument();
  });

  // Orientation: screen.orientation.lock is called on mount
  it('calls screen.orientation.lock("landscape") on mount', async () => {
    const lockMock = jest.fn().mockResolvedValue(undefined);
    const unlockMock = jest.fn();
    Object.defineProperty(window.screen, 'orientation', {
      value: { lock: lockMock, unlock: unlockMock },
      writable: true,
      configurable: true,
    });

    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    expect(lockMock).toHaveBeenCalledWith('landscape');
  });

  // Orientation: unlock and removeEventListener are called on unmount
  it('calls screen.orientation.unlock and removeEventListener on unmount', async () => {
    const lockMock = jest.fn().mockResolvedValue(undefined);
    const unlockMock = jest.fn();
    Object.defineProperty(window.screen, 'orientation', {
      value: { lock: lockMock, unlock: unlockMock },
      writable: true,
      configurable: true,
    });

    const removeEventListener = jest.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener,
        dispatchEvent: jest.fn(),
      })),
    });

    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    let unmount: () => void;
    await act(async () => {
      ({ unmount } = render(<PracticeDrawPage />));
    });

    await act(async () => {
      unmount!();
    });

    expect(unlockMock).toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalled();
  });
});

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
import { render, screen, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, expandDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';

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

    // Click the draw pile button
    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
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

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
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

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });

    for (let remaining = 2; remaining >= 1; remaining--) {
      await act(async () => {
        fireEvent.click(drawPileButton);
      });
      expect(screen.getByText(String(remaining))).toBeInTheDocument();
    }

    // The pile shows its "Empty" placeholder rather than a "0" badge once exhausted.
    await act(async () => {
      fireEvent.click(drawPileButton);
    });
    expect(screen.getByRole('button', { name: /^empty$/i })).toBeInTheDocument();
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

    const emptyButton = screen.getByRole('button', { name: /^empty$/i });
    expect(emptyButton).toBeDisabled();
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
      'pile',
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

  // Tap-to-enlarge: tapping a hand card shows an enlarged preview, tapping it again shrinks it back
  it('tapping a hand card shows an enlarged preview and tapping again shrinks it back', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
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

    // No enlarged preview shown yet
    expect(screen.queryByRole('button', { name: /tap to shrink/i })).not.toBeInTheDocument();

    const cardButton = screen.getByRole('button', { name: 'card 1' });
    await act(async () => {
      fireEvent.click(cardButton);
    });

    // The hand card stays visible in the open fan while its preview shows
    expect(screen.getByRole('button', { name: 'card 1' })).toBeVisible();

    // Enlarged preview now shown, anchored to the right edge at full screen height
    const enlargedPreview = screen.getByRole('button', { name: /card 1, tap to shrink/i });
    expect(enlargedPreview).toBeInTheDocument();
    const enlargedImg = enlargedPreview.querySelector('img');
    expect(enlargedImg).toHaveClass('absolute', 'right-4', 'top-1/2', '-translate-y-1/2', 'h-[90%]');

    // Tapping the enlarged preview shrinks it back
    await act(async () => {
      fireEvent.click(enlargedPreview);
    });
    expect(screen.queryByRole('button', { name: /tap to shrink/i })).not.toBeInTheDocument();
  });

  // Enlarged preview: position and size are identical regardless of which card is previewed
  it('enlarged preview appears in the same right-anchored, full-height position for any card', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
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

    const expectedClasses = ['absolute', 'right-4', 'top-1/2', '-translate-y-1/2', 'h-[90%]', 'w-auto'];

    // Preview card 1
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'card 1' }));
    });
    const firstPreview = screen.getByRole('button', { name: /card 1, tap to shrink/i });
    expect(firstPreview.querySelector('img')).toHaveClass(...expectedClasses);
    await act(async () => {
      fireEvent.click(firstPreview);
    });

    // Preview card 2 — same position/size classes
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'card 2' }));
    });
    const secondPreview = screen.getByRole('button', { name: /card 2, tap to shrink/i });
    expect(secondPreview.querySelector('img')).toHaveClass(...expectedClasses);
  });

  // Tap preview and Flip for table cards (issue #598)
  describe('table card preview and flip', () => {
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

    const renderWithMission = async () => {
      mockSearchParamsValue = new URLSearchParams();
      localStorage.setItem('currentDeck', JSON.stringify(mockDeckWithMission));
      (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
      (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

      await act(async () => {
        render(<PracticeDrawPage />);
      });
    };

    it('tapping a filled mission slot opens the preview with the mission\'s image', async () => {
      await renderWithMission();

      const missionButton = screen.getByRole('button', { name: 'first contact' });
      await act(async () => {
        fireEvent.click(missionButton);
      });

      const preview = screen.getByRole('button', { name: /first contact, tap to shrink/i });
      expect(preview.querySelector('img')).toHaveAttribute('src', '/cardimages/first_contact.jpg');
    });

    it('the preview for a mission shows a "Flip" button; tapping it toggles the face and the preview stays open', async () => {
      await renderWithMission();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'first contact' }));
      });

      expect(screen.queryByText('Face down')).not.toBeInTheDocument();
      const flipButton = screen.getByRole('button', { name: /^flip$/i });

      await act(async () => {
        fireEvent.click(flipButton);
      });

      // The preview stays open and now shows the "Face down" label
      expect(screen.getByRole('button', { name: /first contact, tap to shrink/i })).toBeInTheDocument();
      expect(screen.getByText('Face down')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^flip$/i }));
      });

      expect(screen.queryByText('Face down')).not.toBeInTheDocument();
    });

    it('tapping outside the preview (the backdrop) closes it', async () => {
      await renderWithMission();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'first contact' }));
      });
      expect(screen.getByRole('button', { name: /first contact, tap to shrink/i })).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /first contact, tap to shrink/i }));
      });
      expect(screen.queryByRole('button', { name: /tap to shrink/i })).not.toBeInTheDocument();
    });

    it('the hand-card preview has no "Flip" button', async () => {
      await renderWithMission();

      // #740 keeps a hand open after a drag out of it, so this tap only runs when the
      // hand is closed — after a drag that emptied it, or a drag that started elsewhere.
      const closedHandButton = screen.queryByRole('button', { name: /^hand, 7 cards, tap to open$/i });
      if (closedHandButton) {
        await act(async () => {
          fireEvent.click(closedHandButton);
        });
      }
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'card 1' }));
      });

      expect(screen.getByRole('button', { name: /card 1, tap to shrink/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^flip$/i })).not.toBeInTheDocument();
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
  it('clicking the button above the draw pile shuffles it without resetting the game', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // Draw one card, leaving cards on the table beyond the initial opening hand.
    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
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

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

  // Bottom row layout (issue #596): draw pile, core, brig, discard, dilemma pile, then the hand.
  it('renders the bottom row zones in order: pile, core, brig, discard, dilemma, hand', async () => {
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
    expect(zones).toEqual(['pile', 'core', 'brig', 'discard', 'dilemma', 'hand']);
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

    // The empty draw pile shows "Empty"; the still-empty discard pile shows its "Discard" label.
    expect(screen.getAllByText('Empty').length).toBe(1);
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
    const closedHandButton = screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });

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

    const closedHandButton = screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
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

    const closedHandButton = screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });

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

    const closedHandButton = screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });

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

  // Reset: redeals an opening hand of 7 and closes the hand
  it('clicking reset after drawing cards redeals an opening hand of 7 and closes the hand', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // Draw the remaining 3 cards and open the hand
    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(drawPileButton);
      });
    }
    const closedHandButton = screen.getByRole('button', { name: /^hand, 10 cards, tap to open$/i });
    await act(async () => {
      fireEvent.click(closedHandButton);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'card 1' }));
    });
    expect(screen.getByRole('button', { name: /tap to shrink/i })).toBeInTheDocument();

    // Click reset (the small button directly above the draw pile)
    const resetButton = screen.getByRole('button', { name: /^reset$/i });

    await act(async () => {
      fireEvent.click(resetButton!);
    });

    // Pile is back to 3, hand is a fresh opening hand of 7 and is closed, and the preview clears
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'card 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tap to shrink/i })).not.toBeInTheDocument();
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

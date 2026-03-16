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

// Mock react-tooltip to avoid jsdom noise
jest.mock('react-tooltip', () => ({
  Tooltip: () => null,
}));

// Mock react-icons to avoid jsdom noise
jest.mock('react-icons/fa', () => ({
  FaArrowLeft: () => null,
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

  // Behaviour: "Back to Deck Builder" link points to /decks
  it('renders "Back to Deck Builder" link pointing to /decks', async () => {
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const link = screen.getByRole('link', { name: /back to deck builder/i });
    expect(link).toHaveAttribute('href', '/decks');
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

    // pile badge shows 10
    expect(screen.getByText('10')).toBeInTheDocument();
    // Hand label not shown yet
    expect(screen.queryByText(/Hand \(/)).not.toBeInTheDocument();

    // Click the draw pile button
    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });

    // pile badge now shows 9
    expect(screen.getByText('9')).toBeInTheDocument();
    // One card now in hand
    expect(screen.getAllByRole('button', { name: /^card \d+$/i }).length).toBe(1);
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

    expect(screen.getByText('10')).toBeInTheDocument();

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });

    for (let remaining = 9; remaining >= 7; remaining--) {
      await act(async () => {
        fireEvent.click(drawPileButton);
      });
      expect(screen.getByText(String(remaining))).toBeInTheDocument();
    }
  });

  // Draw Mechanics: drawToSeven draws the correct number of cards
  it('drawToSeven draws exactly enough cards to reach 7', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // Draw 3 cards manually first
    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(drawPileButton);
      });
    }
    expect(screen.getAllByRole('button', { name: /^card \d+$/i }).length).toBe(3);

    // Click "Draw to 7"
    const drawToSevenButton = screen.getByRole('button', { name: /draw to 7/i });
    await act(async () => {
      fireEvent.click(drawToSevenButton);
    });

    // Should have 7 in hand and 3 remaining in pile
    expect(screen.getAllByRole('button', { name: /^card \d+$/i }).length).toBe(7);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  // Draw Mechanics: drawToSeven draws 0 cards when hand already has 7
  it('drawToSeven draws 0 cards when hand already has 7', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // Draw 7 manually
    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    for (let i = 0; i < 7; i++) {
      await act(async () => {
        fireEvent.click(drawPileButton);
      });
    }
    expect(screen.getAllByRole('button', { name: /^card \d+$/i }).length).toBe(7);

    // "Draw to 7" button should now be disabled
    const drawToSevenButton = screen.getByRole('button', { name: /draw to 7/i });
    expect(drawToSevenButton).toBeDisabled();
  });

  // Draw Mechanics: "Draw to 7" button disabled when pile is empty
  it('"Draw to 7" button is disabled when pile is exhausted', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    // Only 1 card so pile empties after one draw
    (expandDeck as jest.Mock).mockReturnValue([mockManyCards[0]]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });

    // pile is now empty, "Draw to 7" should be disabled
    const drawToSevenButton = screen.getByRole('button', { name: /draw to 7/i });
    expect(drawToSevenButton).toBeDisabled();
  });

  // Draw Mechanics: draw pile button is disabled when pile is exhausted
  it('draw pile button is disabled when pile is exhausted', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockManyCards[0]]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });

    // After drawing, pile is empty; the pile button (now the "Empty" placeholder button) should be disabled
    const emptyButton = screen.getByRole('button', { name: /^empty$/i });
    expect(emptyButton).toBeDisabled();
  });

  // UI State: after drawing all cards, pile renders the "Empty" placeholder
  it('after drawing all cards, the pile shows the "Empty" placeholder', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue([mockManyCards[0]]);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });

    expect(screen.getByText('Empty')).toBeInTheDocument();
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

    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    await act(async () => {
      fireEvent.click(drawPileButton);
    });

    // The first card from mockManyCards should be in hand
    const cardButton = screen.getByRole('button', { name: 'card 1' });
    expect(cardButton).toBeInTheDocument();
    const cardImg = cardButton.querySelector('img');
    expect(cardImg).toHaveAttribute('src', '/cardimages/card_1.jpg');
  });

  // Reset: restores pile and clears hand
  it('clicking reset after drawing cards restores pile and clears hand', async () => {
    mockSearchParamsValue = new URLSearchParams();
    localStorage.setItem('currentDeck', JSON.stringify(mockManyDeck));
    (useDataFetching as jest.Mock).mockReturnValue({ data: mockCardData, loading: false });
    (expandDeck as jest.Mock).mockReturnValue(mockManyCards);

    await act(async () => {
      render(<PracticeDrawPage />);
    });

    // Draw 3 cards
    const drawPileButton = screen.getByRole('button', { name: /face-down draw pile/i });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(drawPileButton);
      });
    }
    expect(screen.getAllByRole('button', { name: /^card \d+$/i }).length).toBe(3);
    expect(screen.getByText('7')).toBeInTheDocument();

    // Click reset (the button immediately after "Draw to 7" in the controls bar)
    const drawTo7Button = screen.getByRole('button', { name: /draw to 7/i });
    const resetButton = drawTo7Button.nextElementSibling as HTMLButtonElement | null;
    expect(resetButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(resetButton!);
    });

    // Pile should be back to 10 and hand should be gone
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText(/Hand \(/)).not.toBeInTheDocument();
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

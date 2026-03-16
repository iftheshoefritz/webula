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
import { render, screen, act } from '@testing-library/react';
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
});

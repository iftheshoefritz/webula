// Mock next/navigation hooks (required for App Router hooks in Jest/jsdom)
const mockReplace = jest.fn();
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParamsValue,
}));

// Mock useFilterData hook
jest.mock('../../hooks/useFilterData', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock useScrollVisibility hook
jest.mock('../../hooks/useScrollVisibility', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockSearchResultsProps = jest.fn();
jest.mock('../../components/SearchResults', () => {
  return function MockSearchResults(props: { filteredData: any[]; useWindowScroll?: boolean; variant?: string }) {
    mockSearchResultsProps(props);
    return <div data-testid="search-results">Search Results - {props.filteredData?.length || 0} items</div>;
  };
});

let capturedSetSearchQuery: ((q: string) => void) | null = null;
jest.mock('../../components/SearchPills', () => {
  return function MockSearchPills({ setSearchQuery }: { setSearchQuery: (q: string) => void }) {
    capturedSetSearchQuery = setSearchQuery;
    return <div data-testid="search-pills" />;
  };
});

import { render, screen, fireEvent, act } from '@testing-library/react';
import CardSearchClient from '../../components/CardSearchClient';
import useFilterData from '../../hooks/useFilterData';
import useScrollVisibility from '../../hooks/useScrollVisibility';

const mockCardData = [
  { collectorsinfo: '1R000', originalName: 'Test Card', type: 'mission', name: 'test card', dilemmatype: '', imagefile: '', mission: '', unique: '' }
];

const mockColumns = ['collectorsinfo', 'originalName', 'type', 'name'];

describe('CardSearchClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchResultsProps.mockClear();
    capturedSetSearchQuery = null;
    mockSearchParamsValue = new URLSearchParams();
    (useScrollVisibility as jest.Mock).mockReturnValue(true);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the search bar immediately (no loading state)', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);

    render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

    // No loading state - data is passed directly as props
    expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search cards...')).toBeInTheDocument();
  });

  it('passes data to useFilterData hook', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);

    render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

    // useFilterData is called with loading=false and the provided data
    expect(useFilterData).toHaveBeenCalledWith(false, mockCardData, mockColumns, '');
  });

  it('renders SearchResults with filtered data', () => {
    const filteredCards = [mockCardData[0]];
    (useFilterData as jest.Mock).mockReturnValue(filteredCards);

    render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

    expect(screen.getByTestId('search-results')).toHaveTextContent('1 items');
  });

  it('renders SearchResults with empty data', () => {
    (useFilterData as jest.Mock).mockReturnValue([]);

    render(<CardSearchClient data={[]} columns={mockColumns} />);

    expect(screen.getByTestId('search-results')).toHaveTextContent('0 items');
  });

  it('passes useWindowScroll=true to SearchResults for window-based scrolling', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);

    render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

    // SearchResults uses window scroll so VirtuosoGrid scroll events reach window
    // and useScrollVisibility (which listens on window) can detect them.
    expect(mockSearchResultsProps).toHaveBeenCalledWith(
      expect.objectContaining({
        useWindowScroll: true,
      })
    );
  });

  it('renders the floating overlay with hidden styles when not scrolling', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);
    (useScrollVisibility as jest.Mock).mockReturnValue(false);

    render(<CardSearchClient data={mockCardData as any} columns={mockColumns} />);

    const input = screen.getByPlaceholderText('Search cards...');
    const overlay = input.closest('[style]') as HTMLElement;

    // Overlay should be hidden (opacity 0) when not scrolling
    expect(overlay.style.opacity).toBe('0');
    expect(overlay.style.position).toBe('fixed');
    expect(overlay.style.zIndex).toBe('50');
    expect(overlay.style.pointerEvents).toBe('none');
  });

  it('renders the floating overlay with visible styles when scrolling', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);
    (useScrollVisibility as jest.Mock).mockReturnValue(true);

    render(<CardSearchClient data={mockCardData as any} columns={mockColumns} />);

    const input = screen.getByPlaceholderText('Search cards...');
    const overlay = input.closest('[style]') as HTMLElement;

    // Overlay should be visible (opacity 1) during scrolling
    expect(overlay.style.opacity).toBe('1');
    expect(overlay.style.pointerEvents).toBe('auto');
  });

  describe('URL synchronisation', () => {
    it('updates the URL when the search query changes', () => {
      (useFilterData as jest.Mock).mockReturnValue([]);

      render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

      fireEvent.change(screen.getByPlaceholderText('Search cards...'), {
        target: { value: 'affiliation:federation' },
      });

      act(() => { jest.advanceTimersByTime(500); });

      // router.replace should have been called with the encoded query
      expect(mockReplace).toHaveBeenCalledWith(
        '?q=affiliation%3Afederation',
        { scroll: false }
      );
    });

    it('removes the q param from the URL when the search query is cleared to an empty string', () => {
      (useFilterData as jest.Mock).mockReturnValue([]);
      mockSearchParamsValue = new URLSearchParams('q=affiliation%3Afederation');

      render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

      // The input is pre-populated from the URL param so the clear button is visible
      fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

      const lastCall = mockReplace.mock.calls[mockReplace.mock.calls.length - 1];
      expect(lastCall[0]).toBe('?');
    });

    it('initialises search state from the ?q= URL parameter on load', () => {
      (useFilterData as jest.Mock).mockReturnValue([]);
      mockSearchParamsValue = new URLSearchParams('q=affiliation%3Afederation');

      render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

      // useFilterData should receive the query from the URL, not an empty string
      expect(useFilterData).toHaveBeenCalledWith(
        false,
        mockCardData,
        mockColumns,
        'affiliation:federation'
      );
    });

    it('does not update the URL on initial render when there is no query', () => {
      (useFilterData as jest.Mock).mockReturnValue([]);

      render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

      // Do not advance timers: the SearchBar debounce must not have fired yet.
      // router.replace should not be called before the debounce settles with an empty query.
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});

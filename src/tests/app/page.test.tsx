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

jest.mock('../../components/SearchBar', () => {
  return function MockSearchBar() {
    return <div data-testid="search-bar">Search Bar</div>;
  };
});

import { render, screen } from '@testing-library/react';
import CardSearchClient from '../../components/CardSearchClient';
import useFilterData from '../../hooks/useFilterData';
import useScrollVisibility from '../../hooks/useScrollVisibility';

const mockCardData = [
  { collectorsinfo: '1R000', originalName: 'Test Card', type: 'mission', name: 'test card' }
];

const mockColumns = ['collectorsinfo', 'originalName', 'type', 'name'];

describe('CardSearchClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchResultsProps.mockClear();
    (useScrollVisibility as jest.Mock).mockReturnValue(true);
  });

  it('renders the search bar immediately (no loading state)', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);

    render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

    // No loading state - data is passed directly as props
    expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
    expect(screen.getByTestId('search-bar')).toBeInTheDocument();
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

  it('passes useWindowScroll=false to SearchResults for container-based scrolling', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);

    render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

    // SearchResults must use container scroll (not window scroll) because
    // CardSearchClient uses a scrollable container with overflow-y-auto
    expect(mockSearchResultsProps).toHaveBeenCalledWith(
      expect.objectContaining({
        useWindowScroll: false,
      })
    );
  });

  it('renders the floating overlay with hidden styles when not scrolling', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);
    (useScrollVisibility as jest.Mock).mockReturnValue(false);

    render(<CardSearchClient data={mockCardData as any} columns={mockColumns} />);

    const searchBar = screen.getByTestId('search-bar');
    const overlay = searchBar.closest('[style]') as HTMLElement;

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

    const searchBar = screen.getByTestId('search-bar');
    const overlay = searchBar.closest('[style]') as HTMLElement;

    // Overlay should be visible (opacity 1) during scrolling
    expect(overlay.style.opacity).toBe('1');
    expect(overlay.style.pointerEvents).toBe('auto');
  });
});

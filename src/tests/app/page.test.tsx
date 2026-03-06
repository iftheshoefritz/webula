// Mock useFilterData hook
jest.mock('../../hooks/useFilterData', () => ({
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

jest.mock('../../components/Help', () => {
  return function MockHelp() {
    return <div data-testid="help">Help</div>;
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

const mockCardData = [
  { collectorsinfo: '1R000', originalName: 'Test Card', type: 'mission', name: 'test card' }
];

const mockColumns = ['collectorsinfo', 'originalName', 'type', 'name'];

describe('CardSearchClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchResultsProps.mockClear();
  });

  it('renders the search bar and help immediately (no loading state)', () => {
    (useFilterData as jest.Mock).mockReturnValue(mockCardData);

    render(<CardSearchClient data={mockCardData} columns={mockColumns} />);

    // No loading state - data is passed directly as props
    expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
    expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    expect(screen.getByTestId('help')).toBeInTheDocument();
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
});

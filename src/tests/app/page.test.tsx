// Mock all dependencies before importing the component
jest.mock('../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../hooks/useFilterData', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../components/SearchResults', () => {
  return function MockSearchResults({ filteredData }) {
    return <div data-testid="search-results">Search Results - {filteredData?.length || 0} items</div>;
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
import Home from '../../app/page';
import useDataFetching from '../../hooks/useDataFetching';
import useFilterData from '../../hooks/useFilterData';

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a loading message initially', () => {
    (useDataFetching as jest.Mock).mockReturnValue({
      data: [],
      columns: [],
      loading: true,
    });

    render(<Home />);

    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('renders the search bar and help after loading', () => {
    (useDataFetching as jest.Mock).mockReturnValue({
      data: [
        { collectorsinfo: '1R000', originalName: 'Test Card', type: 'mission' }
      ],
      columns: ['collectorsinfo', 'originalName', 'type'],
      loading: false,
    });

    (useFilterData as jest.Mock).mockReturnValue([
      { collectorsinfo: '1R000', originalName: 'Test Card', type: 'mission' }
    ]);

    render(<Home />);

    expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();

    expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    expect(screen.getByTestId('help')).toBeInTheDocument();
  });
});

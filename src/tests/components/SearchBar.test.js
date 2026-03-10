import { render, screen, fireEvent, act } from '@testing-library/react';
import SearchBar from '../../components/SearchBar';

// Lodash debounce is used inside SearchBar. We fake timers so we can control
// when debounced callbacks fire without waiting real milliseconds.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('SearchBar (styled variant)', () => {
  it('does not show the clear button when the input is empty', () => {
    render(<SearchBar searchQuery="" setSearchQuery={jest.fn()} variant="styled" />);
    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();
  });

  it('shows the clear button when the input has a value', () => {
    render(<SearchBar searchQuery="picard" setSearchQuery={jest.fn()} variant="styled" />);
    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument();
  });

  it('clears the input and calls setSearchQuery immediately (no debounce) when the clear button is clicked', () => {
    const setSearchQuery = jest.fn();
    render(<SearchBar searchQuery="picard" setSearchQuery={setSearchQuery} variant="styled" />);

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

    // setSearchQuery should be called immediately — not after a 500ms debounce
    expect(setSearchQuery).toHaveBeenCalledWith('');
    expect(setSearchQuery).toHaveBeenCalledTimes(1);

    // The input should now be empty
    expect(screen.getByPlaceholderText('Search cards...')).toHaveValue('');
  });

  it('hides the clear button after the input is cleared', () => {
    const setSearchQuery = jest.fn();
    render(<SearchBar searchQuery="picard" setSearchQuery={setSearchQuery} variant="styled" />);

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

    expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();
  });

  it('does not fire the pending debounced call for the previous value after clearing', () => {
    const setSearchQuery = jest.fn();
    render(<SearchBar searchQuery="" setSearchQuery={setSearchQuery} variant="styled" />);

    // Type something to queue a debounced call for 'worf'
    fireEvent.change(screen.getByPlaceholderText('Search cards...'), {
      target: { value: 'worf' },
    });

    // Clear immediately before the debounce fires
    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

    // Flush any remaining timers
    act(() => jest.runAllTimers());

    // setSearchQuery should never have been called with 'worf' — the pending
    // debounced call was cancelled when clear was clicked
    expect(setSearchQuery).not.toHaveBeenCalledWith('worf');
    expect(setSearchQuery).toHaveBeenCalledWith('');
  });
});

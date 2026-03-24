import { render, screen, fireEvent, act } from '@testing-library/react';
import SearchBar, { extractTextPortion, extractFieldPortion } from '../../components/SearchBar';

// Lodash debounce is used inside SearchBar. We fake timers so we can control
// when debounced callbacks fire without waiting real milliseconds.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('extractTextPortion / extractFieldPortion helpers', () => {
  it('returns empty string when query has no free text', () => {
    expect(extractTextPortion('-type:mission -type:dilemma')).toBe('');
    expect(extractTextPortion('type:personnel')).toBe('');
  });

  it('returns the free-text words when there are no field filters', () => {
    expect(extractTextPortion('picard')).toBe('picard');
    expect(extractTextPortion('jean luc')).toBe('jean luc');
  });

  it('returns only the free-text portion when mixed with field filters', () => {
    expect(extractTextPortion('type:personnel picard')).toBe('picard');
  });

  it('strips free-text words from the field portion', () => {
    expect(extractFieldPortion('type:personnel picard', 'picard')).toBe('type:personnel');
    expect(extractFieldPortion('-type:mission -type:dilemma', '')).toBe('-type:mission -type:dilemma');
  });
});

describe('SearchBar (styled variant)', () => {
  it('shows only the free-text portion when searchQuery contains field filters', () => {
    render(<SearchBar searchQuery="-type:mission -type:dilemma" setSearchQuery={jest.fn()} variant="styled" />);
    expect(screen.getByPlaceholderText('Search cards...')).toHaveValue('');
  });

  it('preserves field filters when user types free text', () => {
    const setSearchQuery = jest.fn();
    render(<SearchBar searchQuery="-type:mission -type:dilemma" setSearchQuery={setSearchQuery} variant="styled" />);

    fireEvent.change(screen.getByPlaceholderText('Search cards...'), {
      target: { value: 'picard' },
    });

    act(() => jest.advanceTimersByTime(500));

    // The full query sent to the parent must include both the field filter and the typed text
    expect(setSearchQuery).toHaveBeenCalledWith(expect.stringContaining('-type:mission'));
    expect(setSearchQuery).toHaveBeenCalledWith(expect.stringContaining('-type:dilemma'));
    expect(setSearchQuery).toHaveBeenCalledWith(expect.stringContaining('picard'));
  });

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

  it('does not re-send the old query when setSearchQuery prop is replaced and searchQuery prop changes simultaneously', () => {
    // Regression: when a SearchPills pill is removed, CardSearchClient calls
    // setSearchQuery(newQuery) which triggers router.replace(). This used to cause
    // useSearchParams() to return a new object reference, recreating the setSearchQuery
    // useCallback, which in turn recreated debouncedSetSearchQuery in SearchBar.
    // The useMemo effect re-firing would set isLocalChangeRef=true and queue a
    // debounced call with the stale localSearchQuery, restoring the removed pill.
    const firstSetSearchQuery = jest.fn();
    const { rerender } = render(
      <SearchBar searchQuery="affiliation:federation type:personnel" setSearchQuery={firstSetSearchQuery} variant="styled" />
    );

    // Flush the initial debounce triggered by mounting with a non-empty searchQuery
    act(() => jest.advanceTimersByTime(500));
    firstSetSearchQuery.mockClear();

    // Simulate what CardSearchClient does after a pill is removed:
    // - searchQuery prop is updated to the stripped query
    // - setSearchQuery prop is a NEW function reference (recreated useCallback)
    const newSetSearchQuery = jest.fn();
    act(() => {
      rerender(
        <SearchBar searchQuery="type:personnel" setSearchQuery={newSetSearchQuery} variant="styled" />
      );
    });

    // Flush the debounce window
    act(() => jest.advanceTimersByTime(600));

    // The old full query must never have been re-sent
    expect(newSetSearchQuery).not.toHaveBeenCalledWith('affiliation:federation type:personnel');

    // The input shows only the free-text portion of the query; field filters like
    // type:personnel are displayed as chips in SearchPills, not in the text input.
    expect(screen.getByPlaceholderText('Search cards...')).toHaveValue('');
  });
});

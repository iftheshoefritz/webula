const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import HomeSplash from '../../components/HomeSplash';
import { START_PAGE_KEY } from '../../lib/startPage';

describe('HomeSplash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('shows three choices on a bare / with nothing remembered', () => {
    render(<HomeSplash initialQuery="" initialHome={false} />);
    expect(screen.getByTestId('home-splash')).toBeInTheDocument();
    expect(screen.getByTestId('home-choice-search')).toHaveAttribute('href', '/');
    expect(screen.getByTestId('home-choice-decks')).toHaveAttribute('href', '/decks');
    expect(screen.getByTestId('home-choice-practice')).toHaveAttribute('href', '/decks/practice?openPicker=true');
    expect(screen.getByTestId('home-remember')).not.toBeChecked();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('links Practice to the table when a deck is current', () => {
    localStorage.setItem('currentDeck', JSON.stringify({ '1R000': { row: {}, count: 1 } }));
    render(<HomeSplash initialQuery="" initialHome={false} />);
    expect(screen.getByTestId('home-choice-practice')).toHaveAttribute('href', '/decks/practice');
  });

  it('shows no splash and does not redirect with q, with or without a remembered choice', () => {
    const { unmount } = render(<HomeSplash initialQuery="n:Picard" initialHome={false} />);
    expect(screen.queryByTestId('home-splash')).not.toBeInTheDocument();
    unmount();
    localStorage.setItem(START_PAGE_KEY, 'decks');
    render(<HomeSplash initialQuery="n:Picard" initialHome={false} />);
    expect(screen.queryByTestId('home-splash')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects a bare / to a remembered deck builder', () => {
    localStorage.setItem(START_PAGE_KEY, 'decks');
    render(<HomeSplash initialQuery="" initialHome={false} />);
    expect(screen.queryByTestId('home-splash')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/decks');
  });

  it('redirects a bare / to a remembered practice table, with the picker when there is no deck', () => {
    localStorage.setItem(START_PAGE_KEY, 'practice');
    render(<HomeSplash initialQuery="" initialHome={false} />);
    expect(mockReplace).toHaveBeenCalledWith('/decks/practice?openPicker=true');
  });

  it('shows no splash and does not redirect with a remembered search', () => {
    localStorage.setItem(START_PAGE_KEY, 'search');
    render(<HomeSplash initialQuery="" initialHome={false} />);
    expect(screen.queryByTestId('home-splash')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('ignores a junk stored value', () => {
    localStorage.setItem(START_PAGE_KEY, 'junk');
    render(<HomeSplash initialQuery="" initialHome={false} />);
    expect(screen.getByTestId('home-splash')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the splash on home=1 despite a remembered choice, and marks it', () => {
    localStorage.setItem(START_PAGE_KEY, 'decks');
    render(<HomeSplash initialQuery="" initialHome={true} />);
    expect(screen.getByTestId('home-splash')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId('home-remember')).toBeChecked();
    expect(screen.getByTestId('home-choice-decks')).toContainElement(screen.getByTestId('home-remembered'));
  });

  it('remembers a choice made with Remember on', () => {
    render(<HomeSplash initialQuery="" initialHome={false} />);
    fireEvent.click(screen.getByTestId('home-remember'));
    fireEvent.click(screen.getByTestId('home-choice-decks'));
    expect(localStorage.getItem(START_PAGE_KEY)).toBe('decks');
  });

  it('forgets the remembered choice when a choice is made with Remember off', () => {
    localStorage.setItem(START_PAGE_KEY, 'decks');
    render(<HomeSplash initialQuery="" initialHome={true} />);
    fireEvent.click(screen.getByTestId('home-remember'));
    fireEvent.click(screen.getByTestId('home-choice-practice'));
    expect(localStorage.getItem(START_PAGE_KEY)).toBeNull();
  });

  it('closes on Search cards', () => {
    render(<HomeSplash initialQuery="" initialHome={false} />);
    fireEvent.click(screen.getByTestId('home-choice-search'));
    expect(screen.queryByTestId('home-splash')).not.toBeInTheDocument();
  });
});

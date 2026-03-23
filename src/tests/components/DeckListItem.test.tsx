import { render, screen, fireEvent } from '@testing-library/react';
import DeckListItem from '../../components/DeckListItem';

const defaultProps = {
  incrementIncluded: jest.fn(),
  decrementIncluded: jest.fn(),
  collectorsinfo: '1U100',
  count: 2,
  name: 'Jean-Luc Picard',
  imagefile: 'picard',
  unique: false,
};

describe('DeckListItem quantity controls', () => {
  it('renders increase and decrease buttons', () => {
    render(<DeckListItem {...defaultProps} />);
    expect(screen.getByRole('button', { name: /increase quantity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decrease quantity/i })).toBeInTheDocument();
  });

  it('calls incrementIncluded when increase button is clicked', () => {
    const incrementIncluded = jest.fn();
    render(<DeckListItem {...defaultProps} incrementIncluded={incrementIncluded} />);
    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }));
    expect(incrementIncluded).toHaveBeenCalledTimes(1);
  });

  it('calls decrementIncluded when decrease button is clicked', () => {
    const decrementIncluded = jest.fn();
    render(<DeckListItem {...defaultProps} decrementIncluded={decrementIncluded} />);
    fireEvent.click(screen.getByRole('button', { name: /decrease quantity/i }));
    expect(decrementIncluded).toHaveBeenCalledTimes(1);
  });

  it('displays the card count', () => {
    render(<DeckListItem {...defaultProps} count={3} />);
    expect(screen.getByText('3x')).toBeInTheDocument();
  });
});

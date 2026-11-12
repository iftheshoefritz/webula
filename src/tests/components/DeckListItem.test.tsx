import { render, screen, fireEvent } from '@testing-library/react';
import DeckListItem from '../../components/DeckListItem';

const defaultProps = {
  incrementIncluded: jest.fn(),
  decrementIncluded: jest.fn(),
  collectorsinfo: '1U100',
  count: 2,
  name: 'Jean-Luc Picard',
  imageSrc: '/cardimages/picard.jpg',
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

describe('DeckListItem without handlers (#899)', () => {
  const { incrementIncluded, decrementIncluded, ...readOnlyProps } = defaultProps;

  it('shows the count with no quantity buttons', () => {
    render(<DeckListItem {...readOnlyProps} count={3} />);
    expect(screen.getByText('3x')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the card image above a modal on hover when given a preview layer', () => {
    render(<DeckListItem {...readOnlyProps} previewLayer="z-[200]" />);
    fireEvent.mouseEnter(screen.getByText('Jean-Luc Picard'));
    const image = screen.getByAltText('Jean-Luc Picard');
    expect(image.closest('.fixed')).toHaveClass('z-[200]');
    expect(image.closest('li')).toBeNull();
  });
});

describe('DeckListItem playtest badge (#1614)', () => {
  it('shows the badge for a playtest card only', () => {
    const { rerender } = render(<DeckListItem {...defaultProps} playtest />);
    expect(screen.getByTestId('playtest-badge')).toHaveTextContent('Playtest');
    rerender(<DeckListItem {...defaultProps} />);
    expect(screen.queryByTestId('playtest-badge')).not.toBeInTheDocument();
  });
});

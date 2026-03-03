import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SearchResults from '../../components/SearchResults';
import { CardDef, Deck } from '../../types';

const cardFixture = (overrides = {}): CardDef => ({
  collectorsinfo: '1R000',
  dilemmatype: 'planet',
  imagefile: 'card1',
  name: 'Test Card',
  type: 'mission',
  count: 1,
  originalName: 'Test Card',
  mission: 'S',
  unique: 'n',
  ...overrides,
});

describe('SearchResults', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('click functionality', () => {
    it('calls onCardSelected when a card image is clicked', () => {
      const card = cardFixture();
      const onCardSelected = jest.fn();

      render(
        <SearchResults
          filteredData={[card]}
          onCardSelected={onCardSelected}
        />
      );

      fireEvent.click(screen.getByAltText('Test Card'));
      expect(onCardSelected).toHaveBeenCalledWith(card);
    });

    it('does not throw when onCardSelected is not provided', () => {
      const card = cardFixture();

      render(<SearchResults filteredData={[card]} />);

      expect(() => fireEvent.click(screen.getByAltText('Test Card'))).not.toThrow();
    });
  });

  describe('right-click functionality', () => {
    it('calls onCardDeselected with the event and card on context menu', () => {
      const card = cardFixture();
      const onCardDeselected = jest.fn();

      render(
        <SearchResults
          filteredData={[card]}
          onCardDeselected={onCardDeselected}
        />
      );

      fireEvent.contextMenu(screen.getByAltText('Test Card'));
      expect(onCardDeselected).toHaveBeenCalledTimes(1);
      expect(onCardDeselected.mock.calls[0][1]).toEqual(card);
      // first arg is the event object
      expect(onCardDeselected.mock.calls[0][0]).toBeDefined();
    });

    it('does not throw when onCardDeselected is not provided', () => {
      const card = cardFixture();

      render(<SearchResults filteredData={[card]} />);

      expect(() => fireEvent.contextMenu(screen.getByAltText('Test Card'))).not.toThrow();
    });
  });

  describe('hover popup appears correctly positioned', () => {
    it('shows enlarged image on mouse enter when withHover is true', () => {
      const card = cardFixture({ collectorsinfo: '1R001', imagefile: 'hover_card' });

      render(
        <SearchResults
          filteredData={[card]}
          withHover={true}
        />
      );

      const img = screen.getByAltText('Test Card');

      // Mock getBoundingClientRect for positioning
      Object.defineProperty(img, 'getBoundingClientRect', {
        value: () => ({
          top: 100, bottom: 329, left: 50, right: 215, width: 165, height: 229,
        }),
      });

      fireEvent.mouseEnter(img);

      // Should now have two images: the thumbnail and the hover popup
      const allImages = screen.getAllByAltText('Test Card');
      expect(allImages.length).toBe(2);

      // The hover popup image should be the larger one (width=230)
      const hoverImg = allImages[1];
      expect(hoverImg).toHaveAttribute('width', '230');
    });

    it('does not show hover popup when withHover is false', () => {
      const card = cardFixture();

      render(
        <SearchResults
          filteredData={[card]}
          withHover={false}
        />
      );

      fireEvent.mouseEnter(screen.getByAltText('Test Card'));

      const allImages = screen.getAllByAltText('Test Card');
      expect(allImages.length).toBe(1);
    });

    it('hides hover popup on mouse leave after timeout', () => {
      const card = cardFixture({ collectorsinfo: '1R002', imagefile: 'card2' });

      render(
        <SearchResults
          filteredData={[card]}
          withHover={true}
        />
      );

      const img = screen.getByAltText('Test Card');
      Object.defineProperty(img, 'getBoundingClientRect', {
        value: () => ({
          top: 100, bottom: 329, left: 50, right: 215, width: 165, height: 229,
        }),
      });

      fireEvent.mouseEnter(img);
      expect(screen.getAllByAltText('Test Card').length).toBe(2);

      fireEvent.mouseLeave(img);
      act(() => { jest.advanceTimersByTime(150); });

      expect(screen.getAllByAltText('Test Card').length).toBe(1);
    });

    it('positions popup to the left when there is no room on the right', () => {
      const card = cardFixture({ collectorsinfo: '1R003', imagefile: 'card3' });

      // Set viewport to be narrow
      Object.defineProperty(window, 'innerWidth', { value: 300, writable: true });
      Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });

      render(
        <SearchResults
          filteredData={[card]}
          withHover={true}
        />
      );

      const img = screen.getByAltText('Test Card');
      Object.defineProperty(img, 'getBoundingClientRect', {
        value: () => ({
          top: 100, bottom: 329, left: 50, right: 215, width: 165, height: 229,
        }),
      });

      fireEvent.mouseEnter(img);

      // The portal container div should have position fixed and left < targetRect.left
      const hoverImg = screen.getAllByAltText('Test Card')[1];
      const container = hoverImg.parentElement!;
      expect(container.style.left).toBeTruthy();
      // Left position = targetRect.left - imageWidth - 10 = 50 - 458 - 10 = -418
      // This validates the "position to left" branch was taken
      expect(parseInt(container.style.left)).toBeLessThan(50);
    });
  });

  describe('card count badge displays on cards in deck', () => {
    it('shows the count from currentDeck for a card', () => {
      const card = cardFixture({ collectorsinfo: '1R010' });
      const deck: Deck = {
        '1R010': { row: { ...card, count: 2 }, count: 2 },
      };

      render(
        <SearchResults
          filteredData={[card]}
          currentDeck={deck}
        />
      );

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows 0 when card is not in currentDeck', () => {
      const card = cardFixture({ collectorsinfo: '1R011' });
      const deck: Deck = {};

      render(
        <SearchResults
          filteredData={[card]}
          currentDeck={deck}
        />
      );

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('does not show badge when currentDeck is not provided', () => {
      const card = cardFixture();

      const { container } = render(
        <SearchResults filteredData={[card]} />
      );

      // The badge div has specific classes; should not be present
      expect(container.querySelector('.bg-black.bg-opacity-50')).not.toBeInTheDocument();
    });
  });

  describe('search/filter updates list correctly', () => {
    it('renders all cards in filteredData', () => {
      const cards = [
        cardFixture({ collectorsinfo: '1R100', name: 'Alpha', imagefile: 'alpha' }),
        cardFixture({ collectorsinfo: '1R101', name: 'Beta', imagefile: 'beta' }),
        cardFixture({ collectorsinfo: '1R102', name: 'Gamma', imagefile: 'gamma' }),
      ];

      render(<SearchResults filteredData={cards} />);

      expect(screen.getByAltText('Alpha')).toBeInTheDocument();
      expect(screen.getByAltText('Beta')).toBeInTheDocument();
      expect(screen.getByAltText('Gamma')).toBeInTheDocument();
    });

    it('renders no cards when filteredData is empty', () => {
      const { container } = render(<SearchResults filteredData={[]} />);

      expect(container.querySelectorAll('img').length).toBe(0);
    });

    it('updates rendered cards when filteredData changes', () => {
      const allCards = [
        cardFixture({ collectorsinfo: '1R200', name: 'Card A', imagefile: 'a' }),
        cardFixture({ collectorsinfo: '1R201', name: 'Card B', imagefile: 'b' }),
      ];

      const { rerender } = render(<SearchResults filteredData={allCards} />);
      expect(screen.getByAltText('Card A')).toBeInTheDocument();
      expect(screen.getByAltText('Card B')).toBeInTheDocument();

      // Simulate a filter change that removes Card B
      rerender(<SearchResults filteredData={[allCards[0]]} />);
      expect(screen.getByAltText('Card A')).toBeInTheDocument();
      expect(screen.queryByAltText('Card B')).not.toBeInTheDocument();
    });

    it('updates card count badges when deck changes', () => {
      const card = cardFixture({ collectorsinfo: '1R300' });
      const emptyDeck: Deck = {};
      const updatedDeck: Deck = {
        '1R300': { row: { ...card, count: 3 }, count: 3 },
      };

      const { rerender } = render(
        <SearchResults filteredData={[card]} currentDeck={emptyDeck} />
      );
      expect(screen.getByText('0')).toBeInTheDocument();

      rerender(
        <SearchResults filteredData={[card]} currentDeck={updatedDeck} />
      );
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
});

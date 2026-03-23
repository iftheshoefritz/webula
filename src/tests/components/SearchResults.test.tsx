import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SearchResults from '../../components/SearchResults';
import { CardDef, Deck } from '../../types';

// Mock react-virtuoso's VirtuosoGrid and Virtuoso to render items directly in jsdom
jest.mock('react-virtuoso', () => ({
  VirtuosoGrid: ({ totalCount, itemContent, listClassName, components, style, useWindowScroll, ...rest }: any) => {
    const ListComp = components?.List || 'div';
    const ItemComp = components?.Item || 'div';
    return (
      <ListComp
        className={listClassName}
        style={style}
        data-testid="virtuoso-grid"
        data-use-window-scroll={useWindowScroll}
      >
        {Array.from({ length: totalCount }, (_, i) => (
          <ItemComp key={i}>{itemContent(i)}</ItemComp>
        ))}
      </ListComp>
    );
  },
  Virtuoso: ({ totalCount, itemContent, style, useWindowScroll, ...rest }: any) => {
    return (
      <div
        style={style}
        data-testid="virtuoso-list"
        data-use-window-scroll={useWindowScroll}
      >
        {Array.from({ length: totalCount }, (_, i) => (
          <div key={i}>{itemContent(i)}</div>
        ))}
      </div>
    );
  },
}));

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

  describe('virtualization', () => {
    it('renders items via VirtuosoGrid', () => {
      const cards = [
        cardFixture({ collectorsinfo: '1R100', name: 'Alpha', imagefile: 'alpha' }),
        cardFixture({ collectorsinfo: '1R101', name: 'Beta', imagefile: 'beta' }),
      ];

      render(<SearchResults filteredData={cards} />);

      expect(screen.getByTestId('virtuoso-grid')).toBeInTheDocument();
      expect(screen.getByAltText('Alpha')).toBeInTheDocument();
      expect(screen.getByAltText('Beta')).toBeInTheDocument();
    });

    it('applies default grid classes when gridClassName is not provided', () => {
      render(<SearchResults filteredData={[cardFixture()]} />);

      const grid = screen.getByTestId('virtuoso-grid');
      expect(grid.className).toContain('grid-cols-1');
      expect(grid.className).toContain('xl:grid-cols-5');
    });

    it('applies custom grid classes when gridClassName is provided', () => {
      render(
        <SearchResults
          filteredData={[cardFixture()]}
          gridClassName="grid grid-cols-1 lg:grid-cols-2 gap-4"
        />
      );

      const grid = screen.getByTestId('virtuoso-grid');
      expect(grid.className).toContain('lg:grid-cols-2');
    });

    it('applies height styling when useWindowScroll is false', () => {
      render(
        <SearchResults
          filteredData={[cardFixture()]}
          useWindowScroll={false}
        />
      );

      const grid = screen.getByTestId('virtuoso-grid');
      expect(grid).toHaveStyle({ height: '100%', flex: '1 1 auto' });
    });

    it('does not apply height styling when useWindowScroll is true (default)', () => {
      render(
        <SearchResults
          filteredData={[cardFixture()]}
          useWindowScroll={true}
        />
      );

      const grid = screen.getByTestId('virtuoso-grid');
      expect(grid).not.toHaveStyle({ height: '100%' });
    });
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
      let container: HTMLElement | null = hoverImg.parentElement;
      while (container && !container.style.left) {
        container = container.parentElement;
      }
      expect(container?.style.left).toBeTruthy();
      // Left position = targetRect.left - imageWidth - 10 = 50 - 458 - 10 = -418
      // This validates the "position to left" branch was taken
      expect(parseInt(container!.style.left)).toBeLessThan(50);
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

  describe('list view mode', () => {
    it('renders Virtuoso list when viewMode is list', () => {
      const cards = [
        cardFixture({ collectorsinfo: '1R100', name: 'Alpha', imagefile: 'alpha' }),
        cardFixture({ collectorsinfo: '1R101', name: 'Beta', imagefile: 'beta' }),
      ];

      render(<SearchResults filteredData={cards} viewMode="list" />);

      expect(screen.getByTestId('virtuoso-list')).toBeInTheDocument();
      expect(screen.queryByTestId('virtuoso-grid')).not.toBeInTheDocument();
    });

    it('renders VirtuosoGrid when viewMode is image (default)', () => {
      render(<SearchResults filteredData={[cardFixture()]} viewMode="image" />);

      expect(screen.getByTestId('virtuoso-grid')).toBeInTheDocument();
      expect(screen.queryByTestId('virtuoso-list')).not.toBeInTheDocument();
    });

    it('shows card name as text in list view', () => {
      const card = cardFixture({ name: 'Test Card Name' });
      render(<SearchResults filteredData={[card]} viewMode="list" />);

      expect(screen.getByText('Test Card Name')).toBeInTheDocument();
    });

    it('calls onCardSelected when list row is clicked', () => {
      const card = cardFixture({ name: 'Clickable Card' });
      const onCardSelected = jest.fn();

      render(
        <SearchResults
          filteredData={[card]}
          onCardSelected={onCardSelected}
          viewMode="list"
        />
      );

      fireEvent.click(screen.getByText('Clickable Card'));
      expect(onCardSelected).toHaveBeenCalledWith(card);
    });

    it('calls onCardDeselected on context menu in list view', () => {
      const card = cardFixture({ name: 'Right Click Card' });
      const onCardDeselected = jest.fn();

      render(
        <SearchResults
          filteredData={[card]}
          onCardDeselected={onCardDeselected}
          viewMode="list"
        />
      );

      fireEvent.contextMenu(screen.getByText('Right Click Card'));
      expect(onCardDeselected).toHaveBeenCalledTimes(1);
      expect(onCardDeselected.mock.calls[0][1]).toEqual(card);
    });

    it('shows deck count badge in list view', () => {
      const card = cardFixture({ collectorsinfo: '1R010' });
      const deck: Deck = {
        '1R010': { row: { ...card, count: 3 }, count: 3 },
      };

      render(
        <SearchResults
          filteredData={[card]}
          currentDeck={deck}
          viewMode="list"
        />
      );

      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows type-specific fields for personnel in list view', () => {
      const card = {
        ...cardFixture({ type: 'personnel', name: 'Crew Member' }),
        affiliation: 'Federation',
        species: 'human',
        integrity: '6',
        cunning: '7',
        strength: '5',
        skills: 'Diplomacy Medical',
      };

      render(<SearchResults filteredData={[card]} viewMode="list" />);

      // Affiliation icon is now in the header row (left of cost/title)
      expect(screen.getByAltText('Federation')).toBeInTheDocument();
      expect(screen.getByText('human')).toBeInTheDocument();
      expect(screen.getByText('6|7|5')).toBeInTheDocument();
      expect(screen.getByText('Diplomacy Medical')).toBeInTheDocument();
    });

    it('shows gametext in list view', () => {
      const card = {
        ...cardFixture({ type: 'event', name: 'Some Event' }),
        gametext: 'This is the full game text.',
      };

      render(<SearchResults filteredData={[card]} viewMode="list" />);

      expect(screen.getByText('This is the full game text.')).toBeInTheDocument();
    });

    it('shows mission-specific fields in list view', () => {
      const card = {
        ...cardFixture({ type: 'mission', name: 'Test Mission' }),
        affiliation: '[baj][fed]',
        dilemmatype: 'P',
        quadrant: 'A',
        span: '3',
        points: '35',
        skills: 'Leadership, Diplomacy',
      };

      render(<SearchResults filteredData={[card]} viewMode="list" />);

      // Mission type is now rendered as an icon
      expect(screen.getByAltText('P')).toBeInTheDocument();
      // Quadrant is now rendered as an icon (Alpha quadrant)
      expect(screen.getByAltText('A')).toBeInTheDocument();
      expect(screen.getByText('Span 3')).toBeInTheDocument();
      // Points now shown to left of title
      expect(screen.getByText('35')).toBeInTheDocument();
      expect(screen.getByText('Leadership, Diplomacy')).toBeInTheDocument();
    });

    it('shows quadrant icon for gamma quadrant missions', () => {
      const card = {
        ...cardFixture({ type: 'mission', name: 'GQ Mission' }),
        quadrant: 'G',
        dilemmatype: 'S',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByAltText('G')).toBeInTheDocument();
    });

    it('shows quadrant icon for delta quadrant missions', () => {
      const card = {
        ...cardFixture({ type: 'mission', name: 'DQ Mission' }),
        quadrant: 'D',
        dilemmatype: 'S',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByAltText('D')).toBeInTheDocument();
    });

    it('does not show card type badge in list view', () => {
      const card = cardFixture({ type: 'event', name: 'Badge Test' });
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      // The type badge text (e.g., "event" in a pill span) should not be present
      expect(screen.queryByText('event')).not.toBeInTheDocument();
    });

    it('applies height styling in list view when useWindowScroll is false', () => {
      render(
        <SearchResults
          filteredData={[cardFixture()]}
          viewMode="list"
          useWindowScroll={false}
        />
      );

      const list = screen.getByTestId('virtuoso-list');
      expect(list).toHaveStyle({ height: '100%', flex: '1 1 auto' });
    });

    it('does not show HoF badge even when card has hof=y', () => {
      const card = { ...cardFixture({ type: 'event', name: 'HoF Card' }), hof: 'y' };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.queryByText('HoF')).not.toBeInTheDocument();
    });

    it('shows cost as a prominent number without "Cost:" label', () => {
      const card = { ...cardFixture({ type: 'event', name: 'Costly Card' }), cost: '5' };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.queryByText(/Cost:/i)).not.toBeInTheDocument();
    });

    it('renders icon images for bracket tags in the icons field', () => {
      const card = {
        ...cardFixture({ type: 'personnel', name: 'Test Personnel' }),
        icons: '[Cmd][Stf]',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByAltText('Cmd')).toBeInTheDocument();
      expect(screen.getByAltText('Stf')).toBeInTheDocument();
    });

    it('renders affiliation icon images for bracket tags in mission affiliation', () => {
      const card = {
        ...cardFixture({ type: 'mission', name: 'Test Mission' }),
        affiliation: '[Baj][Fed]',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByAltText('Baj')).toBeInTheDocument();
      expect(screen.getByAltText('Fed')).toBeInTheDocument();
    });

    it('shows affiliation icon in header row (left of title) for personnel', () => {
      const card = {
        ...cardFixture({ type: 'personnel', name: 'Header Personnel' }),
        affiliation: 'Klingon',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      const icon = screen.getByAltText('Klingon');
      expect(icon).toBeInTheDocument();
      // Affiliation icon should appear before the name in the DOM (same header row)
      const name = screen.getByText('Header Personnel');
      expect(icon.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows affiliation icon in header row (left of title) for ships', () => {
      const card = {
        ...cardFixture({ type: 'ship', name: 'USS Test' }),
        affiliation: 'Federation',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      const icon = screen.getByAltText('Federation');
      const name = screen.getByText('USS Test');
      expect(icon.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows event type icon in header for events', () => {
      const card = { ...cardFixture({ type: 'event', name: 'Test Event' }) };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByAltText('event')).toBeInTheDocument();
    });

    it('shows interrupt type icon in header for interrupts', () => {
      const card = { ...cardFixture({ type: 'interrupt', name: 'Test Interrupt' }) };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByAltText('interrupt')).toBeInTheDocument();
    });

    it('shows equipment type icon in header for equipment', () => {
      const card = { ...cardFixture({ type: 'equipment', name: 'Test Equipment' }) };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByAltText('equipment')).toBeInTheDocument();
    });

    it('shows dilemma type icon in header for dilemmas', () => {
      const card = {
        ...cardFixture({ type: 'dilemma', name: 'Test Dilemma' }),
        dilemmatype: 'S',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      const icon = screen.getByAltText('S');
      const name = screen.getByText('Test Dilemma');
      expect(icon.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows mission type icon in header for missions', () => {
      const card = {
        ...cardFixture({ type: 'mission', name: 'Test Mission 2' }),
        dilemmatype: 'P',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      const icon = screen.getByAltText('P');
      const name = screen.getByText('Test Mission 2');
      expect(icon.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('renders icon images in gametext bracket tags', () => {
      const card = {
        ...cardFixture({ type: 'event', name: 'Test Event' }),
        gametext: 'Plays on [Fed] personnel.',
      };
      render(<SearchResults filteredData={[card]} viewMode="list" />);
      expect(screen.getByAltText('Fed')).toBeInTheDocument();
      expect(screen.getByText(/Plays on/)).toBeInTheDocument();
      expect(screen.getByText(/personnel\./)).toBeInTheDocument();
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

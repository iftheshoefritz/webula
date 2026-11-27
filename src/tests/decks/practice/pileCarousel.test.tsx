// Mock next/navigation hooks (required for App Router hooks in Jest/jsdom)
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  extractDrawDeck: jest.fn(),
  shuffleArray: jest.fn((arr) => arr),
}));

jest.mock('react-icons/fa', () => ({
  FaRedo: () => null,
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage, { PILE_CAROUSEL_KEY } from '../../../app/decks/practice/PracticeTable';
import { pileSizeLabel } from '../../../app/decks/practice/PileCarousel';
import { drawOpeningHand } from '../../fixtures/drawOpeningHand';
import useDataFetching from '../../../hooks/useDataFetching';
import { extractDrawDeck, shuffleArray } from '../../../app/decks/deckBuilderUtils';

const makePersonnel = (n: number) => ({
  collectorsinfo: `2C1${String(n).padStart(2, '0')}`,
  originalName: `Personnel ${n}`,
  type: 'personnel',
  name: `personnel ${n}`,
  imagefile: `personnel_${n}`,
  pile: 'drawDeck',
  count: 1,
});

// 15 cards: the opening hand takes 7 from the top, so the draw deck holds Personnel 8 to 15, top first.
const CARDS = Array.from({ length: 15 }, (_, i) => makePersonnel(i + 1));

// 4 invented dilemmas for the dilemma pile (#1900).
const DILEMMAS = [1, 2, 3, 4].map((n) => ({
  collectorsinfo: `9D00${n}`,
  originalName: `Dilemma ${n}`,
  type: 'dilemma',
  name: `dilemma ${n}`,
  imagefile: `dilemma_${n}`,
  pile: 'dilemmaPile',
  count: 1,
}));

// jsdom lays nothing out: give every element a size, so the carousel has room for its cards.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});
afterAll(() => {
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
  if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
});

const middleCard = () => {
  const card = document.querySelector('[data-testid="pile-carousel-card"][data-carousel-distance="0"] button');
  if (!card) throw new Error('No middle card');
  return card as HTMLButtonElement;
};

const middleName = () => middleCard().getAttribute('aria-label')?.replace(/^(Select|Deselect) /, '');

const position = () => screen.getByTestId('pile-carousel-position').textContent;

const openSearch = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^download from the draw deck$/i }));
  });
};

const tap = async (element: Element) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

const slideTo = async (index: number) => {
  await act(async () => {
    fireEvent.change(screen.getByTestId('pile-carousel-slider'), { target: { value: String(index) } });
  });
};

describe('pileSizeLabel (#1937)', () => {
  it('counts the cards of a pile, singular and plural', () => {
    expect(pileSizeLabel(0)).toBe('0 cards');
    expect(pileSizeLabel(1)).toBe('1 card');
    expect(pileSizeLabel(40)).toBe('40 cards');
  });
});

describe('Practice table: search the draw deck in a carousel (#1899)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });
    (shuffleArray as jest.Mock).mockImplementation((arr) => arr);
    Object.defineProperty(screen, 'orientation', {
      value: { lock: jest.fn().mockResolvedValue(undefined), unlock: jest.fn() },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  const renderWithDeck = async (carousel: boolean) => {
    const deck = Object.fromEntries([...CARDS, ...DILEMMAS].map((c) => [c.collectorsinfo, { count: 1, row: c }]));
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    if (carousel) localStorage.setItem(PILE_CAROUSEL_KEY, JSON.stringify(true));
    (extractDrawDeck as jest.Mock).mockReturnValue(CARDS);
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await drawOpeningHand();
  };

  it('opens the grid panel while the setting is off', async () => {
    await renderWithDeck(false);
    await openSearch();
    expect(screen.queryByTestId('pile-carousel')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-list-panel-drawDeck')).toBeInTheDocument();
    // #1937: the pile shows no count on the table, so the panel's title states the pile's size.
    expect(screen.getByRole('heading', { name: 'Draw deck · 8 cards' })).toBeInTheDocument();
  });

  it('turns the setting on from the game menu', async () => {
    await renderWithDeck(false);
    const menuButton = screen.getByRole('button', { name: 'Game menu' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') await tap(menuButton);
    await tap(screen.getByTestId('game-menu-settings-item'));
    const toggle = screen.getByTestId('game-menu-pile-carousel');
    expect(toggle).toHaveTextContent('Search piles in a carousel: Off');
    await tap(toggle);
    expect(toggle).toHaveTextContent('Search piles in a carousel: On');
    expect(localStorage.getItem(PILE_CAROUSEL_KEY)).toBe('true');
  });

  it('opens the carousel on the top card, titled "Search draw deck"', async () => {
    await renderWithDeck(true);
    await openSearch();
    expect(screen.getByTestId('pile-carousel')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Search draw deck · 8 cards' })).toBeInTheDocument();
    expect(screen.getByTestId('card-list-panel-drawDeck')).toBeInTheDocument();
    expect(position()).toBe('1 of 8');
    expect(middleName()).toBe('Personnel 8');
  });

  it('puts the count and actions above the carousel, and the slider right under it', async () => {
    await renderWithDeck(true);
    await openSearch();
    const actions = screen.getByTestId('pile-carousel-actions');
    const stage = screen.getByTestId('card-list-panel-drawDeck');
    const bottom = screen.getByTestId('pile-carousel-bottom');
    expect(actions.nextElementSibling).toBe(stage);
    expect(stage.nextElementSibling).toBe(bottom);
    expect(actions).toContainElement(screen.getByTestId('pile-carousel-count'));
    expect(actions).toContainElement(screen.getByRole('button', { name: 'Download' }));
    expect(bottom).toContainElement(screen.getByTestId('pile-carousel-slider'));
  });

  it('hides to show the table and comes back to the same search, selection and place kept', async () => {
    await renderWithDeck(true);
    await openSearch();
    await slideTo(2);
    await tap(middleCard());
    await tap(screen.getByTestId('pile-carousel-hide'));
    expect(screen.getByTestId('pile-carousel')).toHaveAttribute('data-peeking', 'true');
    const show = screen.getByTestId('pile-carousel-show');
    expect(show).toHaveTextContent('Back to search draw deck · 1 selected');
    await tap(show);
    expect(screen.getByTestId('pile-carousel')).not.toHaveAttribute('data-peeking');
    expect(screen.queryByTestId('pile-carousel-show')).not.toBeInTheDocument();
    expect(position()).toBe('3 of 8');
    expect(screen.getByTestId('pile-carousel-count')).toHaveTextContent('1 selected');
  });

  it('comes back from hidden on Escape, and only a second Escape closes the search', async () => {
    await renderWithDeck(true);
    await openSearch();
    await tap(screen.getByTestId('pile-carousel-hide'));
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.getByTestId('pile-carousel')).not.toHaveAttribute('data-peeking');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByTestId('pile-carousel')).not.toBeInTheDocument();
  });

  it('moves with a tap on a side card, the arrows and the slider', async () => {
    await renderWithDeck(true);
    await openSearch();
    const side = screen.getByRole('button', { name: 'Show Personnel 9' });
    await tap(side);
    expect(middleName()).toBe('Personnel 9');
    await tap(screen.getByRole('button', { name: 'Next card' }));
    expect(middleName()).toBe('Personnel 10');
    await tap(screen.getByRole('button', { name: 'Previous card' }));
    expect(middleName()).toBe('Personnel 9');
    await slideTo(7);
    expect(middleName()).toBe('Personnel 15');
    expect(position()).toBe('8 of 8');
  });

  it('gives only the middle card a card id, so only it drags out', async () => {
    await renderWithDeck(true);
    await openSearch();
    const ids = Array.from(
      document.querySelectorAll('[data-testid="card-list-panel-drawDeck"] [data-card-id]')
    ).map((el) => el.getAttribute('aria-label'));
    expect(ids).toEqual(['Select Personnel 8']);
  });

  it('selects more than one card, marks each on the slider, and clears them', async () => {
    await renderWithDeck(true);
    await openSearch();
    await tap(middleCard());
    await slideTo(3);
    await tap(middleCard());
    expect(screen.getByTestId('pile-carousel-count')).toHaveTextContent('2 selected');
    expect(screen.getAllByTestId('pile-carousel-tick')).toHaveLength(2);
    expect(middleCard()).toHaveAttribute('aria-pressed', 'true');
    await tap(screen.getByTestId('pile-carousel-clear'));
    expect(screen.getByTestId('pile-carousel-count')).toHaveTextContent('0 selected');
    expect(screen.queryAllByTestId('pile-carousel-tick')).toHaveLength(0);
    expect(screen.getByTestId('pile-carousel-clear')).toBeDisabled();
  });

  it('disables every action while nothing is selected', async () => {
    await renderWithDeck(true);
    await openSearch();
    for (const name of ['Download', 'Discard']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /to the top of the draw deck/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /to the bottom of the draw deck/ })).toBeDisabled();
  });

  it('sends the selected cards to the bottom, and keeps the carousel open', async () => {
    await renderWithDeck(true);
    await openSearch();
    await tap(middleCard());
    await tap(screen.getByRole('button', { name: 'Selected cards to the bottom of the draw deck' }));
    expect(screen.getByTestId('pile-carousel')).toBeInTheDocument();
    expect(middleName()).toBe('Personnel 9');
    await slideTo(7);
    expect(middleName()).toBe('Personnel 8');
  });

  it('sends the selected cards to the top in pile order', async () => {
    await renderWithDeck(true);
    await openSearch();
    await slideTo(6);
    await tap(middleCard());
    await slideTo(4);
    await tap(middleCard());
    await tap(screen.getByRole('button', { name: 'Selected cards to the top of the draw deck' }));
    await slideTo(0);
    expect(middleName()).toBe('Personnel 12');
    await slideTo(1);
    expect(middleName()).toBe('Personnel 14');
  });

  it('downloads the selected cards into the hand and closes', async () => {
    await renderWithDeck(true);
    await openSearch();
    await tap(middleCard());
    await tap(screen.getByRole('button', { name: 'Download' }));
    expect(screen.queryByTestId('pile-carousel')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^hand, 8 cards, tap to open$/i })).toBeInTheDocument();
  });

  it('discards the selected cards', async () => {
    await renderWithDeck(true);
    await openSearch();
    await tap(middleCard());
    await tap(screen.getByRole('button', { name: 'Discard' }));
    expect(position()).toBe('1 of 7');
    expect(middleName()).toBe('Personnel 9');
  });

  it('closes on Escape, and shows its help behind the ?', async () => {
    await renderWithDeck(true);
    await openSearch();
    await tap(screen.getByTestId('pile-carousel-help'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/middle card to select it/);
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByTestId('pile-carousel')).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByTestId('pile-carousel')).not.toBeInTheDocument();
  });

  it('searches the dilemma pile with Discard, Top, Bottom and Shuffle, and no Download off the dilemma choice (#1900)', async () => {
    await renderWithDeck(true);
    await tap(screen.getByRole('button', { name: /^download from the dilemma pile$/i }));
    expect(screen.getByTestId('pile-carousel')).toHaveAttribute('data-pile', 'dilemmaPile');
    expect(screen.getByRole('heading', { name: 'Search dilemma pile · 4 cards' })).toBeInTheDocument();
    expect(screen.getByTestId('card-list-panel-dilemmaPile')).toBeInTheDocument();
    expect(position()).toBe('1 of 4');
    expect(middleName()).toBe('Dilemma 1');
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(within(screen.getByTestId('pile-carousel')).getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();
    await tap(middleCard());
    await tap(screen.getByRole('button', { name: 'Selected cards to the bottom of the dilemma pile' }));
    expect(middleName()).toBe('Dilemma 2');
    await slideTo(3);
    expect(middleName()).toBe('Dilemma 1');
  });

  it('searches the discard pile newest first, with Remove from game and no Shuffle (#1901)', async () => {
    await renderWithDeck(true);
    await openSearch();
    for (let n = 0; n < 3; n += 1) {
      await tap(middleCard());
      await tap(screen.getByRole('button', { name: 'Discard' }));
    }
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByTestId('pile-carousel')).not.toBeInTheDocument();
    await tap(screen.getByAltText('Discard pile').parentElement!);
    expect(screen.getByTestId('pile-carousel')).toHaveAttribute('data-pile', 'discard');
    expect(screen.getByRole('heading', { name: 'Search discard pile · 3 cards' })).toBeInTheDocument();
    expect(screen.getByTestId('card-list-panel-discard')).toBeInTheDocument();
    expect(position()).toBe('1 of 3');
    expect(middleName()).toBe('Personnel 10');
    expect(screen.getByText('Newest')).toBeInTheDocument();
    expect(screen.getByText('Oldest')).toBeInTheDocument();
    const carousel = within(screen.getByTestId('pile-carousel'));
    for (const name of ['Shuffle', 'Download', 'Discard']) {
      expect(carousel.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(carousel.queryByRole('button', { name: /to the top of/ })).not.toBeInTheDocument();
    const remove = screen.getByTestId('remove-from-game-button');
    expect(remove).toHaveTextContent('Remove from game');
    expect(remove).toBeDisabled();
    await tap(middleCard());
    await tap(remove);
    expect(screen.getByTestId('remove-from-game-button')).toHaveTextContent('Return to game');
    await tap(screen.getByTestId('remove-from-game-button'));
    expect(screen.getByTestId('remove-from-game-button')).toHaveTextContent('Remove from game');
  });
});

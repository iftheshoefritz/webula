jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// One stable array: a fresh `data` each render would rerun the page's deck load forever.
const mockData: unknown[] = [];
jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: () => ({ data: mockData, loading: false }),
}));

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  shuffleArray: jest.fn((arr) => arr),
}));

jest.mock('react-icons/fa', () => ({
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
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import { CHARGE_CHIP_MS } from '../../../app/decks/practice/TurnCounters';

const row = (collectorsinfo: string, originalName: string, type: string) => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  imagefile: collectorsinfo,
});

// Ten draw deck cards, so the draw deck still holds three after the opening hand of seven (#1736).
// The personnel cost 2.
const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 10, row: { ...row('1P001', 'Test Personnel', 'personnel'), cost: '2' } },
};

describe('the counter of the turn\'s counters (#1607)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });
  afterEach(() => jest.useRealTimers());

  const draw = async () => {
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /draw deck top, tap to draw/i })[0]);
    });
  };

  // A new game shows "Draw 7" in place of the turn controls until the opening hand is drawn (#1736).
  const drawOpeningHand = async () => {
    await act(async () => {
      fireEvent.click(screen.getByTestId('draw-opening-hand'));
    });
  };

  const switchOn = async () => {
    const menuButton = screen.getByRole('button', { name: 'Game menu' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
    fireEvent.click(screen.getByTestId('game-menu-settings-item'));
    const toggle = screen.getByTestId('game-menu-turn-counters');
    expect(toggle).toHaveTextContent('Counters: Off');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveTextContent('Counters: On');
    fireEvent.click(menuButton);
  };

  it('shows "Apply card text to attributes" after Counters, off by default, and keeps a change (#1668)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const menuButton = screen.getByRole('button', { name: 'Game menu' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
    fireEvent.click(screen.getByTestId('game-menu-settings-item'));
    const counters = screen.getByTestId('game-menu-turn-counters');
    const toggle = screen.getByTestId('game-menu-card-text-attributes');
    expect(counters.nextElementSibling).toBe(toggle);
    expect(toggle).toHaveTextContent('Apply card text to attributes: Off');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveTextContent('Apply card text to attributes: On');
    expect(localStorage.getItem('practice-card-text-attributes')).toBe('true');
  });

  it('shows "Resolve events in a panel" after "Apply card text to attributes", off by default, and keeps it on a reload (#1727)', async () => {
    const openSettings = () => {
      const menuButton = screen.getByRole('button', { name: 'Game menu' });
      if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
      fireEvent.click(screen.getByTestId('game-menu-settings-item'));
      return screen.getByTestId('game-menu-resolve-events');
    };
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<PracticeDrawPage />);
    });
    const toggle = openSettings();
    expect(screen.getByTestId('game-menu-card-text-attributes').nextElementSibling).toBe(toggle);
    expect(toggle).toHaveTextContent('Resolve events in a panel: Off');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveTextContent('Resolve events in a panel: On');
    expect(localStorage.getItem('practice-resolve-events')).toBe('true');
    view.unmount();
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(openSettings()).toHaveTextContent('Resolve events in a panel: On');
  });

  it('shows no counter, chip or list while the setting is off, its default', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await draw();
    expect(screen.queryByTestId('turn-counters')).toBeNull();
    expect(screen.queryByTestId('charge-chip')).toBeNull();
    expect(screen.queryByTestId('turn-counters-list')).toBeNull();
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', expect.stringContaining('(cost 1)'));
  });

  it('counts a draw, shows its chip, corrects it, and an undo takes the correction back', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await switchOn();
    await drawOpeningHand();
    expect(localStorage.getItem('practice-turn-counters')).toBe('true');
    const counter = screen.getByTestId('turn-counters');
    expect(counter).toHaveTextContent('0/7');
    expect(within(screen.getByTestId('turn-score-column')).getByTestId('turn-counters')).toBe(counter);

    await draw();
    expect(counter).toHaveTextContent('1/7');
    const chip = screen.getByTestId('charge-chip');
    expect(chip).toHaveTextContent('Draw 1');

    await act(async () => {
      fireEvent.click(within(chip).getByTestId('charge-free'));
    });
    expect(counter).toHaveTextContent('0/7');
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', 'Undo: Charged a draw 0 counters (was 1)');

    await act(async () => {
      fireEvent.click(screen.getByTestId('undo-button'));
    });
    expect(counter).toHaveTextContent('1/7');
    expect(screen.queryByTestId('charge-chip')).toBeNull();
  });

  it('shows the counter on a row of its own in play and draw only, and none in orders or discard (#1679, #1790)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await switchOn();
    await drawOpeningHand();
    const column = screen.getByTestId('turn-score-column');
    const counterRow = within(column).getByTestId('turn-counters-row');
    expect(counterRow).toHaveTextContent('0/7');
    expect(within(column).getByTestId('turn-segment-list')).not.toContainElement(screen.getByTestId('turn-counters'));
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Play');
    const next = within(column).getByRole('button', { name: 'Go to orders' });
    expect(next).not.toContainElement(screen.getByTestId('turn-counters'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('turn-counters'));
    });
    expect(screen.getByTestId('turn-counters-list')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(next);
    });
    expect(within(column).getByTestId('turn-segment')).toHaveTextContent('Orders');
    // The row stays, empty, so the score does not move.
    expect(within(column).getByTestId('turn-counters-row')).toBe(counterRow);
    expect(counterRow).toBeEmptyDOMElement();
    expect(screen.queryByTestId('turn-counters')).toBeNull();
    expect(screen.queryByTestId('turn-counters-list')).toBeNull();
    await act(async () => {
      fireEvent.click(next);
    });
    expect(counterRow).toHaveTextContent('0/7');
  });

  it('draws the opening hand of 7 at no cost, and shows the turn controls after it (#1736)', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await switchOn();
    const column = screen.getByTestId('turn-score-column');
    expect(within(column).queryByTestId('turn-counters')).toBeNull();
    await drawOpeningHand();
    expect(screen.getByRole('button', { name: /^hand, 7 cards, tap to open$/i })).toBeInTheDocument();
    expect(within(column).getByTestId('turn-counters')).toHaveTextContent('0/7');
    expect(screen.queryByTestId('charge-chip')).toBeNull();
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', 'Undo: Drew the opening hand (7 cards)');
  });

  it('removes the chip by itself', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await switchOn();
    await draw();
    expect(screen.getByTestId('charge-chip')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(CHARGE_CHIP_MS);
    });
    expect(screen.queryByTestId('charge-chip')).toBeNull();
  });

  it('opens the list on a tap of the counter, with the limit, and Escape closes it', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    await switchOn();
    await drawOpeningHand();
    await draw();
    await draw();
    await act(async () => {
      fireEvent.click(screen.getByTestId('turn-counters'));
    });
    const list = screen.getByTestId('turn-counters-list');
    expect(within(list).getAllByTestId('charge-row')).toHaveLength(2);
    await act(async () => {
      fireEvent.click(within(list).getAllByTestId('charge-plus')[0]);
    });
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('3/7');
    await act(async () => {
      fireEvent.click(within(list).getByTestId('turn-counters-limit-plus'));
    });
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('3/8');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByTestId('turn-counters-list')).toBeNull();
  });
});

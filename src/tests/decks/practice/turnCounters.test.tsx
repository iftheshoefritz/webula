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

// Eight draw deck cards, so the draw deck still holds one after seven opening draws.
// The personnel cost 2.
const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 8, row: { ...row('1P001', 'Test Personnel', 'personnel'), cost: '2' } },
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

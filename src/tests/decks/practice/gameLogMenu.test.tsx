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
import { EMPTY_LOG_TEXT } from '../../../app/decks/practice/gameLog';

const row = (collectorsinfo: string, originalName: string, type: string) => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  imagefile: collectorsinfo,
});

// Eight draw deck cards, so the draw deck still holds one after the opening hand of seven.
const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 8, row: row('1P001', 'Test Personnel', 'personnel') },
};

describe('the Game log item of the game menu (#1065)', () => {
  const writeText = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
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

  const openMenu = () => {
    const menuButton = screen.getByRole('button', { name: 'Game menu' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
    return screen.getByTestId('game-menu-splash');
  };

  it('is the last item of the game menu, and opens an empty log on a new game', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const items = within(openMenu()).getAllByRole('button');
    expect(items[items.length - 1]).toHaveTextContent('Game log');

    fireEvent.click(items[items.length - 1]);
    expect(screen.queryByTestId('game-menu-splash')).not.toBeInTheDocument();
    const panel = screen.getByRole('dialog', { name: 'Game log' });
    expect(within(panel).getByText(EMPTY_LOG_TEXT)).toBeInTheDocument();
  });

  it('shows a draw under Turn 1, and Copy writes the log grouped by turn', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw deck top, tap to draw' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));

    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Game log' }));
    const panel = await screen.findByRole('dialog', { name: 'Game log' });
    expect(within(within(panel).getByTestId('game-log-turn-1')).getByText('Drew a card from the draw deck into the hand')).toBeInTheDocument();
    expect(within(within(panel).getByTestId('game-log-turn-2')).getByText('Started turn 2')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith(
      'Turn 1\n- Drew a card from the draw deck into the hand\n\nTurn 2\n- Started turn 2'
    );
    expect(within(panel).getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});

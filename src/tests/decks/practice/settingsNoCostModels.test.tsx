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
import { render, screen, act, fireEvent } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';

// The Settings view of the game menu shows no count of cost models (#1818; it did from #1697), on
// invented cards and Goran, a title of the registry.

const row = (collectorsinfo: string, originalName: string, type: string, gametext = '') => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  gametext: gametext.toLowerCase(),
  imagefile: collectorsinfo,
});

const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma', 'Its cost -1.') },
  '1P001': { count: 3, row: row('1P001', 'Test Pilot', 'personnel', 'She is cost -1.') },
  '1P002': { count: 1, row: row('1P002', 'Goran', 'personnel', 'Order - Draw a card.') },
  '1P003': { count: 4, row: row('1P003', 'Test Plain', 'personnel', 'Order - Draw a card.') },
};

describe('the Settings view of the game menu (#1818)', () => {
  beforeEach(() => {
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

  const openSettings = () => {
    const menuButton = screen.getByRole('button', { name: 'Game menu' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
    fireEvent.click(screen.getByTestId('game-menu-settings-item'));
  };

  it('shows no cost model count, with Counters off and on', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    openSettings();
    expect(screen.queryByTestId('cost-model-coverage')).toBeNull();
    expect(screen.getByTestId('game-menu-settings')).not.toHaveTextContent('Cost models');
    await act(async () => {
      fireEvent.click(screen.getByTestId('game-menu-turn-counters'));
    });
    expect(screen.getByTestId('game-menu-turn-counters')).toHaveTextContent('Counters: On');
    expect(screen.queryByTestId('cost-model-coverage')).toBeNull();
    expect(screen.getByTestId('game-menu-settings')).not.toHaveTextContent('Cost models');
    expect(screen.getByTestId('game-menu-turn-counters').nextElementSibling).toBe(
      screen.getByTestId('game-menu-card-text-attributes')
    );
  });
});

let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParams,
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
import PracticeDrawPage from '../../../app/decks/practice/page';

const row = (collectorsinfo: string, originalName: string, type: string) => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  imagefile: collectorsinfo,
});

const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 8, row: row('1P001', 'Test Personnel', 'personnel') },
};

describe('the Controls item of the game menu (#1088)', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
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

  it('is an item of the game menu, and opens the Controls panel', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    fireEvent.click(within(screen.getByTestId('game-menu-splash')).getByRole('button', { name: 'Controls' }));
    expect(screen.queryByTestId('game-menu-splash')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Controls' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Controls' })).not.toBeInTheDocument();
  });

  it('opens on load with controls=1, over the table rather than the menu', async () => {
    mockSearchParams = new URLSearchParams('controls=1');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByRole('dialog', { name: 'Controls' })).toBeInTheDocument();
    expect(screen.queryByTestId('game-menu-splash')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close controls' }));
    expect(screen.queryByRole('dialog', { name: 'Controls' })).not.toBeInTheDocument();
  });
});

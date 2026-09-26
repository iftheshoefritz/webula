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
  '1P001': { count: 3, row: row('1P001', 'Test Personnel', 'personnel') },
  '1E001': { count: 1, row: row('1E001', 'Tricorder', 'equipment') },
};

describe('the Decklist item of the game menu (#779)', () => {
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

  // The game menu opens on every load of the table (#781), so the menu button is a toggle: click
  // it only when the menu is closed.
  const openDecklist = () => {
    const menuButton = screen.getByRole('button', { name: 'Game menu' });
    if (menuButton.getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(menuButton);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Decklist' }));
  };

  it('lists the loaded deck grouped by pile, with a count per card', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    openDecklist();

    const panel = screen.getByRole('dialog', { name: 'Decklist' });
    const mission = within(panel).getByTestId('decklist-mission');
    const dilemma = within(panel).getByTestId('decklist-dilemma');
    const draw = within(panel).getByTestId('decklist-draw');

    expect(within(mission).getByText('Test Mission')).toBeInTheDocument();
    expect(within(mission).getByText('×1')).toBeInTheDocument();
    expect(within(dilemma).getByText('Test Dilemma')).toBeInTheDocument();
    expect(within(dilemma).getByText('×2')).toBeInTheDocument();
    expect(within(draw).getByText('Test Personnel')).toBeInTheDocument();
    expect(within(draw).getByText('×3')).toBeInTheDocument();
    expect(within(draw).getByText('Tricorder')).toBeInTheDocument();
    expect(within(draw).queryByText('Test Mission')).not.toBeInTheDocument();
    // The menu closes when the panel opens.
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  });

  it('does nothing on a tap on a card, and closes on a tap outside', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    // The game menu is open on load (#781), and opening the Decklist closes it. So settle the
    // menu first, and only then snapshot the table, or the snapshot holds the open menu.
    openDecklist();
    fireEvent.click(screen.getByRole('button', { name: 'Close decklist' }));
    const pileBefore = screen.getByTestId('practice-game-layer').innerHTML;

    openDecklist();

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Decklist' })).getByText('Test Personnel'));
    expect(screen.getByRole('dialog', { name: 'Decklist' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close decklist' }));
    expect(screen.queryByRole('dialog', { name: 'Decklist' })).not.toBeInTheDocument();
    expect(screen.getByTestId('practice-game-layer').innerHTML).toBe(pileBefore);
  });

  it('keeps Reset in the same menu', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    // The menu is open on load (#781), so both items are there with no click.
    expect(screen.getByRole('button', { name: 'Game menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Decklist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });
});

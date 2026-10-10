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
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';

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

describe('the turn counter above the draw deck (#1079)', () => {
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

  it('sits in the draw deck column, with the draw pile, and not in the hand column', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const drawColumn = screen.getByTestId('draw-deck-column');
    expect(within(drawColumn).getByTestId('turn-counter')).toBeInTheDocument();
    expect(within(drawColumn).getByRole('button', { name: 'Next turn' })).toBeInTheDocument();
    expect(within(drawColumn).getByTestId('draw-pile')).toBeInTheDocument();
    // The pile controls stay beside the column, not inside it.
    expect(within(drawColumn).queryByTestId('pile-controls')).not.toBeInTheDocument();

    const handColumn = screen.getByTestId('hand-column');
    expect(within(handColumn).queryByTestId('turn-counter')).not.toBeInTheDocument();
    expect(within(handColumn).queryByRole('button', { name: 'Next turn' })).not.toBeInTheDocument();
  });

  it('still raises the turn by one on Next turn', async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(screen.getByTestId('turn-counter')).toHaveTextContent('Turn 2');
  });
});

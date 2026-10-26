// Issue #1307: the page state that View full table and the dilemma stack's panel keep resets when the
// attempt ends or the attempt layout goes away, during render rather than in an effect.
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

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck } from '../../../app/decks/deckBuilderUtils';

// The deck of the attempt fixture: Bilana System, slot 2, is a space mission with the crewed ship.
const mockAttemptDeck = () => {
  const row = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
    collectorsinfo: id,
    originalName: `Card ${id}`,
    name: `card ${id}`,
    imagefile: `card_${id}`,
    type,
    pile: type === 'mission' ? 'mission' : type === 'dilemma' ? 'dilemmaPile' : 'drawDeck',
    count: 1,
    ...extra,
  });
  const rows = [
    ...['p', 'p', 's', 'h', 'p'].map((t, i) => row(`M${i}`, 'mission', { missiontype: t })),
    ...Array.from({ length: 20 }, (_, i) => row(`P${i}`, 'personnel', { skills: 'Science' })),
    row('S0', 'ship'),
    ...Array.from({ length: 6 }, (_, i) => row(`E${i}`, 'event')),
    ...Array.from({ length: 10 }, (_, i) => row(`K${i}`, 'equipment')),
    ...Array.from({ length: 10 }, (_, i) => row(`D${i}`, 'dilemma')),
  ];
  (deckFromTsv as jest.Mock).mockReturnValue(Object.fromEntries(rows.map((r) => [r.collectorsinfo, { count: 1, row: r }])));
  (extractDrawDeck as jest.Mock).mockImplementation((deck) =>
    Object.values(deck)
      .map((entry) => (entry as { row: { pile: string } }).row)
      .filter((r) => r.pile === 'drawDeck'),
  );
};

const renderFixture = async (fixture: string) => {
  mockAttemptDeck();
  mockSearchParamsValue = new URLSearchParams(`fixture=${fixture}&reset=1&menu=0`);
  await act(async () => {
    render(<PracticeDrawPage />);
  });
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

// Taps the crewed ship at Bilana System, then Attempt and Start with the defaults.
const startAttempt = async () => {
  await click(screen.getByRole('button', { name: 'Card S0' }));
  await click(screen.getByTestId('attempt-button'));
  await click(screen.getByTestId('attempt-start'));
};

beforeEach(() => {
  localStorage.clear();
  (getSession as jest.Mock).mockResolvedValue(null);
  (useDataFetching as jest.Mock).mockReturnValue({ data: [{ collectorsinfo: 'x' }], loading: false });
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

describe('the view of an attempt (#1307)', () => {
  it('opens a new attempt at the same mission and ship in the attempt layout, after the last one ended on the full table', async () => {
    await renderFixture('piles');
    await startAttempt();
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();

    await click(screen.getByTestId('attempt-view-full-table'));
    expect(screen.queryByTestId('attempt-layout')).toBeNull();
    // The undo takes back Start, so the attempt ends while the full table shows.
    await click(screen.getByTestId('undo-button'));
    expect(screen.queryByTestId('attempt-back-to-attempt')).toBeNull();

    await startAttempt();
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
  });

  it('keeps the panel of the dilemma stack closed after View full table and Back to attempt', async () => {
    await renderFixture('attempt');
    await click(screen.getAllByRole('button', { name: /^Dilemma stack, 4 cards/ })[0]);
    expect(screen.getByTestId('card-list-panel-dilemmaStack')).toBeInTheDocument();

    await click(screen.getByTestId('attempt-view-full-table'));
    expect(screen.queryByTestId('card-list-panel-dilemmaStack')).toBeNull();
    await click(screen.getByTestId('attempt-back-to-attempt'));
    expect(screen.getByTestId('attempt-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('card-list-panel-dilemmaStack')).toBeNull();
  });
});

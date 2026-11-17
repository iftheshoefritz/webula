// `?fixture=resolving` (#1728): the modal resolving panel, its View table toggle, and the hold on the turn.
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

// The rows are read by hand, normalised as `parseCardData` does: Jest does not load the real d3.
// One stable array: a fresh `data` each render would rerun the page's deck load forever.
const mockData: any[] = (() => {
  const { readFileSync } = jest.requireActual('fs');
  const { join } = jest.requireActual('path');
  const [head, ...rows] = (readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8') as string)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '')));
  return rows.map((r) => {
    const row: any = Object.fromEntries(head.map((h, i) => [h.toLowerCase(), (r[i] ?? '').toLowerCase()]));
    row.collectorsinfo = row.collectorsinfo.replace(/(^|[^0-9])0+(\d+)/g, '$1$2');
    row.originalName = r[head.indexOf('Name')];
    row.missiontype = row.type === 'mission' ? row.mission : '';
    return row;
  });
})();
jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: () => ({ data: mockData, loading: false }),
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue(null),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';

const saved = () => JSON.parse(localStorage.getItem('practiceGame:fixture=resolving')!);
const nameOf = (key: string) => saved().dealtDeck[key].row.originalName;
const nextTurnButton = () => screen.getByTestId('turn-counter').closest('button')!;

describe('?fixture=resolving (#1728)', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('practice-turn-counters', 'true');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    mockSearchParamsValue = new URLSearchParams('fixture=resolving&reset=1&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
  });

  it('deals These Are The Voyages resolving, charged 1, in the panel with its three buttons', () => {
    expect(nameOf(saved().table.resolving.key)).toBe('These Are The Voyages');
    expect(screen.getByTestId('resolving-panel')).toBeInTheDocument();
    expect(screen.getByTestId('resolving-discard')).toHaveTextContent('Resolved → Discard');
    expect(screen.getByTestId('resolving-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('resolving-view-table')).toBeInTheDocument();
    const card = screen.getByTestId('resolving-card');
    expect(card).toHaveAttribute('data-zone', 'resolving');
    expect(card.querySelector('[data-card-id]')).toHaveAttribute('data-card-id', saved().table.resolving.id);
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('1/7');
  });

  it('holds the next-turn button while the event resolves, and says why', () => {
    expect(nextTurnButton()).toBeDisabled();
    expect(nextTurnButton()).toHaveAttribute('aria-label', 'Resolve These Are The Voyages first');
    expect(nextTurnButton()).toHaveAttribute('title', 'Resolve These Are The Voyages first');
  });

  it('discards with Resolved → Discard, and one undo brings the panel back', () => {
    const id = saved().table.resolving.id;
    fireEvent.click(screen.getByTestId('resolving-discard'));
    expect(screen.queryByTestId('resolving-panel')).toBeNull();
    expect(saved().table.resolving).toBeNull();
    expect(saved().table.discard.map((c: any) => c.id)).toEqual([id]);
    expect(nextTurnButton()).not.toBeDisabled();
    expect(nextTurnButton()).toHaveAttribute('aria-label', 'Go to orders');
    fireEvent.click(screen.getByTestId('undo-button'));
    expect(screen.getByTestId('resolving-panel')).toBeInTheDocument();
    expect(saved().table.resolving.id).toBe(id);
  });

  it('cancels back to the end of the hand with 0 spent, and one undo puts it back charged', () => {
    const id = saved().table.resolving.id;
    fireEvent.click(screen.getByTestId('resolving-cancel'));
    expect(screen.queryByTestId('resolving-panel')).toBeNull();
    const hand = saved().table.hand;
    expect(hand[hand.length - 1].id).toBe(id);
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('0/7');
    expect(screen.getByTestId('undo-button')).toHaveAttribute('aria-label', 'Undo: Cancelled playing These Are The Voyages');
    expect(nextTurnButton()).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('undo-button'));
    expect(screen.getByTestId('resolving-panel')).toBeInTheDocument();
    expect(screen.getByTestId('turn-counters')).toHaveTextContent('1/7');
  });

  it('collapses to the small card with View table and with Escape, and a tap on it brings the panel back', () => {
    fireEvent.click(screen.getByTestId('resolving-view-table'));
    expect(screen.queryByTestId('resolving-panel')).toBeNull();
    const mini = screen.getByTestId('resolving-mini');
    expect(mini).toHaveAttribute('data-zone', 'resolving');
    fireEvent.click(mini.querySelector('button')!);
    expect(screen.getByTestId('resolving-panel')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('resolving-panel')).toBeNull();
    expect(screen.getByTestId('resolving-mini')).toBeInTheDocument();
    expect(saved().table.resolving).not.toBeNull();
    expect(nextTurnButton()).toBeDisabled();
  });
});

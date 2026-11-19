// `?fixture=costs` (#1654) ends its hand with These Are The Voyages and At What Cost? (#1727), whose ids
// come after every other card's, so every card of the fixture before #1727 keeps its id, and then with
// Ferengi Tradition (#1730), the last id of all.
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
import { render, act } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';

const idNumber = (id: string) => Number(id.replace('card-', ''));

// Every card instance of a saved table, with its id and its deck key.
const savedCards = (table: any): { id: string; key: string }[] => {
  const all: { id: string; key: string }[] = [];
  const visit = (c: any) => {
    all.push({ id: c.id, key: c.key });
    (c.crew ?? []).forEach(visit);
    (c.placedOn ?? []).forEach(visit);
  };
  for (const [field, value] of Object.entries(table)) {
    if (field === 'missions') {
      for (const slot of value as any[]) {
        if (slot.mission) visit(slot.mission);
        [...slot.ships, ...slot.awayTeam, ...slot.underMission].forEach(visit);
      }
    } else if (Array.isArray(value)) value.forEach(visit);
  }
  return all;
};

describe('?fixture=costs (#1727)', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('deals These Are The Voyages, At What Cost?, Ferengi Tradition, the two Galors and Days of Atonement at the end of the hand, with the last ids', async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=costs&reset=1&menu=0');
    await act(async () => {
      render(<PracticeDrawPage />);
    });
    const saved = JSON.parse(localStorage.getItem('practiceGame:fixture=costs')!);
    const nameOf = (key: string) => saved.dealtDeck[key].row.originalName;
    const hand: { id: string; key: string }[] = saved.table.hand;
    expect(hand.slice(-6).map((c) => nameOf(c.key))).toEqual([
      'These Are The Voyages',
      'At What Cost?',
      'Ferengi Tradition',
      'Alliance Galor',
      'Type III Galor',
      'Days of Atonement',
    ]);
    // The cards before #1727 end with the crew's Annexation Drone and the core's Delivery Boy, and the
    // six later cards come right after them, the Galors of #1744 and Days of Atonement of #1745 last.
    const cards = savedCards(saved.table);
    const numbers = cards.map((c) => idNumber(c.id)).sort((a, b) => a - b);
    const last = numbers[numbers.length - 1];
    expect(hand.slice(-6).map((c) => idNumber(c.id))).toEqual([last - 5, last - 4, last - 3, last - 2, last - 1, last]);
    const byNumber = new Map(cards.map((c) => [idNumber(c.id), nameOf(c.key)]));
    expect(byNumber.get(last - 6)).toBe('Delivery Boy');
    expect(byNumber.get(last - 7)).toBe('Annexation Drone');
    expect(saved.table.resolving).toBeNull();
  });
});

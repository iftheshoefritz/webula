// ── Mocks (must precede imports) ────────────────────────────────────────────

jest.mock('posthog-js', () => ({ capture: jest.fn(), identify: jest.fn(), init: jest.fn() }));

let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn().mockResolvedValue(null),
  signIn: jest.fn(),
}));

jest.mock('react-icons/fa', () =>
  new Proxy({}, { get: () => () => null })
);

jest.mock('react-tooltip', () => ({ Tooltip: () => null }));

jest.mock('../../hooks/useFilterData', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue([]),
}));

// Mock heavy leaf components
jest.mock('../../components/SearchResults', () => () => null);
jest.mock('../../components/SearchBar', () => () => null);
jest.mock('../../components/SearchPills', () => () => null);
jest.mock('../../components/DeckListPile', () => () => null);
jest.mock('../../components/DeckUploader', () => () => null);
jest.mock('../../components/DrivePickerModal', () => ({ DrivePickerModal: () => null }));
jest.mock('../../components/Help', () => () => null);
jest.mock('../../components/SkillsChart', () => () => null);
jest.mock('../../components/PileAggregateCostChart', () => () => null);
jest.mock('../../components/IconPill', () => () => null);

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeMission = (collectorsinfo: string, name: string) => ({
  collectorsinfo,
  originalName: name,
  type: 'mission',
  name,
  pile: 'mission',
  icons: '',
  keywords: '',
  count: 1,
  skills: '',
  cost: 0,
  imagefile: `mission_${collectorsinfo}`,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Mission carousel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('wraps from last mission back to first when clicking Next', async () => {
    const m1 = makeMission('1U001', 'Mission Alpha');
    const m2 = makeMission('1U002', 'Mission Beta');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 1, row: m1 },
        '1U002': { count: 1, row: m2 },
      })
    );

    await act(async () => {
      render(<DeckBuilderClient data={[m1, m2] as any} columns={[]} />);
    });

    // Initially showing first mission (1/2)
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    // Advance to the last mission
    fireEvent.click(screen.getByRole('button', { name: 'Next mission' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    // Click Next again — should wrap to first
    fireEvent.click(screen.getByRole('button', { name: 'Next mission' }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('wraps from first mission to last when clicking Previous', async () => {
    const m1 = makeMission('1U001', 'Mission Alpha');
    const m2 = makeMission('1U002', 'Mission Beta');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 1, row: m1 },
        '1U002': { count: 1, row: m2 },
      })
    );

    await act(async () => {
      render(<DeckBuilderClient data={[m1, m2] as any} columns={[]} />);
    });

    // Initially at first mission (1/2)
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    // Click Previous — should wrap to last
    fireEvent.click(screen.getByRole('button', { name: 'Previous mission' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});

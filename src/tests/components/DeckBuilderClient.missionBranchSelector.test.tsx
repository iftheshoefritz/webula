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
import { render, act, screen, fireEvent, within } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeMission = (collectorsinfo: string, name: string, skills = '') => ({
  collectorsinfo,
  originalName: name,
  type: 'mission',
  name,
  pile: 'mission',
  icons: '',
  keywords: '',
  count: 1,
  skills,
  cost: 0,
  imagefile: `mission_${collectorsinfo}`,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – MissionBranchSelector integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('renders a MissionBranchSelector for each mission in the deck', async () => {
    const m = makeMission('1U001', 'Mission Alpha', 'Physics, (Diplomacy or Treachery)');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    expect(screen.getAllByTestId('branch-selector-Mission Alpha').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a branch button updates selection state', async () => {
    const m = makeMission('1U001', 'Mission Alpha', 'Physics, (Diplomacy or Treachery)');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    const first = screen.getAllByTestId('branch-selector-Mission Alpha')[0];

    await act(async () => {
      fireEvent.click(within(first).getByRole('button', { name: 'Physics, Diplomacy' }));
    });

    const updated = screen.getAllByTestId('branch-selector-Mission Alpha')[0];
    expect(within(updated).getByRole('button', { name: 'Physics, Diplomacy' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(updated).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });
});

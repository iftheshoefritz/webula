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
import { render, act, screen } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeMission = (collectorsinfo: string, name: string, missiontype: string) => ({
  collectorsinfo,
  originalName: name,
  type: 'mission',
  name,
  pile: 'mission',
  missiontype,
  icons: '',
  keywords: '',
  count: 1,
  skills: '',
  cost: 0,
  imagefile: `mission_${collectorsinfo}`,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Mission sort with undefined missiontype', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('does not crash when a mission card has an undefined missiontype', async () => {
    const m1 = makeMission('1U001', 'Mission Alpha', undefined as any);
    const m2 = makeMission('1U002', 'Mission Beta', 's');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 1, row: m1 },
        '1U002': { count: 1, row: m2 },
      })
    );

    await expect(
      act(async () => {
        render(<DeckBuilderClient data={[m1, m2] as any} columns={[]} />);
      })
    ).resolves.not.toThrow();

    // The missions tab should still render without crashing
    expect(screen.getAllByAltText('Mission Beta').length).toBeGreaterThan(0);
  });

  it('does not crash when a mission card has an empty string missiontype', async () => {
    const m1 = makeMission('1U001', 'Mission Alpha', '');
    const m2 = makeMission('1U002', 'Mission Beta', 's');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 1, row: m1 },
        '1U002': { count: 1, row: m2 },
      })
    );

    await expect(
      act(async () => {
        render(<DeckBuilderClient data={[m1, m2] as any} columns={[]} />);
      })
    ).resolves.not.toThrow();

    expect(screen.getAllByAltText('Mission Beta').length).toBeGreaterThan(0);
  });
});

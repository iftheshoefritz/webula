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
  missiontype: 's',
  icons: '',
  keywords: '',
  count: 1,
  skills: '',
  cost: 0,
  imagefile: `mission_${collectorsinfo}`,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Mission remove button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('shows a remove button for each mission in the desktop grid', async () => {
    const m1 = makeMission('1U001', 'Mission Alpha');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 1, row: m1 },
      })
    );

    await act(async () => {
      render(<DeckBuilderClient data={[m1] as any} columns={[]} />);
    });

    // There are two Remove buttons (desktop + mobile), verify at least one exists
    expect(screen.getAllByRole('button', { name: 'Remove Mission Alpha' }).length).toBeGreaterThan(0);
  });

  it('removes mission from display after clicking the X button', async () => {
    const m1 = makeMission('1U001', 'Mission Alpha');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 1, row: m1 },
      })
    );

    await act(async () => {
      render(<DeckBuilderClient data={[m1] as any} columns={[]} />);
    });

    // Mission images should be present (one for desktop, one for mobile)
    expect(screen.getAllByAltText('Mission Alpha').length).toBeGreaterThan(0);

    // Click the first X button (desktop) to remove the mission
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove Mission Alpha' })[0]);
    });

    // Mission images should no longer be present
    expect(screen.queryAllByAltText('Mission Alpha')).toHaveLength(0);
  });
});

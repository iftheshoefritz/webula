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

const mockUseFilterData = jest.fn().mockReturnValue([]);
jest.mock('../../hooks/useFilterData', () => ({
  __esModule: true,
  default: (...args: any[]) => mockUseFilterData(...args),
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – empty mission slot placeholder buttons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFilterData.mockReturnValue([]);
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('renders an "Any non-HQ" button alongside HQ, Space and Planet', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[] as any} columns={[]} />);
    });

    expect(screen.getAllByRole('button', { name: 'HQ' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Any non-HQ' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Space' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Planet' }).length).toBeGreaterThan(0);
  });

  it('searches for all missions except HQ when "Any non-HQ" is clicked', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[] as any} columns={[]} />);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Any non-HQ' })[0]);

    const lastQuery = mockUseFilterData.mock.calls[mockUseFilterData.mock.calls.length - 1][3];
    expect(lastQuery).toBe('type:mission -missiontype:h');
  });
});

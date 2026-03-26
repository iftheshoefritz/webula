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

// ── Helpers ──────────────────────────────────────────────────────────────────

const makePersonnel = (collectorsinfo: string, keywords: string) => ({
  collectorsinfo,
  originalName: `Person ${collectorsinfo}`,
  type: 'personnel',
  name: `person ${collectorsinfo}`,
  pile: 'draw',
  icons: '',
  keywords,
  count: 1,
  skills: '',
  cost: 0,
  imagefile: `person_${collectorsinfo}`,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Keywords section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFilterData.mockReturnValue([]);
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('splits colon keywords across two lines with lighter suffix', async () => {
    const card = makePersonnel('1U001', 'commander: uss enterprise-d');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({ '1U001': { count: 1, row: card } })
    );
    localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': false, 'Icons': true, 'Costs': true }));

    await act(async () => {
      render(<DeckBuilderClient data={[card] as any} columns={[]} />);
    });

    // The prefix ("commander:") and suffix ("uss enterprise-d") should appear separately
    expect(screen.getByText('commander:')).toBeInTheDocument();
    expect(screen.getByText('uss enterprise-d')).toBeInTheDocument();
  });

  it('renders keywords without colons as a single bold element', async () => {
    const card = makePersonnel('1U002', 'maquis');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({ '1U002': { count: 1, row: card } })
    );
    localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': false, 'Icons': true, 'Costs': true }));

    await act(async () => {
      render(<DeckBuilderClient data={[card] as any} columns={[]} />);
    });

    expect(screen.getByText('maquis')).toBeInTheDocument();
  });

  describe('search button (+ button)', () => {
    it('renders a + button for each keyword', async () => {
      const card = makePersonnel('1U003', 'maquis');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U003': { count: 1, row: card } })
      );
      localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': false, 'Icons': true, 'Costs': true }));

      await act(async () => {
        render(<DeckBuilderClient data={[card] as any} columns={[]} />);
      });

      expect(screen.getByRole('button', { name: /search personnel with keyword maquis/i })).toBeInTheDocument();
    });

    it('fires a personnel keywords search when the + button is clicked (no HQ missions)', async () => {
      const card = makePersonnel('1U004', 'maquis');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U004': { count: 1, row: card } })
      );
      localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': false, 'Icons': true, 'Costs': true }));

      await act(async () => {
        render(<DeckBuilderClient data={[card] as any} columns={[]} />);
      });

      fireEvent.click(screen.getByRole('button', { name: /search personnel with keyword maquis/i }));

      const lastQuery = mockUseFilterData.mock.calls[mockUseFilterData.mock.calls.length - 1][3];
      expect(lastQuery).toBe('type:personnel keywords:"maquis"');
    });
  });
});

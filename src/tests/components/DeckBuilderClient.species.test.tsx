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

const makePersonnel = (collectorsinfo: string, species: string) => ({
  collectorsinfo,
  originalName: `Person ${collectorsinfo}`,
  type: 'personnel',
  name: `person ${collectorsinfo}`,
  pile: 'draw',
  icons: '',
  keywords: '',
  species,
  count: 1,
  skills: '',
  cost: 0,
  imagefile: `person_${collectorsinfo}`,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Species section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFilterData.mockReturnValue([]);
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('splits slash-delimited species into separate badges with correct counts', async () => {
    const card = makePersonnel('1U001', 'alien/human/ikaaran');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({ '1U001': { count: 1, row: card } })
    );
    localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': true, 'Species': false, 'Icons': true, 'Costs': true }));

    await act(async () => {
      render(<DeckBuilderClient data={[card] as any} columns={[]} />);
    });

    expect(screen.getByText('alien')).toBeInTheDocument();
    expect(screen.getByText('human')).toBeInTheDocument();
    expect(screen.getByText('ikaaran')).toBeInTheDocument();
  });

  describe('search button (+ button)', () => {
    it('renders a + button for each species', async () => {
      const card = makePersonnel('1U002', 'vulcan');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U002': { count: 1, row: card } })
      );
      localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': true, 'Species': false, 'Icons': true, 'Costs': true }));

      await act(async () => {
        render(<DeckBuilderClient data={[card] as any} columns={[]} />);
      });

      expect(screen.getByRole('button', { name: /search personnel with species vulcan/i })).toBeInTheDocument();
    });

    it('fires a personnel species search when the + button is clicked (no HQ missions)', async () => {
      const card = makePersonnel('1U003', 'vulcan');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U003': { count: 1, row: card } })
      );
      localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': true, 'Species': false, 'Icons': true, 'Costs': true }));

      await act(async () => {
        render(<DeckBuilderClient data={[card] as any} columns={[]} />);
      });

      fireEvent.click(screen.getByRole('button', { name: /search personnel with species vulcan/i }));

      const lastQuery = mockUseFilterData.mock.calls[mockUseFilterData.mock.calls.length - 1][3];
      expect(lastQuery).toBe('type:personnel species:"vulcan"');
    });
  });
});

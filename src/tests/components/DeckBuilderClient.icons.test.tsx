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

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

// Spy on IconPill so we can assert how many times it's rendered and with what props
const mockIconPill = jest.fn();
jest.mock('../../components/IconPill', () =>
  function MockIconPill(props: { icon: string; count: number; onSearch?: (icon: string, hq: string | null) => void; hqOptions?: any[] }) {
    mockIconPill(props);
    return <div data-testid="icon-pill" data-icon={props.icon} />;
  }
);

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makePersonnel = (collectorsinfo: string, icons: string) => ({
  collectorsinfo,
  originalName: `Person ${collectorsinfo}`,
  type: 'personnel',
  name: `person ${collectorsinfo}`,
  pile: 'draw',
  icons,
  keywords: '',
  count: 1,
  skills: '',
  cost: 0,
  imagefile: `person_${collectorsinfo}`,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Icons section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFilterData.mockReturnValue([]);
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('renders one IconPill per distinct icon across all personnel in the draw pile', async () => {
    const cardA = makePersonnel('1U001', '[Cmd]');
    const cardB = makePersonnel('1U002', '[Stf]');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 1, row: cardA },
        '1U002': { count: 1, row: cardB },
      })
    );
    localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': true, 'Icons': false, 'Costs': true }));

    await act(async () => {
      render(<DeckBuilderClient data={[cardA, cardB] as any} columns={[]} />);
    });

    expect(mockIconPill).toHaveBeenCalledTimes(2);
    const icons = mockIconPill.mock.calls.map(([props]) => props.icon).sort();
    expect(icons).toEqual(['Cmd', 'Stf']);
  });

  it('aggregates the same icon from multiple personnel into one IconPill', async () => {
    const cardA = makePersonnel('1U001', '[Cmd]');
    const cardB = makePersonnel('1U002', '[Cmd]');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 2, row: { ...cardA, count: 2 } },
        '1U002': { count: 3, row: { ...cardB, count: 3 } },
      })
    );
    localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': true, 'Icons': false, 'Costs': true }));

    await act(async () => {
      render(<DeckBuilderClient data={[cardA, cardB] as any} columns={[]} />);
    });

    expect(mockIconPill).toHaveBeenCalledTimes(1);
    expect(mockIconPill).toHaveBeenCalledWith(expect.objectContaining({ icon: 'Cmd', count: 5 }));
  });

  it('renders no IconPills when the deck is empty', async () => {
    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    expect(mockIconPill).not.toHaveBeenCalled();
  });

  describe('handleIconSearch', () => {
    it('passes an onSearch function to IconPill', async () => {
      const card = makePersonnel('1U001', '[Cmd]');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U001': { count: 1, row: card } })
      );
      localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': true, 'Icons': false, 'Costs': true }));

      await act(async () => {
        render(<DeckBuilderClient data={[card] as any} columns={[]} />);
      });

      const props = mockIconPill.mock.calls[mockIconPill.mock.calls.length - 1][0];
      expect(typeof props.onSearch).toBe('function');
    });

    it('fires a personnel icons search when onSearch is called with null hq', async () => {
      const card = makePersonnel('1U001', '[Cmd]');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U001': { count: 1, row: card } })
      );
      localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': true, 'Icons': false, 'Costs': true }));

      await act(async () => {
        render(<DeckBuilderClient data={[card] as any} columns={[]} />);
      });

      const props = mockIconPill.mock.calls[mockIconPill.mock.calls.length - 1][0];
      act(() => {
        props.onSearch('Cmd', null);
      });

      const lastQuery = mockUseFilterData.mock.calls[mockUseFilterData.mock.calls.length - 1][3];
      expect(lastQuery).toBe('type:personnel icons:"Cmd"');
    });

    it('includes reportsto in the query when onSearch is called with a specific HQ', async () => {
      const card = makePersonnel('1U001', '[Cmd]');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U001': { count: 1, row: card } })
      );
      localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': true, 'Keywords': true, 'Icons': false, 'Costs': true }));

      await act(async () => {
        render(<DeckBuilderClient data={[card] as any} columns={[]} />);
      });

      const props = mockIconPill.mock.calls[mockIconPill.mock.calls.length - 1][0];
      act(() => {
        props.onSearch('Cmd', 'bajor');
      });

      const lastQuery = mockUseFilterData.mock.calls[mockUseFilterData.mock.calls.length - 1][3];
      expect(lastQuery).toBe('type:personnel icons:"Cmd" reportsto:"bajor"');
    });
  });
});

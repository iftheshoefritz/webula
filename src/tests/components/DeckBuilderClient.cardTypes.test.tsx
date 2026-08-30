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
jest.mock('../../components/PileAggregateAttributeChart', () => () => null);
jest.mock('../../components/PileAggregateDilemmaTypeChart', () => () => null);
jest.mock('../../components/IconPill', () => () => null);

let capturedBarChartProps: { labels: any[]; series: { label: string; values: any[] }[] } | null = null;
jest.mock('../../components/BarChart', () => (props: { labels: any[]; series: { label: string; values: any[] }[] }) => {
  capturedBarChartProps = props;
  return null;
});

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

const makeRow = (collectorsinfo: string, name: string, type: string, count: number) => ({
  collectorsinfo,
  originalName: name,
  type,
  name,
  pile: 'draw',
  icons: '',
  keywords: '',
  count,
  skills: '',
  cost: 0,
  imagefile: `card_${collectorsinfo}`,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Card types section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
    capturedBarChartProps = null;
  });

  it('feeds BarChart a single series with per-type counts from the draw pile', async () => {
    const p1 = makeRow('1U001', 'Personnel One', 'personnel', 2);
    const p2 = makeRow('1U002', 'Personnel Two', 'personnel', 1);
    const s1 = makeRow('1U003', 'Ship One', 'ship', 1);

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        '1U001': { count: 2, row: p1 },
        '1U002': { count: 1, row: p2 },
        '1U003': { count: 1, row: s1 },
      })
    );

    await act(async () => {
      render(<DeckBuilderClient data={[p1, p2, s1] as any} columns={[]} />);
    });

    fireEvent.click(screen.getByText('Card types'));

    expect(capturedBarChartProps).not.toBeNull();
    expect(capturedBarChartProps!.series).toHaveLength(1);
    expect(capturedBarChartProps!.series[0].label).toBe('# of Occurrences');

    const personnelIndex = capturedBarChartProps!.labels.indexOf('personnel');
    const shipIndex = capturedBarChartProps!.labels.indexOf('ship');
    expect(capturedBarChartProps!.series[0].values[personnelIndex]).toBe(3);
    expect(capturedBarChartProps!.series[0].values[shipIndex]).toBe(1);
  });
});

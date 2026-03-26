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
jest.mock('../../components/PileAggregateCostChart', () => () => null);
jest.mock('../../components/IconPill', () => () => null);

jest.mock('next/link', () =>
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

// Spy on SkillsChart so we can capture the hqOptions and callback props
const mockSkillsChart = jest.fn((_props: any) => null);
jest.mock('../../components/SkillsChart', () => ({
  __esModule: true,
  default: (props: any) => mockSkillsChart(props),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeMission = (
  collectorsinfo: string,
  name: string,
  missiontype = 'h',
  extra: Record<string, any> = {}
) => ({
  collectorsinfo,
  originalName: name,
  type: 'mission',
  name,
  pile: 'mission',
  missiontype,
  icons: '',
  keywords: '',
  skills: '',
  cost: 0,
  count: 1,
  imagefile: `mission_${collectorsinfo}`,
  ...extra,
});

const makeShip = (collectorsinfo: string, name: string, extra: Record<string, any> = {}) => ({
  collectorsinfo,
  originalName: name,
  type: 'ship',
  name,
  pile: 'draw',
  missiontype: '',
  icons: '',
  keywords: '',
  skills: '',
  affiliation: 'federation',
  cost: 0,
  count: 1,
  imagefile: `ship_${collectorsinfo}`,
  ...extra,
});

const makeEvent = (collectorsinfo: string, name: string) => ({
  collectorsinfo,
  originalName: name,
  type: 'event',
  name,
  pile: 'draw',
  missiontype: '',
  icons: '',
  keywords: '',
  skills: '',
  cost: 0,
  count: 1,
  imagefile: `event_${collectorsinfo}`,
});

/** Most recent props passed to SkillsChart */
const lastSkillsChartProps = () => {
  const calls = mockSkillsChart.mock.calls;
  const lastCall = calls[calls.length - 1];
  if (!lastCall) throw new Error('SkillsChart was never rendered');
  return lastCall[0];
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – hqOptions computation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFilterData.mockReturnValue([]);
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
    // Expand the "Personnel skills" section so SkillsChart gets rendered
    localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': false }));
  });

  describe('regular HQ missions', () => {
    it('includes a regular HQ mission as an hqOption', async () => {
      const hqMission = makeMission('1U001', 'bajor', 'h');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U001': { count: 1, row: hqMission } })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[hqMission] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      expect(props.hqOptions).toEqual(
        expect.arrayContaining([{ label: 'bajor', value: 'bajor' }])
      );
    });

    it('does not include non-HQ missions as hqOptions', async () => {
      const sMission = makeMission('1U002', 'rescue prisoners', 's');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '1U002': { count: 1, row: sMission } })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[sMission] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      expect(props.hqOptions).toHaveLength(0);
    });
  });

  describe("Caretaker's Array combos", () => {
    const caretakers = makeMission('7U001', "caretaker's array", 's');

    it('adds equinox option when deck has Caretaker\'s Array + U.S.S. Equinox', async () => {
      const equinox = makeShip('7U100', 'u.s.s. equinox');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({
          '7U001': { count: 1, row: caretakers },
          '7U100': { count: 1, row: equinox },
        })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[caretakers, equinox] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      expect(props.hqOptions).toEqual(
        expect.arrayContaining([
          { label: "Caretaker's Array (Equinox)", value: "caretaker's array equinox" },
        ])
      );
    });

    it('adds voyager option when deck has Caretaker\'s Array + U.S.S. Voyager', async () => {
      const voyager = makeShip('7U200', 'u.s.s. voyager');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({
          '7U001': { count: 1, row: caretakers },
          '7U200': { count: 1, row: voyager },
        })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[caretakers, voyager] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      expect(props.hqOptions).toEqual(
        expect.arrayContaining([
          { label: "Caretaker's Array (Voyager)", value: "caretaker's array voyager" },
        ])
      );
    });

    it('does not add combo options when Caretaker\'s Array has no matching ship', async () => {
      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '7U001': { count: 1, row: caretakers } })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[caretakers] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      const values = (props.hqOptions as any[]).map((o: any) => o.value);
      expect(values).not.toContain("caretaker's array equinox");
      expect(values).not.toContain("caretaker's array voyager");
    });
  });

  describe('Prevent Historical Disruption combo', () => {
    const preventHistorical = makeMission('9U001', 'prevent historical disruption', 's');

    it('adds relativity option when deck has the mission + U.S.S. Relativity', async () => {
      const relativity = makeShip('9U100', 'u.s.s. relativity');

      localStorage.setItem(
        'currentDeck',
        JSON.stringify({
          '9U001': { count: 1, row: preventHistorical },
          '9U100': { count: 1, row: relativity },
        })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[preventHistorical, relativity] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      expect(props.hqOptions).toEqual(
        expect.arrayContaining([
          { label: 'Prevent Historical Disruption (Relativity)', value: 'prevent historical disruption relativity' },
        ])
      );
    });

    it('does not add relativity option when Prevent Historical Disruption has no Relativity ship', async () => {
      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '9U001': { count: 1, row: preventHistorical } })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[preventHistorical] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      const values = (props.hqOptions as any[]).map((o: any) => o.value);
      expect(values).not.toContain('prevent historical disruption relativity');
    });
  });

  describe('Ceti Alpha V + To Rule In Hell combo', () => {
    const cetiAlphaV = makeMission('8U001', 'ceti alpha v', 's');
    const toRuleInHell = makeEvent('8U200', 'to rule in hell');

    it('adds Khan option when deck has Ceti Alpha V + To Rule In Hell', async () => {
      localStorage.setItem(
        'currentDeck',
        JSON.stringify({
          '8U001': { count: 1, row: cetiAlphaV },
          '8U200': { count: 1, row: toRuleInHell },
        })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[cetiAlphaV, toRuleInHell] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      expect(props.hqOptions).toEqual(
        expect.arrayContaining([
          { label: 'Ceti Alpha V (Khan)', value: 'ceti alpha v khan' },
        ])
      );
    });

    it('does not add Khan option when Ceti Alpha V is present but To Rule In Hell is absent', async () => {
      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '8U001': { count: 1, row: cetiAlphaV } })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[cetiAlphaV] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      const values = (props.hqOptions as any[]).map((o: any) => o.value);
      expect(values).not.toContain('ceti alpha v khan');
    });

    it('does not add Khan option when To Rule In Hell is present but Ceti Alpha V is absent', async () => {
      localStorage.setItem(
        'currentDeck',
        JSON.stringify({ '8U200': { count: 1, row: toRuleInHell } })
      );

      await act(async () => {
        render(<DeckBuilderClient data={[toRuleInHell] as any} columns={[]} />);
      });

      const props = lastSkillsChartProps();
      const values = (props.hqOptions as any[]).map((o: any) => o.value);
      expect(values).not.toContain('ceti alpha v khan');
    });
  });
});

describe('DeckBuilderClient – handleSkillSearch / skill search query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFilterData.mockReturnValue([]);
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
    // Expand the "Personnel skills" section so SkillsChart gets rendered
    localStorage.setItem('analysisCollapsed', JSON.stringify({ 'Personnel skills': false }));
  });

  it('builds a plain skills query when onSkillSearch is called with null hq', async () => {
    const hqMission = makeMission('1U001', 'bajor', 'h');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({ '1U001': { count: 1, row: hqMission } })
    );

    await act(async () => {
      render(<DeckBuilderClient data={[hqMission] as any} columns={[]} />);
    });

    const props = lastSkillsChartProps();

    act(() => {
      props.onSkillSearch('diplomacy', null);
    });

    const lastQuery = mockUseFilterData.mock.calls[mockUseFilterData.mock.calls.length - 1][3];
    expect(lastQuery).toBe('type:personnel skills:diplomacy');
  });

  it('includes reportsto in the query when onSkillSearch is called with a specific HQ', async () => {
    const hqMission = makeMission('1U001', 'bajor', 'h');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({ '1U001': { count: 1, row: hqMission } })
    );

    await act(async () => {
      render(<DeckBuilderClient data={[hqMission] as any} columns={[]} />);
    });

    const props = lastSkillsChartProps();

    act(() => {
      props.onSkillSearch('diplomacy', 'bajor');
    });

    const lastQuery = mockUseFilterData.mock.calls[mockUseFilterData.mock.calls.length - 1][3];
    expect(lastQuery).toBe('type:personnel skills:diplomacy reportsto:"bajor"');
  });

  it('passes hqOptions to SkillsChart', async () => {
    const hqMission = makeMission('1U001', 'bajor', 'h');

    localStorage.setItem(
      'currentDeck',
      JSON.stringify({ '1U001': { count: 1, row: hqMission } })
    );

    await act(async () => {
      render(<DeckBuilderClient data={[hqMission] as any} columns={[]} />);
    });

    const props = lastSkillsChartProps();
    expect(props.hqOptions).toEqual(
      expect.arrayContaining([{ label: 'bajor', value: 'bajor' }])
    );
  });
});

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

describe('DeckBuilderClient – MissionBranchSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('does not render a branch selector for a mission with no OR skills', async () => {
    const m = makeMission('1U001', 'Mission Alpha', 'Physics, Treachery');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    expect(screen.queryByTestId('branch-selector-Mission Alpha')).toBeNull();
  });

  it('renders "All", one button per OR branch (including mandatory skills), and "None"', async () => {
    // "Physics, (Diplomacy or Treachery)" → mandatory: {physics:1}, orBranches: [{diplomacy:1}, {treachery:1}]
    const m = makeMission('1U001', 'Mission Alpha', 'Physics, (Diplomacy or Treachery)');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    // Both desktop and mobile render the selector, so there are 2 containers
    const selectors = screen.getAllByTestId('branch-selector-Mission Alpha');
    expect(selectors.length).toBeGreaterThanOrEqual(1);

    const first = selectors[0];
    expect(within(first).getByRole('button', { name: 'All' })).toBeInTheDocument();
    // Branch labels now include mandatory skills
    expect(within(first).getByRole('button', { name: 'Physics, Diplomacy' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Physics, Treachery' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'None' })).toBeInTheDocument();
  });

  it('branchLabel capitalizes each skill and joins multiple skills with ", "', async () => {
    // "(Diplomacy and Treachery or Physics)" → mandatory: {}, orBranches: [{diplomacy:1, treachery:1}, {physics:1}]
    const m = makeMission('1U001', 'Mission Alpha', '(Diplomacy and Treachery or Physics)');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    const selectors = screen.getAllByTestId('branch-selector-Mission Alpha');
    const first = selectors[0];
    // Multi-skill branch should join with ", "
    expect(within(first).getByRole('button', { name: 'Diplomacy, Treachery' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Physics' })).toBeInTheDocument();
  });

  it('"All" button is aria-pressed="true" by default (no branch selected)', async () => {
    const m = makeMission('1U001', 'Mission Alpha', 'Physics, (Diplomacy or Treachery)');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    const selectors = screen.getAllByTestId('branch-selector-Mission Alpha');
    const first = selectors[0];
    const allBtn = within(first).getByRole('button', { name: 'All' });
    expect(allBtn).toHaveAttribute('aria-pressed', 'true');

    const diplomacyBtn = within(first).getByRole('button', { name: 'Physics, Diplomacy' });
    expect(diplomacyBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a branch button marks it as selected', async () => {
    const m = makeMission('1U001', 'Mission Alpha', 'Physics, (Diplomacy or Treachery)');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    const selectors = screen.getAllByTestId('branch-selector-Mission Alpha');
    const first = selectors[0];

    await act(async () => {
      fireEvent.click(within(first).getByRole('button', { name: 'Physics, Diplomacy' }));
    });

    // After clicking Physics, Diplomacy, it should be pressed and All should not be
    const updatedSelectors = screen.getAllByTestId('branch-selector-Mission Alpha');
    const updatedFirst = updatedSelectors[0];
    expect(within(updatedFirst).getByRole('button', { name: 'Physics, Diplomacy' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(updatedFirst).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('"None" button is rendered and clicking it marks it as selected', async () => {
    const m = makeMission('1U001', 'Mission Alpha', 'Physics, (Diplomacy or Treachery)');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    const selectors = screen.getAllByTestId('branch-selector-Mission Alpha');
    const first = selectors[0];
    const noneBtn = within(first).getByRole('button', { name: 'None' });
    expect(noneBtn).toBeInTheDocument();
    expect(noneBtn).toHaveAttribute('aria-pressed', 'false');

    await act(async () => {
      fireEvent.click(noneBtn);
    });

    const updatedFirst = screen.getAllByTestId('branch-selector-Mission Alpha')[0];
    expect(within(updatedFirst).getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(updatedFirst).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking "All" after selecting a branch resets to no selection', async () => {
    const m = makeMission('1U001', 'Mission Alpha', 'Physics, (Diplomacy or Treachery)');
    localStorage.setItem('currentDeck', JSON.stringify({ '1U001': { count: 1, row: m } }));

    await act(async () => {
      render(<DeckBuilderClient data={[m] as any} columns={[]} />);
    });

    const selectors = screen.getAllByTestId('branch-selector-Mission Alpha');
    const first = selectors[0];

    // Select a branch first
    await act(async () => {
      fireEvent.click(within(first).getByRole('button', { name: 'Physics, Diplomacy' }));
    });

    // Now click All to reset
    await act(async () => {
      fireEvent.click(within(screen.getAllByTestId('branch-selector-Mission Alpha')[0]).getByRole('button', { name: 'All' }));
    });

    const finalSelectors = screen.getAllByTestId('branch-selector-Mission Alpha');
    const finalFirst = finalSelectors[0];
    expect(within(finalFirst).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(finalFirst).getByRole('button', { name: 'Physics, Diplomacy' })).toHaveAttribute('aria-pressed', 'false');
  });
});

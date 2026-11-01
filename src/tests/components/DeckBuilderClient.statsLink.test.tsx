// ── Mocks (must precede imports) ────────────────────────────────────────────

jest.mock('posthog-js', () => ({ capture: jest.fn(), identify: jest.fn(), init: jest.fn() }));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

jest.mock('../../components/SearchResults', () => () => null);
jest.mock('../../components/SearchBar', () => () => null);
jest.mock('../../components/SearchPills', () => () => null);
jest.mock('../../components/DeckListPile', () => () => null);
jest.mock('../../components/DeckUploader', () => () => null);
jest.mock('../../components/Help', () => () => null);
jest.mock('../../components/SkillsChart', () => () => null);
jest.mock('../../components/PileAggregateCostChart', () => () => null);
jest.mock('../../components/IconPill', () => () => null);
jest.mock('../../components/DrivePickerModal', () => ({
  DrivePickerModal: () => null,
}));

jest.mock('next/link', () =>
  function MockLink({ children, href, ...rest }: { children: React.ReactNode; href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  }
);

// ── Imports ──────────────────────────────────────────────────────────────────
import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – the Stats link (#1417)', () => {
  const original = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
  });
  afterAll(() => { process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = original; });

  async function renderWith(email: string | null) {
    (getSession as jest.Mock).mockResolvedValue(email ? { user: { name: 'U', email } } : null);
    await act(async () => { render(<DeckBuilderClient data={[]} columns={[]} />); });
    await act(async () => { fireEvent.click(screen.getAllByLabelText('More deck actions')[0]); });
  }

  it('shows the Stats link to an early-access user', async () => {
    await renderWith('early@example.com');
    for (const link of screen.getAllByTestId('stats-link')) expect(link).toHaveAttribute('href', '/stats');
    expect(screen.getAllByTestId('stats-link-desktop')[0]).toHaveAttribute('href', '/stats');
  });

  it('shows no Stats link to another user or a signed-out user', async () => {
    await renderWith('other@example.com');
    expect(screen.queryByTestId('stats-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stats-link-desktop')).not.toBeInTheDocument();
  });

  it('shows no Stats link to a signed-out user', async () => {
    await renderWith(null);
    expect(screen.queryByTestId('stats-link')).not.toBeInTheDocument();
  });
});

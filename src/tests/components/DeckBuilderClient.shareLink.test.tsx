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
  function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  }
);

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getShareButton(): HTMLElement {
  const buttons = screen.getAllByRole('button');
  const btn = buttons.find(
    (b) =>
      b.getAttribute('data-tooltip-content') === 'Copy share link to clipboard' ||
      b.getAttribute('data-tooltip-content') === 'Creating share link...'
  );
  if (!btn) throw new Error('Share button not found');
  return btn;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – share link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it('calls /api/gist (not GitHub directly) when share button is clicked', async () => {
    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'gist-abc123' }),
    });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getShareButton());
    });

    // Allow async shareDeck to complete
    await act(async () => {});

    const gistCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => url === '/api/gist'
    );
    const directGitHubCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => typeof url === 'string' && url.includes('api.github.com/gists')
    );

    expect(gistCalls.length).toBe(1);
    expect(directGitHubCalls.length).toBe(0);
  });

  it('shows "Share failed" when /api/gist returns an error', async () => {
    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));

    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getShareButton());
    });

    await act(async () => {});

    expect(screen.getAllByText('Share failed').length).toBeGreaterThan(0);
  });
});

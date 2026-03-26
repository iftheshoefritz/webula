// ── Mocks (must precede imports) ────────────────────────────────────────────

jest.mock('posthog-js', () => ({ capture: jest.fn(), identify: jest.fn(), init: jest.fn() }));

let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
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
import { getSession } from 'next-auth/react';
import DeckBuilderClient from '../../components/DeckBuilderClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession() {
  (getSession as jest.Mock).mockResolvedValue({
    user: { name: 'Test User', email: 'test@example.com' },
    expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    accessToken: 'mock-token',
  });
}

function getSaveButton(): HTMLElement {
  const buttons = screen.getAllByRole('button');
  const btn = buttons.find(
    (b) => b.getAttribute('data-tooltip-content') === 'Save to G Drive' ||
           b.getAttribute('data-tooltip-content') === 'Saving...'
  );
  if (!btn) throw new Error('Save button not found');
  return btn;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – Drive save deduplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
  });

  it('uses PUT (not POST) when deckFile.id exists, even after a title change', async () => {
    mockSession();

    // Pre-seed localStorage with an existing deckFile that has an id
    localStorage.setItem('deckFile', JSON.stringify({ id: 'existing-drive-id', name: 'Old Title' }));
    localStorage.setItem('deckTitle', JSON.stringify('New Title'));

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'existing-drive-id' }),
    });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    // Should have called PUT on the existing ID, not POST to create a new file
    const putCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive/existing-drive-id' && opts?.method === 'PUT'
    );
    const postCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive' && opts?.method === 'POST'
    );

    expect(putCalls.length).toBe(1);
    expect(postCalls.length).toBe(0);
  });

  it('does not fire a second save if one is already in flight', async () => {
    mockSession();

    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));

    let resolveFirst: (value: unknown) => void;
    const firstSavePromise = new Promise((res) => { resolveFirst = res; });

    const mockFetch = jest.fn()
      .mockReturnValueOnce(firstSavePromise) // first save hangs
      .mockResolvedValue({                   // any subsequent call (shouldn't happen for POST)
        ok: true,
        json: async () => ({ file: { id: 'new-id' } }),
      });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    // Click save (starts in-flight)
    act(() => {
      fireEvent.click(getSaveButton());
    });

    // Click save again while the first is still in flight
    act(() => {
      fireEvent.click(getSaveButton());
    });

    // Resolve the first save
    await act(async () => {
      resolveFirst!({
        ok: true,
        json: async () => ({ file: { id: 'new-id' } }),
      });
    });

    // Only one POST should have been made (the second click was blocked)
    const postCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive' && opts?.method === 'POST'
    );
    expect(postCalls.length).toBe(1);
  });
});

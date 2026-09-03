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

function driveListResponse(files: unknown[] = []) {
  return { ok: true, json: async () => ({ files }) };
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

    // Should have called PUT on the existing ID, not POST to create a new file, and no
    // Save As dialog should have appeared (already-saved decks update in place).
    const putCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive/existing-drive-id' && opts?.method === 'PUT'
    );
    const postCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive' && opts?.method === 'POST'
    );

    expect(putCalls.length).toBe(1);
    expect(postCalls.length).toBe(0);
    expect(screen.queryByRole('button', { name: 'Save to Root' })).not.toBeInTheDocument();
  });

  it('opens the Save As dialog instead of calling POST immediately when the deck has no deckFile.id', async () => {
    mockSession();

    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));

    const mockFetch = jest.fn().mockResolvedValue(driveListResponse());
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    expect(screen.getByRole('button', { name: 'Save to Root' })).toBeInTheDocument();
    const postCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive' && opts?.method === 'POST'
    );
    expect(postCalls.length).toBe(0);
  });

  it('confirming a destination in the Save As dialog creates the file there and switches subsequent saves to PUT', async () => {
    mockSession();

    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));

    const mockFetch = jest.fn()
      .mockResolvedValueOnce(driveListResponse([{ id: 'folder-1', name: 'My Folder', mimeType: 'application/vnd.google-apps.folder', parents: ['appDataFolder'] }]))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ file: { id: 'new-drive-id' } }) })
      .mockResolvedValue({ ok: true, json: async () => ({ file: { id: 'new-drive-id' } }) });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save to My Folder' }));
    });

    const postCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive' && opts?.method === 'POST'
    );
    expect(postCalls.length).toBe(1);
    expect(JSON.parse(postCalls[0][1].body)).toEqual(
      expect.objectContaining({ fileName: 'My Deck', targetParentId: 'folder-1' })
    );
    expect(screen.queryByRole('button', { name: 'Save to Root' })).not.toBeInTheDocument();

    // Saving again should PUT to the newly created file, not open the dialog or POST again.
    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    const putCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive/new-drive-id' && opts?.method === 'PUT'
    );
    expect(putCalls.length).toBe(1);
    expect(mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive' && opts?.method === 'POST'
    ).length).toBe(1);
  });

  it('closes the Save As dialog without saving when canceled', async () => {
    mockSession();

    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));

    const mockFetch = jest.fn().mockResolvedValue(driveListResponse());
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    await act(async () => {
      fireEvent.click(screen.getByText('×'));
    });

    expect(screen.queryByRole('button', { name: 'Save to Root' })).not.toBeInTheDocument();
    const postCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive' && opts?.method === 'POST'
    );
    expect(postCalls.length).toBe(0);
  });

  it('does not reopen the Save As dialog or start a second save while one is already in flight', async () => {
    mockSession();

    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));

    let resolveSave: (value: unknown) => void;
    const savePromise = new Promise((res) => { resolveSave = res; });

    const mockFetch = jest.fn()
      .mockResolvedValueOnce(driveListResponse())
      .mockReturnValueOnce(savePromise) // the POST triggered by confirming "Root" hangs
      .mockResolvedValue({ ok: true, json: async () => ({ file: { id: 'new-id' } }) });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getSaveButton());
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save to Root' }));
    });

    // Save is now in flight; clicking Save again should be a no-op (no dialog reopens).
    act(() => {
      fireEvent.click(getSaveButton());
    });

    await act(async () => {
      resolveSave!({ ok: true, json: async () => ({ file: { id: 'new-id' } }) });
    });

    const postCalls = mockFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/drive' && opts?.method === 'POST'
    );
    expect(postCalls.length).toBe(1);
  });
});

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

/** A minimal non-empty deck stored in localStorage so shareDeck doesn't bail early. */
function seedDeck() {
  const deck = {
    'test-card-1': {
      count: 1,
      row: {
        collectorsinfo: 'test-card-1',
        count: 1,
        pile: 'draw',
        name: 'Test Card',
        originalName: 'Test Card',
        imagefile: 'test',
      },
    },
  };
  localStorage.setItem('currentDeck', JSON.stringify(deck));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – share link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockSearchParamsValue = new URLSearchParams();
    // Default: ClipboardItem not available (simulates environments without it)
    delete (global as any).ClipboardItem;
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
        write: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('calls /api/share when share button is clicked', async () => {
    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));
    seedDeck();

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'paste-abc123' }),
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

    const shareCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => url === '/api/share'
    );

    expect(shareCalls.length).toBe(1);
  });

  it('shows "Share failed" when /api/share returns an error', async () => {
    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));
    seedDeck();

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

  it('shows "Deck is empty" and does not call /api/share when deck has no cards', async () => {
    // No seedDeck() — deck stays empty
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getShareButton());
    });

    await act(async () => {});

    expect(screen.getAllByText('Deck is empty').length).toBeGreaterThan(0);
    const shareCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => url === '/api/share'
    );
    expect(shareCalls.length).toBe(0);
  });

  it('shows "Copied!" when /api/share succeeds and clipboard write succeeds', async () => {
    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));
    seedDeck();

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'paste-abc123' }),
    });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getShareButton());
    });

    await act(async () => {});

    expect(screen.getAllByText('Copied!').length).toBeGreaterThan(0);
  });

  it('uses ClipboardItem with a Promise when available (preserves iOS user gesture)', async () => {
    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));
    seedDeck();

    // Mock ClipboardItem to simulate iOS Safari support
    class MockClipboardItem {
      data: Record<string, Promise<Blob>>;
      constructor(data: Record<string, Promise<Blob>>) { this.data = data; }
    }
    (global as any).ClipboardItem = MockClipboardItem;

    let resolvedBlob: Blob | null = null;
    Object.assign(navigator, {
      clipboard: {
        write: jest.fn().mockImplementation(async (items: MockClipboardItem[]) => {
          resolvedBlob = await items[0].data['text/plain'];
        }),
        writeText: jest.fn(),
      },
    });

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'paste-ios123' }),
    });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getShareButton());
    });

    await act(async () => {});

    // clipboard.write (ClipboardItem path) should have been called
    expect((navigator.clipboard as any).write).toHaveBeenCalled();
    // The resolved value should be a Blob
    expect(resolvedBlob).not.toBeNull();
    expect(resolvedBlob).toBeInstanceOf(Blob);
    // clipboard.writeText should NOT have been called (ClipboardItem path succeeded)
    expect((navigator.clipboard as any).writeText).not.toHaveBeenCalled();
    // "Copied!" shown
    expect(screen.getAllByText('Copied!').length).toBeGreaterThan(0);
  });

  it('does not show "Copied!" when clipboard write fails, but still shows the URL input', async () => {
    localStorage.setItem('deckTitle', JSON.stringify('My Deck'));
    seedDeck();

    // Clipboard API throws (simulates iOS behaviour)
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error('Not allowed')) },
    });

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'paste-abc123' }),
    });
    global.fetch = mockFetch;

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {
      fireEvent.click(getShareButton());
    });

    await act(async () => {});

    // Should NOT show "Copied!" when clipboard fails
    expect(screen.queryByText('Copied!')).toBeNull();
    // URL input should be present for manual copy
    expect(screen.getAllByDisplayValue(/http.*share=paste-abc123/i).length).toBeGreaterThan(0);
  });

  it('fetches deck content via /api/share proxy when ?share= param is in URL', async () => {
    const tsvContent = 'Deck:\n1\tEnterprise-D';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => tsvContent,
    });

    // Set window.location so the component picks up ?share=TESTID
    // (the component reads window.location.search directly)
    delete (window as any).location;
    (window as any).location = new URL('http://localhost/decks?share=TESTID');

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {});

    // Should call the server-side proxy, not dpaste.com directly (avoids CORS)
    const proxyCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]: [string]) => url === '/api/share?id=TESTID'
    );
    expect(proxyCalls.length).toBe(1);

    // Should NOT call dpaste.com directly from the browser
    const directDpasteCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]: [string]) => url === 'https://dpaste.com/TESTID.txt'
    );
    expect(directDpasteCalls.length).toBe(0);

    // Reset location
    delete (window as any).location;
    (window as any).location = new URL('http://localhost/decks');
  });
});

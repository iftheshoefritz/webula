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
import { render, act, screen, fireEvent, within } from '@testing-library/react';
import posthog from 'posthog-js';
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
function storeDeck() {
  const deck = {
    'test-card-1': {
      count: 1,
      row: {
        collectorsinfo: 'test-card-1',
        count: 1,
        pile: 'drawDeck',
        name: 'Test Card',
        originalName: 'Test Card',
        imagefile: 'test',
      },
    },
  };
  localStorage.setItem('currentDeck', JSON.stringify(deck));
}

/** Minimal card data satisfying CardDef so the share useEffect can proceed. */
const MINIMAL_CARD_DATA = [
  {
    collectorsinfo: 'test-card-1',
    name: 'Test Card',
    originalName: 'Test Card',
    imagefile: 'test',
    type: 'Personnel',
    count: 1,
    dilemmatype: '',
    missiontype: '' as const,
    unique: 'n' as const,
  },
];

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
    storeDeck();

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

  it('exports a deck saved with the old pile values "draw" and "dilemma" in LackeyCCG format (#837)', async () => {
    const savedRow = (collectorsinfo: string, type: string, pile: string) => ({
      count: 1,
      row: { collectorsinfo, count: 1, type, pile, name: collectorsinfo, originalName: collectorsinfo, imagefile: 'test' },
    });
    localStorage.setItem(
      'currentDeck',
      JSON.stringify({
        Mission: savedRow('Mission', 'mission', 'mission'),
        Dilemma: savedRow('Dilemma', 'dilemma', 'dilemma'),
        Personnel: savedRow('Personnel', 'personnel', 'draw'),
      })
    );

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

    const [, init] = mockFetch.mock.calls.find(([url]: [string]) => url === '/api/share');
    expect(JSON.parse(init.body).content).toBe(
      'Deck:\n1\tPersonnel\nDilemmas:\n1\tDilemma\nMissions:\n1\tMission'
    );
  });

  describe('a failed share (#1441)', () => {
    afterEach(() => {
      jest.useRealTimers();
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    async function shareWith(fetchImpl: jest.Mock) {
      localStorage.setItem('deckTitle', JSON.stringify('My Deck'));
      storeDeck();
      global.fetch = fetchImpl;
      await act(async () => {
        render(<DeckBuilderClient data={[]} columns={[]} />);
      });
      await act(async () => {
        fireEvent.click(getShareButton());
      });
      await act(async () => {});
    }

    const errorAnswer = (status: number, body: unknown) =>
      jest.fn().mockResolvedValue({ ok: false, status, json: async () => body });

    it('names an offline client when the fetch rejects', async () => {
      await shareWith(jest.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      expect(screen.getAllByText('You are offline. Connect and try again.').length).toBeGreaterThan(0);
    });

    it('names an offline client without calling /api/share when navigator.onLine is false', async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      const mockFetch = jest.fn();
      await shareWith(mockFetch);
      expect(screen.getAllByText('You are offline. Connect and try again.').length).toBeGreaterThan(0);
      expect(mockFetch.mock.calls.filter(([url]: [string]) => url === '/api/share')).toHaveLength(0);
    });

    it('says the share service cannot be reached for upstream_unreachable', async () => {
      await shareWith(errorAnswer(502, { error: 'Share service unreachable', code: 'upstream_unreachable' }));
      expect(
        screen.getAllByText('The share service cannot be reached. Try again later, or copy the deck as text.').length
      ).toBeGreaterThan(0);
    });

    it('says the share service is busy for upstream_busy', async () => {
      await shareWith(errorAnswer(429, { error: 'Paste creation failed', code: 'upstream_busy' }));
      expect(screen.getAllByText('The share service is busy. Try again in a minute.').length).toBeGreaterThan(0);
    });

    it('names the status of any other error', async () => {
      await shareWith(errorAnswer(418, { error: 'Paste creation failed', code: 'upstream_error' }));
      expect(screen.getAllByText('Share failed (HTTP 418).').length).toBeGreaterThan(0);
    });

    it('names the status when the answer has no JSON body', async () => {
      await shareWith(jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new SyntaxError('x'); } }));
      expect(screen.getAllByText('Share failed (HTTP 500).').length).toBeGreaterThan(0);
    });

    it('keeps the message after 3 seconds and more', async () => {
      jest.useFakeTimers();
      await shareWith(errorAnswer(429, { code: 'upstream_busy' }));
      await act(async () => {
        jest.advanceTimersByTime(20000);
      });
      expect(screen.getAllByText('The share service is busy. Try again in a minute.').length).toBeGreaterThan(0);
    });

    it('removes the message when the user closes it', async () => {
      await shareWith(errorAnswer(429, { code: 'upstream_busy' }));
      await act(async () => {
        fireEvent.click(screen.getAllByLabelText('Close the share error')[0]);
      });
      expect(screen.queryByText('The share service is busy. Try again in a minute.')).toBeNull();
    });

    it('clears the message when the user shares again', async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ code: 'upstream_busy' }) })
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'paste-abc123' }) });
      await shareWith(mockFetch);
      expect(screen.getAllByText('The share service is busy. Try again in a minute.').length).toBeGreaterThan(0);
      await act(async () => {
        fireEvent.click(getShareButton());
      });
      await act(async () => {});
      expect(screen.queryByText('The share service is busy. Try again in a minute.')).toBeNull();
      expect(screen.getAllByText('Copied!').length).toBeGreaterThan(0);
    });

    it('offers Copy deck as text, which writes the Lackey text of the deck', async () => {
      await shareWith(errorAnswer(502, { code: 'upstream_unreachable' }));
      const [, init] = (global.fetch as jest.Mock).mock.calls.find(([url]: [string]) => url === '/api/share');
      await act(async () => {
        fireEvent.click(screen.getAllByText('Copy deck as text')[0]);
      });
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.parse(init.body).content);
      expect(screen.getAllByText('Copied the deck as text').length).toBeGreaterThan(0);
    });

    it('offers Export to LackeyCCG beside the message', async () => {
      await shareWith(errorAnswer(502, { code: 'upstream_unreachable' }));
      const panel = screen.getAllByTestId('share-error-desktop')[0];
      expect(within(panel).getByText('Export to LackeyCCG')).toBeInTheDocument();
    });

    it('captures deckBuilder.share.failed with the code and the status', async () => {
      await shareWith(errorAnswer(502, { code: 'upstream_unreachable' }));
      expect(posthog.capture).toHaveBeenCalledWith('deckBuilder.share.failed', {
        code: 'upstream_unreachable',
        status: 502,
        context: 'create',
      });
    });
  });

  describe('a ?share= link that does not load (#1441)', () => {
    afterEach(() => {
      window.history.replaceState({}, '', '/decks');
    });

    async function loadWith(answer: { ok: boolean; status: number; json: () => Promise<unknown> }) {
      global.fetch = jest.fn().mockResolvedValue(answer);
      window.history.replaceState({}, '', '/decks?share=TESTID');
      await act(async () => {
        render(<DeckBuilderClient data={MINIMAL_CARD_DATA} columns={[]} />);
      });
      await act(async () => {});
    }

    it('says the shared deck expired for not_found, and loads no deck', async () => {
      await loadWith({ ok: false, status: 404, json: async () => ({ error: 'Paste not found', code: 'not_found' }) });
      expect(screen.getByText('This shared deck has expired or does not exist.')).toBeInTheDocument();
      expect(screen.queryByText('A shared deck is ready to load')).toBeNull();
      expect(posthog.capture).toHaveBeenCalledWith('deckBuilder.share.failed', {
        code: 'not_found',
        status: 404,
        context: 'load',
      });
    });

    it('says the share service cannot be reached for upstream_unreachable', async () => {
      await loadWith({ ok: false, status: 502, json: async () => ({ code: 'upstream_unreachable' }) });
      expect(
        screen.getByText('The share service cannot be reached, so the shared deck cannot be loaded. Try again later.')
      ).toBeInTheDocument();
    });

    it('does not load an OK answer with no content', async () => {
      storeDeck();
      await loadWith({ ok: true, status: 200, json: async () => ({}) });
      expect(screen.getByText('Failed to load shared deck (HTTP 200).')).toBeInTheDocument();
      expect(screen.queryByText('A shared deck is ready to load')).toBeNull();
    });
  });

  it('shows "Deck is empty" and does not call /api/share when deck has no cards', async () => {
    // No storeDeck() — deck stays empty
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
    storeDeck();

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
    storeDeck();

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
    storeDeck();

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
      json: async () => ({ content: tsvContent, title: null }),
    });

    // Set the URL so the component picks up ?share=TESTID
    // (the component reads window.location.search directly)
    window.history.replaceState({}, '', '/decks?share=TESTID');

    await act(async () => {
      render(<DeckBuilderClient data={[]} columns={[]} />);
    });

    await act(async () => {});

    // Loads the share from the app's own route, and from nowhere else
    const fetchUrls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
    expect(fetchUrls.filter((url) => url === '/api/share?id=TESTID').length).toBe(1);
    expect(fetchUrls.filter((url) => /^https?:/.test(url))).toEqual([]);

    // Reset the URL
    window.history.replaceState({}, '', '/decks');
  });

  it('uses the paste title as the deck title when loading a shared deck', async () => {
    const tsvContent = 'Deck:\n1\tEnterprise-D';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: tsvContent, title: 'My TrekCC Deck' }),
    });

    window.history.replaceState({}, '', '/decks?share=TESTID');

    await act(async () => {
      render(<DeckBuilderClient data={MINIMAL_CARD_DATA} columns={[]} />);
    });

    await act(async () => {});

    expect(screen.getAllByDisplayValue('My TrekCC Deck').length).toBeGreaterThan(0);

    // Reset the URL
    window.history.replaceState({}, '', '/decks');
  });

  it('shows warning modal when a non-empty deck exists and ?share= param is in URL', async () => {
    storeDeck();

    const tsvContent = 'Deck:\n1\tEnterprise-D';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: tsvContent, title: null }),
    });

    window.history.replaceState({}, '', '/decks?share=TESTID');

    await act(async () => {
      render(<DeckBuilderClient data={MINIMAL_CARD_DATA} columns={[]} />);
    });

    await act(async () => {});

    expect(screen.getByText('A shared deck is ready to load')).toBeInTheDocument();
    expect(screen.getByText('Go back to my previous deck to save')).toBeInTheDocument();
    expect(screen.getByText("I'm ready to load this awesome shared deck")).toBeInTheDocument();

    // Reset the URL
    window.history.replaceState({}, '', '/decks');
  });

  it('dismisses warning modal without loading deck when "Go back" is clicked', async () => {
    storeDeck();

    const tsvContent = 'Deck:\n1\tEnterprise-D';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: tsvContent, title: null }),
    });

    window.history.replaceState({}, '', '/decks?share=TESTID');

    await act(async () => {
      render(<DeckBuilderClient data={MINIMAL_CARD_DATA} columns={[]} />);
    });

    await act(async () => {});

    // Warning modal should be visible
    expect(screen.getByText('A shared deck is ready to load')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Go back to my previous deck to save'));
    });

    // Modal should be gone
    expect(screen.queryByText('A shared deck is ready to load')).toBeNull();

    // Reset the URL
    window.history.replaceState({}, '', '/decks');
  });

  it('loads shared deck when "I\'m ready" is clicked in the warning modal', async () => {
    storeDeck();

    const tsvContent = 'Deck Title\ttitle\nDeck:\n1\tEnterprise-D';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: tsvContent, title: null }),
    });

    window.history.replaceState({}, '', '/decks?share=TESTID');

    await act(async () => {
      render(<DeckBuilderClient data={MINIMAL_CARD_DATA} columns={[]} />);
    });

    await act(async () => {});

    // Warning modal should be visible
    expect(screen.getByText('A shared deck is ready to load')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("I'm ready to load this awesome shared deck"));
    });

    // Modal should be gone after confirming
    expect(screen.queryByText('A shared deck is ready to load')).toBeNull();

    // Reset the URL
    window.history.replaceState({}, '', '/decks');
  });
});

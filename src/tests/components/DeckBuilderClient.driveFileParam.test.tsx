// `/decks?driveFile=<id>&name=<name>` opens that Drive deck (#1111), the target of the Edit button
// in the practice table's Load deck picker.

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
jest.mock('../../components/DrivePickerModal', () => ({ DrivePickerModal: () => null }));

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
import { makeCardData } from '../fixtures/makeCardData';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const picard = makeCardData({ collectorsinfo: '1P1', name: 'jean-luc picard', originalName: 'Jean-Luc Picard', type: 'personnel' });
const riker = makeCardData({ collectorsinfo: '1P2', name: 'william t. riker', originalName: 'William T. Riker', type: 'personnel' });
const data = [picard, riker];

const signedIn = {
  accessToken: 'token',
  user: { name: 'n', email: 'e' },
  expires: new Date(Date.now() + 3600_000).toISOString(),
  hasDriveScope: true,
};

const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

const mockFetch = (response: { ok: boolean; body: unknown }) => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: response.ok, json: async () => response.body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DeckBuilderClient – ?driveFile= (#1111)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (getSession as jest.Mock).mockResolvedValue(signedIn);
    window.history.replaceState({}, '', '/decks?driveFile=abc&name=Borg%20Deck&keep=1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.history.replaceState({}, '', '/');
  });

  it('with an empty deck, loads the file once the card data is present', async () => {
    const fetchMock = mockFetch({ ok: true, body: '1\tJean-Luc Picard\n' });
    const replaceSpy = jest.spyOn(window.history, 'replaceState');

    let rerender: ReturnType<typeof render>['rerender'];
    await act(async () => {
      ({ rerender } = render(<DeckBuilderClient data={[]} columns={[]} />));
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith('/api/drive/abc', expect.objectContaining({ method: 'GET' }));
    expect(replaceSpy).toHaveBeenCalledWith({}, '', '/decks?keep=1');
    expect(window.location.search).toBe('?keep=1');
    // No card data yet, so the deck waits.
    expect(stored('currentDeck')).toEqual({});

    await act(async () => {
      rerender(<DeckBuilderClient data={data} columns={[]} />);
    });

    expect(Object.keys(stored('currentDeck'))).toEqual(['1P1']);
    expect(stored('deckFile')).toEqual({ id: 'abc', name: 'Borg Deck' });
    expect(stored('deckTitle')).toBe('Borg Deck');
    replaceSpy.mockRestore();
  });

  describe('with a deck from another file', () => {
    beforeEach(() => {
      localStorage.setItem('currentDeck', JSON.stringify({ '1P2': { count: 1, row: { ...riker, count: 1, pile: 'drawDeck' } } }));
      localStorage.setItem('deckFile', JSON.stringify({ id: 'other', name: 'Other' }));
      localStorage.setItem('deckTitle', JSON.stringify('Other'));
      mockFetch({ ok: true, body: '1\tJean-Luc Picard\n' });
    });

    const renderAndAsk = async () => {
      await act(async () => {
        render(<DeckBuilderClient data={data} columns={[]} />);
      });
      await flush();
      expect(screen.getByText('Open Borg Deck?')).toBeInTheDocument();
      expect(Object.keys(stored('currentDeck'))).toEqual(['1P2']);
    };

    it('declining keeps the deck', async () => {
      await renderAndAsk();
      await act(async () => {
        fireEvent.click(screen.getByText('Keep my current deck'));
      });
      expect(screen.queryByText('Open Borg Deck?')).not.toBeInTheDocument();
      expect(Object.keys(stored('currentDeck'))).toEqual(['1P2']);
      expect(stored('deckFile')).toEqual({ id: 'other', name: 'Other' });
    });

    it('accepting loads the new deck', async () => {
      await renderAndAsk();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Open Borg Deck' }));
      });
      expect(screen.queryByText('Open Borg Deck?')).not.toBeInTheDocument();
      expect(Object.keys(stored('currentDeck'))).toEqual(['1P1']);
      expect(stored('deckFile')).toEqual({ id: 'abc', name: 'Borg Deck' });
    });
  });

  it('with a deck from the same file, loads it without asking', async () => {
    localStorage.setItem('currentDeck', JSON.stringify({ '1P2': { count: 1, row: { ...riker, count: 1, pile: 'drawDeck' } } }));
    localStorage.setItem('deckFile', JSON.stringify({ id: 'abc', name: 'Borg Deck' }));
    mockFetch({ ok: true, body: '1\tJean-Luc Picard\n' });

    await act(async () => {
      render(<DeckBuilderClient data={data} columns={[]} />);
    });
    await flush();

    expect(screen.queryByText('Open Borg Deck?')).not.toBeInTheDocument();
    expect(Object.keys(stored('currentDeck'))).toEqual(['1P1']);
  });

  it('a failed fetch leaves the deck unchanged', async () => {
    localStorage.setItem('currentDeck', JSON.stringify({ '1P2': { count: 1, row: { ...riker, count: 1, pile: 'drawDeck' } } }));
    localStorage.setItem('deckFile', JSON.stringify({ id: 'other', name: 'Other' }));
    mockFetch({ ok: false, body: { error: 'Not found' } });

    await act(async () => {
      render(<DeckBuilderClient data={data} columns={[]} />);
    });
    await flush();

    expect(window.location.search).toBe('?keep=1');
    expect(screen.queryByText('Open Borg Deck?')).not.toBeInTheDocument();
    expect(Object.keys(stored('currentDeck'))).toEqual(['1P2']);
    expect(stored('deckFile')).toEqual({ id: 'other', name: 'Other' });
  });

  it('signed out, removes the parameters and fetches nothing', async () => {
    (getSession as jest.Mock).mockResolvedValue(null);
    const fetchMock = mockFetch({ ok: true, body: '1\tJean-Luc Picard\n' });

    await act(async () => {
      render(<DeckBuilderClient data={data} columns={[]} />);
    });
    await flush();

    expect(window.location.search).toBe('?keep=1');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/drive/abc', expect.anything());
    expect(stored('currentDeck')).toEqual({});
  });
});

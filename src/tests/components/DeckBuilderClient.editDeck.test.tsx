// The deck builder side of the practice table's Edit current deck (#1407): `?driveFile=` with a
// public deck's id, and the copy handoff of `?editDeck=1`.

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

// The playtest cards of a playtester (#1615): none and settled, unless a test says otherwise.
let mockPlaytest: { rows: any[]; version: number | null; settled: boolean } = { rows: [], version: null, settled: true };
jest.mock('../../hooks/usePlaytestCards', () => {
  const { useMemo } = jest.requireActual('react');
  return {
    usePlaytestCards: () => mockPlaytest,
    useWithPlaytestCards: (publicData: any[]) => {
      const rows = mockPlaytest.rows;
      return useMemo(() => (rows.length === 0 ? publicData : [...publicData, ...rows]), [publicData, rows]);
    },
  };
});

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

const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

// The text of a public deck, and empty folder indexes.
const mockPublicFetch = () => {
  const fetchMock = jest.fn((url: string) =>
    Promise.resolve(
      String(url).endsWith('.txt')
        ? { ok: true, text: async () => '1\tJean-Luc Picard\n' }
        : { ok: true, json: async () => [] }
    )
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// ── Tests ────────────────────────────────────────────────────────────────────

const rikerDeck = () => {
  localStorage.setItem('currentDeck', JSON.stringify({ '1P2': { count: 1, row: { ...riker, count: 1, pile: 'drawDeck' } } }));
  localStorage.setItem('deckFile', JSON.stringify({ id: null, name: 'Other' }));
  localStorage.setItem('deckTitle', JSON.stringify('Other'));
};

describe('DeckBuilderClient – Edit current deck (#1407)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    (getSession as jest.Mock).mockResolvedValue(null);
    mockPlaytest = { rows: [], version: null, settled: true };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.history.replaceState({}, '', '/');
  });

  it('?driveFile=<public id> loads signed out, linked to no Drive file', async () => {
    window.history.replaceState({}, '', '/decks?driveFile=beginner%3Alevel-1.txt&name=Level%201');
    const fetchMock = mockPublicFetch();

    await act(async () => {
      render(<DeckBuilderClient data={data} columns={[]} />);
    });
    await flush();

    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/drive'))).toBe(false);
    expect(window.location.search).toBe('');
    expect(Object.keys(stored('currentDeck'))).toEqual(['1P1']);
    expect(stored('deckFile')).toEqual({ id: null, name: 'Level 1' });
  });

  describe('the copy handoff', () => {
    beforeEach(() => {
      window.history.replaceState({}, '', '/decks?editDeck=1');
      sessionStorage.setItem('editDeckHandoff', JSON.stringify({ name: 'Borg Deck (copy)', contents: '1\tJean-Luc Picard' }));
    });

    it('loads into an empty builder, linked to no Drive file, and is used once', async () => {
      await act(async () => {
        render(<DeckBuilderClient data={data} columns={[]} />);
      });
      await flush();

      expect(window.location.search).toBe('');
      expect(sessionStorage.getItem('editDeckHandoff')).toBeNull();
      expect(Object.keys(stored('currentDeck'))).toEqual(['1P1']);
      expect(stored('deckFile')).toEqual({ id: null, name: 'Borg Deck (copy)' });
      expect(stored('deckTitle')).toBe('Borg Deck (copy)');
    });

    it('waits for the playtest cards, and loads the deck with its playtest card into an empty builder (#1615)', async () => {
      // An invented playtest card: no playtest card is ever committed.
      const gadget = makeCardData({ collectorsinfo: 'PT-9004A', name: 'test gadget', originalName: 'Test Gadget', type: 'equipment', set: 'playtest' } as any);
      sessionStorage.setItem('editDeckHandoff', JSON.stringify({ name: 'Playtest (copy)', contents: '1\tJean-Luc Picard\n2\tTest Gadget' }));
      mockPlaytest = { rows: [], version: null, settled: false };
      let result: ReturnType<typeof render> | undefined;
      await act(async () => {
        result = render(<DeckBuilderClient data={data} columns={[]} />);
      });
      await flush();
      expect(stored('deckFile')).not.toEqual({ id: null, name: 'Playtest (copy)' });

      mockPlaytest = { rows: [gadget], version: 3, settled: true };
      await act(async () => {
        result!.rerender(<DeckBuilderClient data={data} columns={[]} />);
      });
      await flush();

      expect(screen.queryByText('Open Playtest (copy)?')).not.toBeInTheDocument();
      expect(Object.keys(stored('currentDeck')).sort()).toEqual(['1P1', 'PT-9004A']);
      expect(stored('currentDeck')['PT-9004A'].count).toBe(2);
      expect(stored('deckFile')).toEqual({ id: null, name: 'Playtest (copy)' });
    });

    it('asks first in front of a deck with no file', async () => {
      rikerDeck();
      await act(async () => {
        render(<DeckBuilderClient data={data} columns={[]} />);
      });
      await flush();

      expect(screen.getByText('Open Borg Deck (copy)?')).toBeInTheDocument();
      expect(Object.keys(stored('currentDeck'))).toEqual(['1P2']);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Open Borg Deck (copy)' }));
      });
      expect(Object.keys(stored('currentDeck'))).toEqual(['1P1']);
      expect(stored('deckFile')).toEqual({ id: null, name: 'Borg Deck (copy)' });
    });
  });

  it('?editDeck=1 with no handoff leaves the builder as it was', async () => {
    window.history.replaceState({}, '', '/decks?editDeck=1');
    rikerDeck();
    await act(async () => {
      render(<DeckBuilderClient data={data} columns={[]} />);
    });
    await flush();

    expect(window.location.search).toBe('');
    expect(Object.keys(stored('currentDeck'))).toEqual(['1P2']);
  });
});

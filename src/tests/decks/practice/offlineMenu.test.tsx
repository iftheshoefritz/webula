jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// One stable array: a fresh `data` each render would rerun the page's deck load forever.
const mockData: unknown[] = [];
jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: () => ({ data: mockData, loading: false }),
}));

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  shuffleArray: jest.fn((arr) => arr),
}));

jest.mock('react-icons/fa', () => ({
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

// The store of #1050 is mocked: these tests cover the menu, not the cache. The mock hook keeps
// the same state as `useOfflineDecks`, and calls the mocked download and remove.
const mockMakeDeckOffline = jest.fn();
const mockRemoveOfflineDeck = jest.fn();
let mockRecord: any[] = [];
jest.mock('../../../app/decks/practice/offlineDecks', () => {
  const { useState } = jest.requireActual('react');
  const { fingerprint } = jest.requireActual('../../../app/decks/practice/savedGame');
  return {
    useOfflineDecks: () => {
      const [decks, setDecks] = useState(() => mockRecord);
      const [progress, setProgress] = useState(null);
      const [failed, setFailed] = useState([]);
      const makeOffline = async (name: string, deck: unknown) => {
        setFailed([]);
        setProgress({ done: 0, total: 0, bytes: 0 });
        try {
          const result = await mockMakeDeckOffline(name, deck, [], setProgress);
          if (!result.offline) setFailed(result.failed);
          setDecks(mockRecord);
          return result;
        } finally {
          setProgress(null);
        }
      };
      const remove = async (deck: unknown) => setDecks(await mockRemoveOfflineDeck(deck));
      const isOffline = (deck: any) => decks.some((d: any) => d.fingerprint === fingerprint(deck));
      return { decks, progress, failed, makeOffline, remove, isOffline };
    },
  };
});

import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import { fingerprint } from '../../../app/decks/practice/savedGame';

const row = (collectorsinfo: string, originalName: string, type: string) => ({
  collectorsinfo,
  originalName,
  name: originalName.toLowerCase(),
  type,
  imagefile: collectorsinfo,
});

const deck = {
  '1M001': { count: 1, row: row('1M001', 'Test Mission', 'mission') },
  '1D001': { count: 2, row: row('1D001', 'Test Dilemma', 'dilemma') },
  '1P001': { count: 3, row: row('1P001', 'Test Personnel', 'personnel') },
};

const recordOf = (name: string, bytes: number) => ({
  fingerprint: fingerprint(deck as any),
  name,
  deck,
  urls: ['/cardimages/1M001.jpg'],
  bytes,
  dataVersion: '',
  savedAt: '2026-10-09T00:00:00.000Z',
});

describe('the offline items of the game menu (#1052)', () => {
  const persist = jest.fn().mockResolvedValue(true);
  const estimate = jest.fn().mockResolvedValue({ usage: 2 * 1024 * 1024, quota: 100 * 1024 * 1024 });

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(deck));
    localStorage.setItem('deckFile', JSON.stringify({ id: null, name: 'Borg Rush' }));
    mockRecord = [];
    mockMakeDeckOffline.mockReset();
    mockRemoveOfflineDeck.mockReset();
    persist.mockClear();
    estimate.mockClear();
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist, estimate } });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  const renderPage = async () => {
    await act(async () => {
      render(<PracticeDrawPage />);
    });
  };

  it('shows Make available offline and Offline decks in the menu', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: 'Make available offline' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Offline decks' })).toBeInTheDocument();
  });

  it('shows the progress, names the deck from deckFile, and then reads Available offline', async () => {
    let finish: (value: unknown) => void = () => {};
    mockMakeDeckOffline.mockImplementation((name, d, _data, onProgress) => {
      onProgress({ done: 3, total: 10, bytes: 2048 });
      return new Promise((resolve) => {
        finish = () => {
          mockRecord = [recordOf(name, 4096)];
          resolve({ offline: true, record: mockRecord[0] });
        };
      });
    });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make available offline' }));
    });
    expect(mockMakeDeckOffline.mock.calls[0][0]).toBe('Borg Rush');
    expect(mockMakeDeckOffline.mock.calls[0][1]).toEqual(deck);
    expect(screen.getByTestId('offline-progress')).toHaveTextContent('3 / 10 cards · 2.0 KB');
    expect(persist).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(undefined);
    });
    expect(screen.queryByTestId('offline-progress')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Available offline ✓' })).toBeDisabled();
  });

  it('lists the cards of a failed download and retries', async () => {
    mockMakeDeckOffline.mockResolvedValueOnce({
      offline: false,
      failed: [{ url: '/cardimages/1P001.jpg', name: 'Test Personnel' }],
    });
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make available offline' }));
    });
    const failed = screen.getByTestId('offline-failed');
    expect(within(failed).getByText('Test Personnel')).toBeInTheDocument();

    mockMakeDeckOffline.mockImplementationOnce(async (name) => {
      mockRecord = [recordOf(name, 100)];
      return { offline: true, record: mockRecord[0] };
    });
    await act(async () => {
      fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    });
    expect(mockMakeDeckOffline).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('offline-failed')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Available offline ✓' })).toBeDisabled();
  });

  it('lists the offline decks with their size and the storage use, and removes one', async () => {
    mockRecord = [recordOf('Borg Rush', 3 * 1024 * 1024)];
    mockRemoveOfflineDeck.mockImplementation(async () => {
      mockRecord = [];
      return [];
    });
    await renderPage();
    expect(screen.getByRole('button', { name: 'Available offline ✓' })).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Offline decks' }));
    });
    const list = screen.getByTestId('offline-decks-list');
    expect(within(list).getByText(/Borg Rush/)).toBeInTheDocument();
    expect(within(list).getByText(/3\.0 MB/)).toBeInTheDocument();
    expect(screen.getByTestId('offline-storage')).toHaveTextContent('Storage used: 2.0 MB of 100.0 MB');

    await act(async () => {
      fireEvent.click(within(list).getByRole('button', { name: 'Remove Borg Rush' }));
    });
    expect(mockRemoveOfflineDeck).toHaveBeenCalledWith(deck);
    expect(within(list).queryByText(/Borg Rush/)).not.toBeInTheDocument();
    expect(within(list).getByText('No offline decks yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make available offline' })).toBeEnabled();
  });
});

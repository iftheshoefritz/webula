// The practice table while offline (#1053): a deck that is not available offline shows the
// offline decks instead of the table, and Load deck shows them with no session or Drive request.
let mockSearchParamsValue = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => mockSearchParamsValue,
}));

jest.mock('../../../hooks/useDataFetching', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../../app/decks/deckBuilderUtils', () => ({
  ...jest.requireActual('../../../app/decks/deckBuilderUtils'),
  deckFromTsv: jest.fn(),
  extractDrawDeck: jest.fn(),
  shuffleArray: jest.fn((arr) => arr),
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('react-icons/fa', () => ({
  FaLayerGroup: () => null,
  FaMobileAlt: () => null,
  FaForward: () => null,
  FaTrash: () => null,
  FaFolder: () => null,
  FaFolderOpen: () => null,
  FaFolderPlus: () => null,
  FaSignInAlt: () => null,
  FaEdit: () => null,
  FaCheck: () => null,
  FaTimes: () => null,
  FaArrowLeft: () => null,
  FaExchangeAlt: () => null,
}));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

import React from 'react';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { OFFLINE_DECKS_KEY, OfflineDeck } from '../../../app/decks/practice/offlineDecks';
import { fingerprint } from '../../../app/decks/practice/savedGame';

const makeCards = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({
    collectorsinfo: `${prefix}${String(i + 1).padStart(3, '0')}`,
    originalName: `Card ${prefix}${i + 1}`,
    type: 'equipment',
    name: `card ${prefix}${i + 1}`,
    imagefile: `card_${prefix}${i + 1}`,
    pile: 'drawDeck',
    count: 1,
  }));

const deckOf = (cards: ReturnType<typeof makeCards>) =>
  Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

const builderCards = makeCards(10, '1U');
const builderDeck = deckOf(builderCards);
const offlineCards = makeCards(20, '9R');
const offlineDeck = deckOf(offlineCards);

const recordOf = (deck: ReturnType<typeof deckOf>, name: string): OfflineDeck => ({
  fingerprint: fingerprint(deck),
  name,
  deck,
  urls: [],
  bytes: 2048,
  dataVersion: '',
  savedAt: '2026-10-09T00:00:00.000Z',
});

let fetchMock: jest.Mock;

const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
};

const renderPage = async () => {
  await act(async () => {
    render(<PracticeDrawPage />);
  });
};

const drawPileCount = () => document.querySelector('[data-testid="draw-pile"]')?.getAttribute('data-pile-count');

describe('the practice table while offline (#1053)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(builderDeck));
    setOnline(false);

    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });
    (extractDrawDeck as jest.Mock).mockImplementation((deck) =>
      Object.values(deck).map((entry) => (entry as { row: unknown }).row),
    );
    (getSession as jest.Mock).mockResolvedValue(null);
    fetchMock = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    global.fetch = fetchMock as unknown as typeof fetch;

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

  afterAll(() => setOnline(true));

  it('shows the not-available message and the offline decks for a deck not in the record', async () => {
    localStorage.setItem(OFFLINE_DECKS_KEY, JSON.stringify([recordOf(offlineDeck, 'Offline deck')]));
    await renderPage();

    expect(screen.getByText('This deck is not available offline.')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="draw-pile"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play Offline deck' })).toBeInTheDocument();
  });

  it('deals the offline deck chosen from the message', async () => {
    localStorage.setItem(OFFLINE_DECKS_KEY, JSON.stringify([recordOf(offlineDeck, 'Offline deck')]));
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play Offline deck' }));
    });

    expect(screen.queryByText('This deck is not available offline.')).not.toBeInTheDocument();
    // 20 cards, a hand of 7.
    expect(drawPileCount()).toBe('13');
  });

  it('renders the table for a deck in the record', async () => {
    localStorage.setItem(OFFLINE_DECKS_KEY, JSON.stringify([recordOf(builderDeck, 'My deck')]));
    await renderPage();

    expect(screen.queryByText('This deck is not available offline.')).not.toBeInTheDocument();
    expect(drawPileCount()).toBe('3');
  });

  it('renders the table online for a deck not in the record', async () => {
    setOnline(true);
    await renderPage();

    expect(screen.queryByText('This deck is not available offline.')).not.toBeInTheDocument();
    expect(drawPileCount()).toBe('3');
  });

  it('keeps the table of a game dealt online when the connection drops', async () => {
    setOnline(true);
    await renderPage();
    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.queryByText('This deck is not available offline.')).not.toBeInTheDocument();
    expect(drawPileCount()).toBe('3');
  });

  it('Load deck shows the offline message and decks, and calls neither getSession nor /api/drive', async () => {
    localStorage.setItem(OFFLINE_DECKS_KEY, JSON.stringify([recordOf(builderDeck, 'My deck'), recordOf(offlineDeck, 'Offline deck')]));
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await renderPage();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load deck' }));
    });

    expect(screen.getByText('You are offline — Google Drive is not available.')).toBeInTheDocument();
    expect(screen.queryByText('Your decks')).not.toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/drive'), expect.anything());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play Offline deck' }));
    });

    expect(screen.queryByTestId('offline-deck-picker')).not.toBeInTheDocument();
    expect(drawPileCount()).toBe('13');
  });
});

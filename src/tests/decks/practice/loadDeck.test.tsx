// The game menu's Load deck item (#780): opens the Drive picker, and deals a new game from the
// chosen deck after a confirm.
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
  expandDeck: jest.fn(),
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
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getSession, signIn } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/page';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, expandDeck } from '../../../app/decks/deckBuilderUtils';
import { PRACTICE_DECK_TSV } from '../../../lib/practiceDeck';

const makeCards = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({
    collectorsinfo: `${prefix}${String(i + 1).padStart(3, '0')}`,
    originalName: `Card ${prefix}${i + 1}`,
    type: 'equipment',
    name: `card ${prefix}${i + 1}`,
    imagefile: `card_${prefix}${i + 1}`,
    pile: 'draw',
    count: 1,
  }));

const deckOf = (cards: ReturnType<typeof makeCards>) =>
  Object.fromEntries(cards.map((c) => [c.collectorsinfo, { count: 1, row: c }]));

// The builder's deck deals 3 cards to the draw pile (10 - a 7 card hand); the Drive deck deals 13.
const builderCards = makeCards(10, '1U');
const builderDeck = deckOf(builderCards);
const driveCards = makeCards(20, '9R');
const driveDeck = deckOf(driveCards);

const session = { expires: new Date(Date.now() + 3600_000).toISOString(), hasDriveScope: true };
const driveFile = { id: 'file-1', name: 'My Drive deck' };

let fetchMock: jest.Mock;

const drawPileIds = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^download from the draw pile$/i }));
  });
  const ids = Array.from(document.querySelectorAll('[data-zone="pile-panel-pile"] [data-card-id]'));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^close draw pile$/i }));
  });
  return ids;
};

const renderPage = async () => {
  await act(async () => {
    render(<PracticeDrawPage />);
  });
};

const openPicker = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Load deck' }));
  });
};

describe('Load deck in the practice game menu (#780)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(builderDeck));

    (useDataFetching as jest.Mock).mockReturnValue({ data: builderCards, loading: false });
    (deckFromTsv as jest.Mock).mockReturnValue(driveDeck);
    (expandDeck as jest.Mock).mockImplementation((deck) =>
      Object.values(deck).map((entry) => (entry as { row: unknown }).row),
    );
    (getSession as jest.Mock).mockResolvedValue(null);

    fetchMock = jest.fn((url: string) => {
      if (url.startsWith('/api/drive?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [driveFile] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve('drive deck tsv') });
    });
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

  it('has a Load deck item that closes the menu and opens the picker', async () => {
    await renderPage();

    await openPicker();

    expect(screen.getByRole('button', { name: 'Game menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Your decks')).toBeInTheDocument();
  });

  it('shows the sign-in button when signed out, and fetches no file list', async () => {
    await renderPage();

    await openPicker();

    const signInButton = screen.getByRole('button', { name: /sign in with google to load drive decks/i });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(signInButton);
    expect(signIn).toHaveBeenCalledWith(
      'google',
      { callbackUrl: '/decks/practice' },
      expect.objectContaining({ scope: expect.stringContaining('drive.appdata') }),
    );
  });

  it('deals the chosen deck after a confirm, closes the picker, and Reset deals it again', async () => {
    (getSession as jest.Mock).mockResolvedValue(session);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await renderPage();
    expect(await drawPileIds()).toHaveLength(3);

    await openPicker();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load My Drive deck' }));
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/drive/file-1', expect.objectContaining({ method: 'GET' }));
    expect(deckFromTsv).toHaveBeenCalledWith('drive deck tsv', builderCards);
    expect(screen.queryByText('Your decks')).not.toBeInTheDocument();
    expect(await drawPileIds()).toHaveLength(13);

    // Reset deals the loaded deck again, and the builder's deck stays as it was.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Game menu' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    });
    expect(await drawPileIds()).toHaveLength(13);
    expect(localStorage.getItem('currentDeck')).toBe(JSON.stringify(builderDeck));
  });

  it('keeps the game when the confirm is cancelled', async () => {
    (getSession as jest.Mock).mockResolvedValue(session);
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    await renderPage();

    await openPicker();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load My Drive deck' }));
    });

    expect(fetchMock).not.toHaveBeenCalledWith('/api/drive/file-1', expect.anything());
    expect(screen.getByText('Your decks')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText('×'));
    });
    expect(screen.queryByText('Your decks')).not.toBeInTheDocument();
    expect(await drawPileIds()).toHaveLength(3);
  });

  it('keeps the game when the deck fetch fails', async () => {
    (getSession as jest.Mock).mockResolvedValue(session);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/drive?')
        ? Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [driveFile] }) })
        : Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }),
    );
    await renderPage();

    await openPicker();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load My Drive deck' }));
    });

    expect(deckFromTsv).not.toHaveBeenCalled();
    expect(await drawPileIds()).toHaveLength(3);
  });

  it('still deals the fixture deck with ?fixture=1', async () => {
    mockSearchParamsValue = new URLSearchParams('fixture=1');
    await renderPage();

    expect(deckFromTsv).toHaveBeenCalledWith(PRACTICE_DECK_TSV, builderCards);
    expect(getSession).not.toHaveBeenCalled();
  });
});

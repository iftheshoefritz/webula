// The game menu's Edit current deck item (#1407): confirms, drops the saved game, and opens the
// dealt deck in the deck builder.
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

jest.mock('../../../app/decks/practice/editCurrentDeck', () => ({
  ...jest.requireActual('../../../app/decks/practice/editCurrentDeck'),
  navigateTo: jest.fn(),
}));

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
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv, extractDrawDeck } from '../../../app/decks/deckBuilderUtils';
import { navigateTo } from '../../../app/decks/practice/editCurrentDeck';

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

// The builder's deck holds 10 cards and the Drive deck 20. A deal deals no hand and leaves every card
// in the draw deck (#1115).
const builderCards = makeCards(10, '1U');
const builderDeck = deckOf(builderCards);
const driveCards = makeCards(20, '9R');
const driveDeck = deckOf(driveCards);

const session = { expires: new Date(Date.now() + 3600_000).toISOString(), hasDriveScope: true };
const driveFile = { id: 'file-1', name: 'My Drive deck' };

const renderPage = async () => {
  await act(async () => {
    render(<PracticeDrawPage />);
  });
};

// The splash opens on every load (#781), so only a reopen goes through the menu button.
const openMenu = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Game menu' }));
  });
};

const editDeck = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('game-menu-edit-deck'));
  });
};

const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
};

describe('Edit current deck in the practice game menu (#1407)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(builderDeck));
    setOnline(true);

    (useDataFetching as jest.Mock).mockReturnValue({ data: builderCards, loading: false });
    (deckFromTsv as jest.Mock).mockReturnValue(driveDeck);
    (extractDrawDeck as jest.Mock).mockImplementation((deck) =>
      Object.values(deck).map((entry) => (entry as { row: unknown }).row),
    );
    (getSession as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn((url: string) => {
      if (url.startsWith('/api/drive?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [driveFile] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve('drive deck tsv') });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('has the item in the game menu', async () => {
    await renderPage();
    expect(screen.getByTestId('game-menu-edit-deck')).toHaveTextContent('Edit current deck');
    expect(screen.getByTestId('game-menu-edit-deck')).not.toBeDisabled();
  });

  it('on Cancel, leaves the save and the page alone', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await renderPage();
    expect(localStorage.getItem('practiceGame')).not.toBeNull();
    await editDeck();

    expect(confirm).toHaveBeenCalledWith('Edit this deck? This will throw away the current game.');
    expect(localStorage.getItem('practiceGame')).not.toBeNull();
    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.queryByTestId('game-menu-splash')).not.toBeInTheDocument();
  });

  it('on OK, drops the save and goes back to the builder for the builder deck', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await renderPage();
    await editDeck();

    expect(localStorage.getItem('practiceGame')).toBeNull();
    expect(navigateTo).toHaveBeenCalledWith('/decks');
  });

  describe('a Drive deck', () => {
    const loadDriveDeck = async () => {
      (getSession as jest.Mock).mockResolvedValue(session);
      jest.spyOn(window, 'confirm').mockReturnValue(true);
      await renderPage();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Load deck' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Load the missions and draw deck of My Drive deck' }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Load the dilemmas of My Drive deck' }));
      });
      await openMenu();
    };

    it('opens the Drive file in the builder', async () => {
      await loadDriveDeck();
      await editDeck();

      expect(localStorage.getItem('practiceGame')).toBeNull();
      expect(navigateTo).toHaveBeenCalledWith('/decks?driveFile=file-1&name=My%20Drive%20deck');
    });

    it('signs in first when there is no session, and comes back to the builder', async () => {
      await loadDriveDeck();
      (getSession as jest.Mock).mockResolvedValue(null);
      await editDeck();

      expect(navigateTo).not.toHaveBeenCalled();
      expect(signIn).toHaveBeenCalledWith(
        'google',
        { callbackUrl: '/decks?driveFile=file-1&name=My%20Drive%20deck' },
        expect.objectContaining({ scope: expect.stringContaining('drive.appdata') }),
      );
    });
  });

  it('is disabled offline', async () => {
    await renderPage();
    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('game-menu-edit-deck')).toBeDisabled();
  });
});

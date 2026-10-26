// The two-step Load deck (#1114): the missions and draw deck of one deck, or of the deck dealt now,
// with the dilemmas of another Drive deck.
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
  shuffleArray: jest.fn((arr) => arr),
}));

const mockMakeOffline = jest.fn();
jest.mock('../../../app/decks/practice/offlineDecks', () => ({
  ...jest.requireActual('../../../app/decks/practice/offlineDecks'),
  useOfflineDecks: () => ({
    decks: [],
    progress: null,
    refreshing: false,
    failed: [],
    makeOffline: mockMakeOffline,
    remove: jest.fn(),
    isOffline: () => false,
  }),
}));

jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

jest.mock('posthog-js', () => ({ capture: jest.fn() }));

jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import PracticeDrawPage from '../../../app/decks/practice/PracticeTable';
import useDataFetching from '../../../hooks/useDataFetching';
import { deckFromTsv } from '../../../app/decks/deckBuilderUtils';
import { toSavedGame } from '../../../app/decks/practice/savedGame';
import { initialTableState } from '../../../app/decks/practice/tableReducer';
import { DeckList } from '../../../types';
import { OPPONENT_DILEMMAS, collectorsKey } from '../../../lib/dilemmaBot/opponentPile';
import { dilemmaIdOf } from '../../../lib/dilemmaBot/chulaPile';

const pileOf = (type: string) => (type === 'mission' ? 'mission' : type === 'dilemma' ? 'dilemmaPile' : 'drawDeck');

const makeDeck = (prefix: string, counts: { mission: number; equipment: number; dilemma: number }): DeckList =>
  Object.fromEntries(
    Object.entries(counts).flatMap(([type, n]) =>
      Array.from({ length: n }, (_, i) => {
        const key = `${prefix}-${type}-${i + 1}`;
        return [key, { count: 1, row: { collectorsinfo: key, name: key, originalName: key, imagefile: key, type, pile: pileOf(type) } }];
      })
    )
  );

const builderDeck = makeDeck('U', { mission: 1, equipment: 10, dilemma: 1 });
const deckA = makeDeck('A', { mission: 2, equipment: 12, dilemma: 3 });
const deckB = makeDeck('B', { mission: 1, equipment: 15, dilemma: 6 });
const fileA = { id: 'a', name: 'Deck A' };
const fileB = { id: 'b', name: 'Deck B' };

const session = { expires: new Date(Date.now() + 3600_000).toISOString(), hasDriveScope: true };

const keysOf = (deck: DeckList, prefix: string, type: string) =>
  Object.keys(deck).filter((k) => k.startsWith(`${prefix}-${type}-`));

const save = () => JSON.parse(localStorage.getItem('practiceGame')!);

const expectMixed = (dealt: DeckList) => {
  expect(keysOf(dealt, 'A', 'mission')).toHaveLength(2);
  expect(keysOf(dealt, 'A', 'equipment')).toHaveLength(12);
  expect(keysOf(dealt, 'A', 'dilemma')).toHaveLength(0);
  expect(keysOf(dealt, 'B', 'dilemma')).toHaveLength(6);
  expect(keysOf(dealt, 'B', 'mission')).toHaveLength(0);
  expect(keysOf(dealt, 'B', 'equipment')).toHaveLength(0);
};

const expectMixedTable = () => {
  const s = save();
  expectMixed(s.dealtDeck);
  expect(s.table.missions.filter((m: any) => m.mission)).toHaveLength(2);
  expect(s.table.dilemmaPile.map((c: any) => c.key).every((k: string) => k.startsWith('B-dilemma-'))).toBe(true);
  expect(s.table.dilemmaPile).toHaveLength(6);
  expect(s.table.drawDeck.length + s.table.hand.length).toBe(12);
};

const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

const renderPage = async () => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<PracticeDrawPage />);
  });
  return result!;
};

// The game menu splash opens on every load (#781), and closes after a pick.
const openMenu = async () => {
  if (!screen.queryByRole('button', { name: 'Load deck' })) await click('Game menu');
};

const openPicker = async () => {
  await openMenu();
  await click('Load deck');
};

// A whole deck loads in two steps (#1290): Missions + draw on the deck, then Dilemmas on the same deck.
const loadWholeDeck = async (name: string) => {
  await click(`Load the missions and draw deck of ${name}`);
  await click(`Load the dilemmas of ${name}`);
};

// The rows of the Chula pile in the card data, so `chulaPileDeck(data)` finds all 9 cards.
const chulaRows = OPPONENT_DILEMMAS.map((d) => {
  const key = collectorsKey(d.collectorsInfo);
  return { collectorsinfo: key, name: d.id, originalName: d.id, imagefile: key, type: 'dilemma', pile: 'dilemmaPile' };
});

let confirmSpy: jest.SpyInstance;

describe('the two-step Load deck (#1114)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(builderDeck));

    (useDataFetching as jest.Mock).mockReturnValue({ data: [], loading: false });
    (deckFromTsv as jest.Mock).mockImplementation((tsv: string) => ({ 'tsv-a': deckA, 'tsv-b': deckB })[tsv]);
    (getSession as jest.Mock).mockResolvedValue(session);
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    global.fetch = jest.fn((url: string) => {
      if (url.startsWith('/api/drive?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [fileA, fileB] }) });
      }
      const id = url.replace('/api/drive/', '');
      return Promise.resolve({ ok: true, json: () => Promise.resolve(`tsv-${id}`) });
    }) as unknown as typeof fetch;

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

  it('deals A\'s missions and draw deck with B\'s dilemmas after one confirmation, and Reset deals it again', async () => {
    await renderPage();
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Dilemmas for Deck A')).toBeInTheDocument();
    await click('Load the dilemmas of Deck B');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Dilemmas for Deck A')).not.toBeInTheDocument();
    expectMixedTable();
    expect(save()).toMatchObject({ source: 'drive', driveFileId: 'a', dilemmaDriveFileId: 'b' });

    await openMenu();
    await click('Reset');
    expectMixedTable();
    expect(localStorage.getItem('currentDeck')).toBe(JSON.stringify(builderDeck));
  });

  it('keeps the game when the confirm is cancelled', async () => {
    confirmSpy.mockReturnValue(false);
    await renderPage();
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    await click('Load the dilemmas of Deck B');

    expect(deckFromTsv).not.toHaveBeenCalled();
    expect(keysOf(save().dealtDeck, 'U', 'equipment')).toHaveLength(10);
  });

  it('with a game dealt from A, keeps its missions and draw deck and takes B\'s dilemmas', async () => {
    await renderPage();
    await openPicker();
    await loadWholeDeck('Deck A');
    expect(Object.keys(save().dealtDeck)).toEqual(Object.keys(deckA));
    expect(save().dilemmaDriveFileId).toBeUndefined();

    await openPicker();
    await click('Keep the current missions and draw deck');
    expect(screen.getByText('Dilemmas for the current missions and draw deck')).toBeInTheDocument();
    await click('Load the dilemmas of Deck B');

    expectMixedTable();
    expect(save()).toMatchObject({ source: 'drive', driveFileId: 'a', dilemmaDriveFileId: 'b' });
  });

  it('deals the whole deck on Dilemmas of the step-1 deck, with one confirm and one fetch (#1290)', async () => {
    await renderPage();
    await openPicker();
    await loadWholeDeck('Deck A');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => url === '/api/drive/a')).toHaveLength(1);
    expect(Object.keys(save().dealtDeck)).toEqual(Object.keys(deckA));
    expect(save().table.dilemmaPile).toHaveLength(3);
    expect(save()).toMatchObject({ source: 'drive', driveFileId: 'a' });
    expect(save().dilemmaDriveFileId).toBeUndefined();
    expect(save().table.opponent).toBeUndefined();
  });

  it('names both decks, for Make available offline', async () => {
    await renderPage();
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    await click('Load the dilemmas of Deck B');

    await openMenu();
    await click('Offline');
    await click('Make available offline');
    expect(mockMakeOffline).toHaveBeenCalledWith('Deck A + Deck B dilemmas', expect.anything());
  });

  it('names the current deck followed by the dilemma deck with "keep the current"', async () => {
    await renderPage();
    await openPicker();
    await loadWholeDeck('Deck A');
    await openPicker();
    await click('Keep the current missions and draw deck');
    await click('Load the dilemmas of Deck B');

    await openMenu();
    await click('Offline');
    await click('Make available offline');
    expect(mockMakeOffline).toHaveBeenCalledWith('Deck A + Deck B dilemmas', expect.anything());
  });

  it('restores a mixed game from the save, with both file ids', async () => {
    const { unmount } = await renderPage();
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    await click('Load the dilemmas of Deck B');
    const before = localStorage.getItem('practiceGame');
    unmount();

    await renderPage();
    expectMixedTable();
    expect(JSON.parse(localStorage.getItem('practiceGame')!).table).toEqual(JSON.parse(before!).table);
    expect(save()).toMatchObject({ source: 'drive', driveFileId: 'a', dilemmaDriveFileId: 'b' });

    await openMenu();
    await click('Reset');
    expectMixedTable();
  });

  it('still restores an old save with one driveFileId', async () => {
    // A save of a game dealt from deck A, as written before #1114.
    const table = { ...initialTableState, hand: [{ id: 'card-1', card: deckA['A-equipment-1'].row, face: 'up' }] } as any;
    const oldSave = toSavedGame(table, deckA, 'drive', 'a');
    expect(oldSave).not.toHaveProperty('dilemmaDriveFileId');
    localStorage.setItem('practiceGame', JSON.stringify(oldSave));

    // Reset deals deck A again, not the builder's deck, so the save restored as a Drive game.
    await renderPage();
    await openMenu();
    await click('Reset');
    expect(Object.keys(save().dealtDeck)).toEqual(Object.keys(deckA));
    expect(save()).toMatchObject({ source: 'drive', driveFileId: 'a' });
    expect(save()).not.toHaveProperty('dilemmaDriveFileId');
  });
});

describe('Play against the bot in the two-step Load deck (#1290)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsValue = new URLSearchParams();
    localStorage.clear();
    localStorage.setItem('currentDeck', JSON.stringify(builderDeck));

    (useDataFetching as jest.Mock).mockReturnValue({ data: chulaRows, loading: false });
    (deckFromTsv as jest.Mock).mockImplementation((tsv: string) => ({ 'tsv-a': deckA, 'tsv-b': deckB })[tsv]);
    (getSession as jest.Mock).mockResolvedValue(session);
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    global.fetch = jest.fn((url: string) => {
      if (url.startsWith('/api/drive?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [fileA, fileB] }) });
      }
      const id = url.replace('/api/drive/', '');
      return Promise.resolve({ ok: true, json: () => Promise.resolve(`tsv-${id}`) });
    }) as unknown as typeof fetch;

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

  const expectBotTable = () => {
    const s = save();
    expect(keysOf(s.dealtDeck, 'A', 'mission')).toHaveLength(2);
    expect(keysOf(s.dealtDeck, 'A', 'equipment')).toHaveLength(12);
    expect(keysOf(s.dealtDeck, 'A', 'dilemma')).toHaveLength(0);
    expect(s.table.missions.filter((m: any) => m.mission)).toHaveLength(2);
    expect(s.table.drawDeck.length + s.table.hand.length).toBe(12);
    expect(s.table.dilemmaPile).toHaveLength(27);
    expect(s.table.dilemmaPile.every((c: any) => dilemmaIdOf(s.dealtDeck[c.key]?.row) !== null)).toBe(true);
    expect(s.table.opponent).toBe('bot');
  };

  it('deals A\'s missions and draw deck with the Chula pile after one confirm, and Reset deals a bot game again', async () => {
    await renderPage();
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    expect(screen.getByRole('button', { name: 'Play against the bot' })).toBeInTheDocument();
    await click('Play against the bot');

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith('Load this deck? This will throw away the current game.');
    expect(screen.queryByText('Dilemmas for Deck A')).not.toBeInTheDocument();
    expectBotTable();
    expect(save()).toMatchObject({ source: 'drive', driveFileId: 'a' });
    expect(save().dilemmaDriveFileId).toBeUndefined();

    await openMenu();
    expect(screen.getByTestId('game-menu-bot-game')).toHaveTextContent('Deck A vs the bot');
    expect(screen.getByTestId('game-menu-bot-game')).not.toHaveTextContent('vs the bot vs the bot');
    await click('Reset');
    expectBotTable();
  });

  it('plays the bot with the current missions and draw deck', async () => {
    await renderPage();
    await openPicker();
    await loadWholeDeck('Deck A');
    await openPicker();
    await click('Keep the current missions and draw deck');
    await click('Play against the bot');

    expectBotTable();
    expect(save()).toMatchObject({ source: 'drive', driveFileId: 'a' });
  });

  it('keeps the game when the confirm is cancelled', async () => {
    confirmSpy.mockReturnValue(false);
    await renderPage();
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    await click('Play against the bot');

    expect(deckFromTsv).not.toHaveBeenCalled();
    expect(keysOf(save().dealtDeck, 'U', 'equipment')).toHaveLength(10);
    expect(save().table.opponent).toBeUndefined();
  });

  it('a close at step 2 deals nothing', async () => {
    await renderPage();
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    await act(async () => {
      fireEvent.click(screen.getByText('×'));
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(deckFromTsv).not.toHaveBeenCalled();
    expect(keysOf(save().dealtDeck, 'U', 'equipment')).toHaveLength(10);
  });

  it('a later Dilemmas load clears the bot flag', async () => {
    await renderPage();
    await openPicker();
    await click('Load the missions and draw deck of Deck A');
    await click('Play against the bot');
    expect(save().table.opponent).toBe('bot');

    await openPicker();
    await click('Keep the current missions and draw deck');
    await click('Load the dilemmas of Deck B');
    expect(save().table.opponent).toBeUndefined();
    expect(save().table.dilemmaPile.every((c: any) => c.key.startsWith('B-dilemma-'))).toBe(true);
    await openMenu();
    expect(screen.queryByTestId('game-menu-bot-game')).not.toBeInTheDocument();
  });
});

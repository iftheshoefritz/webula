jest.mock('posthog-js', () => ({ capture: jest.fn() }));
jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import { useDeckState } from '../../hooks/useDeckState';
import { useDriveSync } from '../../hooks/useDriveSync';
import { resetBeginnerDecksCache } from '../../lib/beginnerDecks';
import { resetChampionshipDecksCache } from '../../lib/championshipDecks';
import { makeCardData } from '../fixtures/makeCardData';

const data = [
  makeCardData({ collectorsinfo: '1M1', name: 'mission one', type: 'mission', originalName: 'Mission One' }),
  makeCardData({ collectorsinfo: '1E1', name: 'event one', type: 'event', originalName: 'Event One' }),
];

const beginnerDeck = (deckName: string, authorizedUse: boolean) => ({
  deckId: 41764,
  deckName,
  player: 'Lucas Thompson',
  file: `${deckName} - Lucas Thompson.txt`,
  source: 'https://www.trekcc.org/decklists/?mode=viewdeck&deckID=41764',
  complexity: 1,
  style: 'Mission Solver/Speed',
  article: 'Glory to you, and your house!',
  articleUrl: 'https://www.trekcc.org/articles/?viewArticle=2732',
  authorizedUse,
});
const klingon = beginnerDeck('Klingon Beginner Deck', true);
const hidden = beginnerDeck('Hidden Beginner Deck', false);
const klingonId = `beginner:${klingon.file}`;
const klingonTitle = 'Klingon Beginner Deck - Lucas Thompson';

const BEGINNER_TSV = 'Deck:\n1\tEvent One\nMissions:\n1\tMission One';

function useBuilder() {
  const deck = useDeckState({
    data,
    isFixture: false,
    onFullLoad: () => drive.clearDeckSource(),
  });
  const drive = useDriveSync({
    data,
    deckTitle: deck.deckTitle,
    createLackeyTSV: () => '',
    handleFileLoad: deck.handleFileLoad,
    loadDeckInRender: deck.loadDeckInRender,
    clearDirty: deck.clearDirty,
    deckIsEmpty: Object.keys(deck.currentDeck).length === 0,
  });
  return { deck, drive };
}

describe('useDriveSync – the Beginner Decks (#1323)', () => {
  const savedEnv = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    resetBeginnerDecksCache();
    resetChampionshipDecksCache();
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
    (getSession as jest.Mock).mockResolvedValue({
      user: { name: 'U', email: 'user@example.com' },
      expires: '2999-01-01T00:00:00Z',
      hasDriveScope: true,
    });
    fetchMock = jest.fn((url: string) => {
      if (url === '/beginner-decks/index.json') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([klingon, hidden]) });
      }
      if (url === `/beginner-decks/${encodeURIComponent(klingon.file)}`) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(BEGINNER_TSV) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = savedEnv;
  });

  async function openPicker() {
    const hook = renderHook(() => useBuilder());
    await waitFor(() => expect(hook.result.current.drive.session).not.toBeNull());
    await act(async () => { await hook.result.current.drive.openDeckPicker(); });
    await waitFor(() => expect(hook.result.current.drive.beginnerDecks.length).toBeGreaterThan(0));
    return hook;
  }

  it('shows the authorized decks to a user without early access', async () => {
    const { result } = await openPicker();
    expect(fetchMock).toHaveBeenCalledWith('/beginner-decks/index.json');
    expect(result.current.drive.showBeginnerDecks).toBe(true);
    expect(result.current.drive.showChampionshipDecks).toBe(false);
    expect(result.current.drive.beginnerDecks).toEqual([klingon]);
  });

  it('shows every deck to an early-access user', async () => {
    (getSession as jest.Mock).mockResolvedValue({
      user: { name: 'E', email: 'early@example.com' },
      expires: '2999-01-01T00:00:00Z',
      hasDriveScope: true,
    });
    const { result } = await openPicker();
    await waitFor(() => expect(result.current.drive.beginnerDecks).toEqual([klingon, hidden]));
  });

  it('loads a deck from public/beginner-decks/ with no Drive id, its title and its source', async () => {
    const { result } = await openPicker();
    await act(async () => { await result.current.drive.fetchDriveFile({ id: klingonId, name: klingonTitle }); });
    expect(fetchMock).toHaveBeenCalledWith(`/beginner-decks/${encodeURIComponent(klingon.file)}`);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringMatching(/^\/api\/drive\/beginner/), expect.anything());
    expect(result.current.deck.deckTitle).toBe(klingonTitle);
    expect(result.current.drive.deckFile).toEqual({ id: null, name: klingonTitle, source: klingon.source });
    expect(Object.keys(result.current.deck.currentDeck).sort()).toEqual(['1E1', '1M1']);
  });

  it('compares a deck under its title', async () => {
    const { result } = await openPicker();
    await act(async () => { await result.current.drive.fetchCompareDriveFile({ id: klingonId, name: 'ignored' }); });
    expect(result.current.drive.compareDeckName).toBe(klingonTitle);
    expect(result.current.drive.compareDeckRows.map((row) => row.collectorsinfo).sort()).toEqual(['1E1', '1M1']);
  });
});

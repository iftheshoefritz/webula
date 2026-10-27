jest.mock('posthog-js', () => ({ capture: jest.fn() }));
jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import { useDeckState } from '../../hooks/useDeckState';
import { useDriveSync } from '../../hooks/useDriveSync';
import { resetTournamentDecksCache } from '../../lib/tournamentDecks';
import { makeCardData } from '../fixtures/makeCardData';

const data = [
  makeCardData({ collectorsinfo: '1M1', name: 'mission one', type: 'mission', originalName: 'Mission One' }),
  makeCardData({ collectorsinfo: '1M2', name: 'mission two', type: 'mission', originalName: 'Mission Two' }),
  makeCardData({ collectorsinfo: '1E1', name: 'event one', type: 'event', originalName: 'Event One' }),
];

const ledos = {
  event: '2026 Worlds Day One',
  tournamentId: 13424,
  deckId: 54412,
  deckName: 'Common Ledos Deck',
  player: 'Michael Van Breemen',
  file: '2026 Worlds Day One - Common Ledos Deck - Michael Van Breemen.txt',
  source: 'https://www.trekcc.org/decklists/?mode=viewdeck&deckID=54412',
  authorizedUse: false,
};
const ledosId = `tournament:${ledos.file}`;
const ledosTitle = 'Common Ledos Deck - Michael Van Breemen - 2026 Worlds Day One';

const TOURNAMENT_TSV = 'Deck:\n1\tEvent One\nMissions:\n1\tMission One';
const DRIVE_TSV = 'Missions:\n1\tMission Two';

// The deck builder's wiring of the two hooks, as DeckBuilderClient does it.
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

describe('useDriveSync – loading a tournament deck (#1310)', () => {
  const savedEnv = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;

  beforeEach(() => {
    localStorage.clear();
    resetTournamentDecksCache();
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
    (getSession as jest.Mock).mockResolvedValue({
      user: { name: 'E', email: 'early@example.com' },
      expires: '2999-01-01T00:00:00Z',
      hasDriveScope: true,
    });
    global.fetch = jest.fn((url: string) => {
      if (url === '/tournament-decks/index.json') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([ledos]) });
      }
      if (url === `/tournament-decks/${encodeURIComponent(ledos.file)}`) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(TOURNAMENT_TSV) });
      }
      if (url.startsWith('/api/drive/')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(DRIVE_TSV) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = savedEnv;
  });

  async function openPickerWithDecks() {
    const hook = renderHook(() => useBuilder());
    await waitFor(() => expect(hook.result.current.drive.session).not.toBeNull());
    expect(hook.result.current.drive.showTournamentDecks).toBe(true);
    await act(async () => { await hook.result.current.drive.openDeckPicker(); });
    await waitFor(() => expect(hook.result.current.drive.tournamentEvents).toHaveLength(1));
    return hook;
  }

  it('a full load sets the title, a deckFile with no id, and the source', async () => {
    const { result } = await openPickerWithDecks();
    await act(async () => { await result.current.drive.fetchDriveFile({ id: ledosId, name: ledosTitle }); });
    expect(result.current.deck.deckTitle).toBe(ledosTitle);
    expect(result.current.drive.deckFile).toEqual({ id: null, name: ledosTitle, source: ledos.source });
    expect(Object.keys(result.current.deck.currentDeck).sort()).toEqual(['1E1', '1M1']);
    expect(result.current.drive.showDrivePicker).toBe(false);
  });

  it('a pile load merges the pile and leaves the title and deckFile alone', async () => {
    const { result } = await openPickerWithDecks();
    await act(async () => { await result.current.drive.fetchDriveFile({ id: 'drive-1', name: 'Drive Deck.txt' }); });
    await act(async () => { await result.current.drive.fetchDriveFile({ id: ledosId, name: ledosTitle }, ['mission']); });
    expect(result.current.deck.deckTitle).toBe('Drive Deck');
    expect(result.current.drive.deckFile).toEqual({ id: 'drive-1', name: 'Drive Deck.txt' });
    expect(Object.keys(result.current.deck.currentDeck)).toEqual(['1M1']);
  });

  it('a later Drive load or upload clears the source', async () => {
    const { result } = await openPickerWithDecks();
    await act(async () => { await result.current.drive.fetchDriveFile({ id: ledosId, name: ledosTitle }); });
    await act(async () => { await result.current.drive.fetchDriveFile({ id: 'drive-1', name: 'Drive Deck.txt' }); });
    expect(result.current.drive.deckFile).toEqual({ id: 'drive-1', name: 'Drive Deck.txt' });

    await act(async () => { await result.current.drive.fetchDriveFile({ id: ledosId, name: ledosTitle }); });
    expect(result.current.drive.deckFile.source).toBe(ledos.source);
    act(() => { result.current.drive.handleFilesLoad([{ name: 'upload.txt', content: DRIVE_TSV }]); });
    expect(result.current.drive.deckFile).toEqual({ id: null, name: ledosTitle });
    expect(result.current.deck.deckTitle).toBe('upload');
  });

  it('shows no folder to a signed-in user who is not on the list', async () => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'someone-else@example.com';
    const { result } = renderHook(() => useBuilder());
    await waitFor(() => expect(result.current.drive.session).not.toBeNull());
    expect(result.current.drive.showTournamentDecks).toBe(false);
  });
});

describe('useDriveSync – comparing a tournament deck (#1311)', () => {
  const savedEnv = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;

  beforeEach(() => {
    localStorage.clear();
    resetTournamentDecksCache();
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
    (getSession as jest.Mock).mockResolvedValue({
      user: { name: 'E', email: 'early@example.com' },
      expires: '2999-01-01T00:00:00Z',
      hasDriveScope: true,
    });
    global.fetch = jest.fn((url: string) => {
      if (url === '/tournament-decks/index.json') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([ledos]) });
      }
      if (url === `/tournament-decks/${encodeURIComponent(ledos.file)}`) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(TOURNAMENT_TSV) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = savedEnv;
  });

  it('fetches the index in compare mode, and sets the compare deck under its title', async () => {
    const { result } = renderHook(() => useBuilder());
    await waitFor(() => expect(result.current.drive.session).not.toBeNull());
    await act(async () => { await result.current.drive.openComparePicker(); });
    await waitFor(() => expect(result.current.drive.tournamentEvents).toHaveLength(1));
    await act(async () => { await result.current.drive.fetchCompareDriveFile({ id: ledosId, name: 'ignored' }); });
    expect(result.current.drive.compareDeckName).toBe(ledosTitle);
    expect(result.current.drive.compareDeckRows.map((row) => row.collectorsinfo).sort()).toEqual(['1E1', '1M1']);
    expect(result.current.deck.deckTitle).not.toBe(ledosTitle);
    expect(result.current.drive.showDrivePicker).toBe(false);
  });
});

import {
  fetchTournamentDeckText,
  fetchTournamentDecks,
  groupTournamentDecks,
  isTournamentDeckId,
  resetTournamentDecksCache,
  tournamentDeckId,
  tournamentDeckTitle,
  tournamentDeckUrl,
} from '../../lib/tournamentDecks';
import type { TournamentDeck } from '../../lib/tournamentDecks';

const deck = (event: string, deckName: string, player: string): TournamentDeck => ({
  event,
  tournamentId: 1,
  deckId: 2,
  deckName,
  player,
  file: `${event} - ${deckName} - ${player}.txt`,
  source: 'https://www.trekcc.org/decklists/?mode=viewdeck&deckID=2',
});

describe('tournamentDecks', () => {
  afterEach(() => {
    resetTournamentDecksCache();
    jest.restoreAllMocks();
  });

  it('groups the decks by event, in index order', () => {
    const decks = [deck('B', 'one', 'p1'), deck('A', 'two', 'p2'), deck('B', 'three', 'p3')];
    expect(groupTournamentDecks(decks)).toEqual([
      { event: 'B', decks: [decks[0], decks[2]] },
      { event: 'A', decks: [decks[1]] },
    ]);
  });

  it('gives a deck a tournament: id that is not a Drive id', () => {
    const id = tournamentDeckId(deck('E', 'D', 'P'));
    expect(id).toBe('tournament:E - D - P.txt');
    expect(isTournamentDeckId(id)).toBe(true);
    expect(isTournamentDeckId('1AbcDriveId')).toBe(false);
  });

  it('titles a deck <deckName> - <player> - <event>', () => {
    expect(tournamentDeckTitle(deck('2026 Worlds Day One', 'Common Ledos Deck', 'Michael Van Breemen')))
      .toBe('Common Ledos Deck - Michael Van Breemen - 2026 Worlds Day One');
  });

  it('encodes a file name with spaces and non-ASCII characters', async () => {
    const id = tournamentDeckId({ file: "2026 Worlds - Kazon's Rüstung - Zoë.txt" });
    expect(tournamentDeckUrl(id)).toBe(`/tournament-decks/${encodeURIComponent("2026 Worlds - Kazon's Rüstung - Zoë.txt")}`);
    expect(tournamentDeckUrl(id)).toContain('2026%20Worlds');
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('Deck:') });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchTournamentDeckText(id)).resolves.toBe('Deck:');
    expect(fetchMock).toHaveBeenCalledWith(tournamentDeckUrl(id));
  });

  it('fetches the index once a session', async () => {
    const decks = [deck('E', 'D', 'P')];
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(decks) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchTournamentDecks()).resolves.toEqual(decks);
    await expect(fetchTournamentDecks()).resolves.toEqual(decks);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/tournament-decks/index.json');
  });
});

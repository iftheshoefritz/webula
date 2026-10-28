import { readFileSync } from 'fs';
import { join } from 'path';
import {
  fetchChampionshipDeckText,
  fetchChampionshipDecks,
  groupChampionshipDecks,
  isChampionshipDeckId,
  resetChampionshipDecksCache,
  championshipDeckId,
  championshipDeckTitle,
  championshipDeckUrl,
  currentChampionshipDeckId,
  findChampionshipDeck,
} from '../../lib/championshipDecks';
import type { ChampionshipDeck } from '../../lib/championshipDecks';

const deck = (event: string, deckName: string, player: string): ChampionshipDeck => ({
  event,
  tournamentId: 1,
  deckId: 2,
  deckName,
  player,
  file: `${event} - ${deckName} - ${player}.txt`,
  source: 'https://www.trekcc.org/decklists/?mode=viewdeck&deckID=2',
  authorizedUse: false,
});

describe('championshipDecks', () => {
  afterEach(() => {
    resetChampionshipDecksCache();
    jest.restoreAllMocks();
  });

  it('groups the decks by event, in index order', () => {
    const decks = [deck('B', 'one', 'p1'), deck('A', 'two', 'p2'), deck('B', 'three', 'p3')];
    expect(groupChampionshipDecks(decks)).toEqual([
      { event: 'B', decks: [decks[0], decks[2]] },
      { event: 'A', decks: [decks[1]] },
    ]);
  });

  it('gives a deck a championship: id that is not a Drive id', () => {
    const id = championshipDeckId(deck('E', 'D', 'P'));
    expect(id).toBe('championship:E - D - P.txt');
    expect(isChampionshipDeckId(id)).toBe(true);
    expect(isChampionshipDeckId('1AbcDriveId')).toBe(false);
  });

  it('resolves a championship: id and an old tournament: id of the same file to the same deck (#1326)', () => {
    const decks = [deck('A', 'one', 'p1'), deck('E', 'D', 'P')];
    const newId = championshipDeckId(decks[1]);
    const oldId = `tournament:${decks[1].file}`;
    expect(isChampionshipDeckId(oldId)).toBe(true);
    expect(findChampionshipDeck(decks, newId)).toBe(decks[1]);
    expect(findChampionshipDeck(decks, oldId)).toBe(decks[1]);
    expect(championshipDeckUrl(oldId)).toBe(championshipDeckUrl(newId));
    expect(currentChampionshipDeckId(oldId)).toBe(newId);
    expect(currentChampionshipDeckId('1AbcDriveId')).toBe('1AbcDriveId');
    expect(findChampionshipDeck(decks, '1AbcDriveId')).toBeUndefined();
  });

  it('titles a deck <deckName> - <player> - <event>', () => {
    expect(championshipDeckTitle(deck('2026 Worlds Day One', 'Common Ledos Deck', 'Michael Van Breemen')))
      .toBe('Common Ledos Deck - Michael Van Breemen - 2026 Worlds Day One');
  });

  it('encodes a file name with spaces and non-ASCII characters', async () => {
    const id = championshipDeckId({ file: "2026 Worlds - Kazon's Rüstung - Zoë.txt" });
    expect(championshipDeckUrl(id)).toBe(`/championship-decks/${encodeURIComponent("2026 Worlds - Kazon's Rüstung - Zoë.txt")}`);
    expect(championshipDeckUrl(id)).toContain('2026%20Worlds');
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('Deck:') });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchChampionshipDeckText(id)).resolves.toBe('Deck:');
    expect(fetchMock).toHaveBeenCalledWith(championshipDeckUrl(id));
  });

  it('fetches the index once a session', async () => {
    const decks = [deck('E', 'D', 'P')];
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(decks) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchChampionshipDecks()).resolves.toEqual(decks);
    await expect(fetchChampionshipDecks()).resolves.toEqual(decks);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/championship-decks/index.json');
  });

  it('gives every row of the real index an authorizedUse of true or false', () => {
    const rows = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'championship-decks', 'index.json'), 'utf-8')
    ) as ChampionshipDeck[];
    const missing = rows.filter((row) => typeof row.authorizedUse !== 'boolean').map((row) => row.file);
    expect(missing).toEqual([]);
  });
});

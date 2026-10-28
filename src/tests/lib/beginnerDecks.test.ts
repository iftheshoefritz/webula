import { readFileSync } from 'fs';
import { join } from 'path';
import {
  beginnerDeckDetails,
  beginnerDeckId,
  beginnerDeckTitle,
  beginnerDeckUrl,
  fetchBeginnerDeckText,
  fetchBeginnerDecks,
  findBeginnerDeck,
  isBeginnerDeckId,
  resetBeginnerDecksCache,
  visibleBeginnerDecks,
} from '../../lib/beginnerDecks';
import type { BeginnerDeck } from '../../lib/beginnerDecks';
import { isChampionshipDeckId } from '../../lib/championshipDecks';
import { findPublicDeck, isPublicDeckId } from '../../lib/publicDecks';

const deck = (deckName: string, authorizedUse = true): BeginnerDeck => ({
  deckId: 1,
  deckName,
  player: 'Lucas Thompson',
  file: `${deckName} - Lucas Thompson.txt`,
  source: 'https://www.trekcc.org/decklists/?mode=viewdeck&deckID=1',
  complexity: 1,
  style: 'Mission Solver/Speed',
  article: 'An article',
  articleUrl: 'https://www.trekcc.org/articles/?viewArticle=1',
  authorizedUse,
});

describe('beginnerDecks (#1323)', () => {
  const savedEnv = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;

  afterEach(() => {
    resetBeginnerDecksCache();
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = savedEnv;
    jest.restoreAllMocks();
  });

  it('gives a deck a beginner: id that round-trips and is neither a Drive nor a Championship id', () => {
    const klingon = deck('Klingon Beginner Deck');
    const id = beginnerDeckId(klingon);
    expect(id).toBe('beginner:Klingon Beginner Deck - Lucas Thompson.txt');
    expect(isBeginnerDeckId(id)).toBe(true);
    expect(isChampionshipDeckId(id)).toBe(false);
    expect(isPublicDeckId(id)).toBe(true);
    expect(isBeginnerDeckId('1AbcDriveId')).toBe(false);
    expect(findBeginnerDeck([deck('TOS Beginner Deck'), klingon], id)).toBe(klingon);
    expect(findBeginnerDeck([klingon], '1AbcDriveId')).toBeUndefined();
  });

  it('titles a deck <deckName> - <player>, and describes its level and style', () => {
    const klingon = deck('Klingon Beginner Deck');
    expect(beginnerDeckTitle(klingon)).toBe('Klingon Beginner Deck - Lucas Thompson');
    expect(beginnerDeckDetails(klingon)).toBe('Level 1 · Mission Solver/Speed');
    expect(findPublicDeck(beginnerDeckId(klingon), [], [klingon])).toEqual({
      title: 'Klingon Beginner Deck - Lucas Thompson',
      source: klingon.source,
    });
  });

  it('encodes the file name in the URL', () => {
    expect(beginnerDeckUrl('beginner:Klingon Beginner Deck - Lucas Thompson.txt'))
      .toBe('/beginner-decks/Klingon%20Beginner%20Deck%20-%20Lucas%20Thompson.txt');
  });

  it('fetches the index once', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([deck('A')]) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchBeginnerDecks();
    await fetchBeginnerDecks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/beginner-decks/index.json');
  });

  it('tries again after a failed fetch', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([deck('A')]) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchBeginnerDecks()).rejects.toThrow('Beginner deck index: 500');
    await expect(fetchBeginnerDecks()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects an index body that is not a list, and tries again', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ files: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([deck('A')]) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchBeginnerDecks()).rejects.toThrow('not a list');
    await expect(fetchBeginnerDecks()).resolves.toHaveLength(1);
  });

  it('fetches a deck text from its encoded URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('Deck:') });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchBeginnerDeckText('beginner:A B.txt')).resolves.toBe('Deck:');
    expect(fetchMock).toHaveBeenCalledWith('/beginner-decks/A%20B.txt');
  });

  it('shows a deck without authorizedUse only to an early-access user', () => {
    process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
    const decks = [deck('A'), deck('B', false)];
    expect(visibleBeginnerDecks(decks, 'early@example.com')).toEqual(decks);
    expect(visibleBeginnerDecks(decks, 'other@example.com')).toEqual([decks[0]]);
    expect(visibleBeginnerDecks(decks, null)).toEqual([decks[0]]);
  });

  it('has an index row for every deck file, each one authorized', () => {
    const folder = join(process.cwd(), 'public', 'beginner-decks');
    const index: BeginnerDeck[] = JSON.parse(readFileSync(join(folder, 'index.json'), 'utf-8'));
    expect(index).toHaveLength(14);
    for (const row of index) {
      expect(readFileSync(join(folder, row.file), 'utf-8').length).toBeGreaterThan(0);
      expect(row.authorizedUse).toBe(true);
    }
  });
});

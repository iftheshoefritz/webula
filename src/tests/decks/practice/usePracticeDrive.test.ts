// The practice table's picker fetches the indexes of the Championship and Beginner folders, and the
// text of a folder deck (#1389).
jest.mock('next-auth/react', () => ({
  getSession: jest.fn(),
  signIn: jest.fn(),
}));

import { act, renderHook, waitFor } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import { usePracticeDrive } from '../../../app/decks/practice/usePracticeDrive';
import { resetChampionshipDecksCache } from '../../../lib/championshipDecks';
import type { ChampionshipDeck } from '../../../lib/championshipDecks';
import { resetBeginnerDecksCache } from '../../../lib/beginnerDecks';
import type { BeginnerDeck } from '../../../lib/beginnerDecks';
import { beginnerPickerFile, championshipPickerFile } from '../../../lib/publicDecks';

const championshipRow = (file: string, authorizedUse: boolean, event = 'Worlds'): ChampionshipDeck => ({
  event,
  tournamentId: 1,
  deckId: 2,
  deckName: `Deck ${file}`,
  player: 'Player',
  file,
  source: 'https://www.trekcc.org/decklists/?deckID=2',
  authorizedUse,
});

const beginnerRow = (file: string, authorizedUse: boolean): BeginnerDeck => ({
  deckId: 3,
  deckName: `Beginner ${file}`,
  player: 'Lucas Thompson',
  file,
  source: 'https://www.trekcc.org/decklists/?deckID=3',
  complexity: 1,
  style: 'Mission Solver/Speed',
  article: 'Article',
  articleUrl: 'https://www.trekcc.org/articles/',
  authorizedUse,
});

const championshipRows = [
  championshipRow('one.txt', true),
  championshipRow('two.txt', false),
  championshipRow('three.txt', true, 'Continentals'),
];
const beginnerRows = [beginnerRow('b1.txt', true), beginnerRow('b2.txt', false)];

const signedIn = {
  expires: new Date(Date.now() + 3600_000).toISOString(),
  hasDriveScope: true,
  user: { name: 'Early', email: 'early@example.com' },
};

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve(body) });
const notOk = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve(null), text: () => Promise.resolve('') });

let fetchMock: jest.Mock;
const urls = () => fetchMock.mock.calls.map(([url]) => url as string);

const routes = (overrides: Record<string, () => Promise<unknown>> = {}) =>
  jest.fn((url: string) => {
    if (overrides[url]) return overrides[url]();
    if (url === '/api/championship-decks') return ok(championshipRows);
    if (url === '/beginner-decks/index.json') return ok(beginnerRows);
    if (url.startsWith('/api/drive?')) return ok({ files: [{ id: 'drive-1', name: 'Drive deck' }] });
    return ok('deck text');
  });

const ORIGINAL_EARLY_ACCESS = process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS;

beforeEach(() => {
  resetChampionshipDecksCache();
  resetBeginnerDecksCache();
  process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = 'early@example.com';
  fetchMock = routes();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  process.env.NEXT_PUBLIC_EARLY_ACCESS_EMAILS = ORIGINAL_EARLY_ACCESS;
});

const openPicker = async () => {
  const { result } = renderHook(() => usePracticeDrive());
  await act(async () => {
    await result.current.openPicker();
  });
  return result;
};

describe('usePracticeDrive folder indexes', () => {
  it('fetches both indexes and no Drive list when signed out, and shows only authorizedUse rows', async () => {
    (getSession as jest.Mock).mockResolvedValue(null);
    const result = await openPicker();

    await waitFor(() => expect(result.current.beginnerDecks).toHaveLength(1));
    expect(urls()).toEqual(expect.arrayContaining(['/api/championship-decks', '/beginner-decks/index.json']));
    expect(urls().some((url) => url.startsWith('/api/drive'))).toBe(false);
    expect(result.current.championshipEvents).toEqual([
      { event: 'Worlds', decks: [championshipRows[0]] },
      { event: 'Continentals', decks: [championshipRows[2]] },
    ]);
    expect(result.current.beginnerDecks).toEqual([beginnerRows[0]]);
    expect(result.current.driveFiles).toEqual([]);
  });

  it('filters the rows again on the client, even when the route returns them', async () => {
    (getSession as jest.Mock).mockResolvedValue({ ...signedIn, user: { name: 'Other', email: 'other@example.com' } });
    const result = await openPicker();

    await waitFor(() => expect(result.current.championshipEvents).toHaveLength(2));
    expect(result.current.championshipEvents.flatMap((e) => e.decks).map((d) => d.file)).toEqual(['one.txt', 'three.txt']);
  });

  it('fetches the Drive list too when signed in, and shows every row to an early-access user', async () => {
    (getSession as jest.Mock).mockResolvedValue(signedIn);
    const result = await openPicker();

    await waitFor(() => expect(result.current.beginnerDecks).toHaveLength(2));
    expect(urls()).toContain('/api/drive?includeFolders=true');
    expect(result.current.driveFiles).toEqual([{ id: 'drive-1', name: 'Drive deck' }]);
    expect(result.current.championshipEvents.flatMap((e) => e.decks)).toEqual(championshipRows);
  });

  it('leaves a folder empty when its index fetch fails, and the Drive list still loads', async () => {
    fetchMock = routes({ '/api/championship-decks': notOk });
    global.fetch = fetchMock as unknown as typeof fetch;
    (getSession as jest.Mock).mockResolvedValue(signedIn);
    const result = await openPicker();

    await waitFor(() => expect(result.current.beginnerDecks).toHaveLength(2));
    expect(result.current.championshipEvents).toEqual([]);
    expect(result.current.driveFiles).toEqual([{ id: 'drive-1', name: 'Drive deck' }]);
  });

  it('leaves the Beginner folder empty when its index fetch fails', async () => {
    fetchMock = routes({ '/beginner-decks/index.json': () => Promise.reject(new TypeError('Failed to fetch')) });
    global.fetch = fetchMock as unknown as typeof fetch;
    (getSession as jest.Mock).mockResolvedValue(null);
    const result = await openPicker();

    await waitFor(() => expect(result.current.championshipEvents).toHaveLength(2));
    expect(result.current.beginnerDecks).toEqual([]);
  });
});

describe('usePracticeDrive fetchDeckTsv', () => {
  const fetchText = async (id: string) => {
    const { result } = renderHook(() => usePracticeDrive());
    let text: string | null = null;
    await act(async () => {
      text = await result.current.fetchDeckTsv({ id });
    });
    return text;
  };

  it('fetches a championship: id from the Championship route', async () => {
    expect(await fetchText('championship:one deck.txt')).toBe('deck text');
    expect(urls()).toEqual(['/api/championship-decks/one%20deck.txt']);
  });

  it('fetches a beginner: id from the Beginner folder', async () => {
    expect(await fetchText('beginner:b1.txt')).toBe('deck text');
    expect(urls()).toEqual(['/beginner-decks/b1.txt']);
  });

  it('fetches any other id from Drive', async () => {
    expect(await fetchText('drive-1')).toBe('deck text');
    expect(fetchMock).toHaveBeenCalledWith('/api/drive/drive-1', expect.objectContaining({ method: 'GET' }));
  });

  it.each(['championship:one.txt', 'beginner:b1.txt', 'drive-1'])('yields null for a non-OK response to %s', async (id) => {
    fetchMock = jest.fn(notOk);
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await fetchText(id)).toBeNull();
  });
});

describe('the picker file of a folder deck', () => {
  it('names a deck by its title', () => {
    expect(championshipPickerFile(championshipRows[0])).toEqual({ id: 'championship:one.txt', name: 'Deck one.txt - Player - Worlds' });
    expect(beginnerPickerFile(beginnerRows[0])).toEqual({ id: 'beginner:b1.txt', name: 'Beginner b1.txt - Lucas Thompson' });
  });
});

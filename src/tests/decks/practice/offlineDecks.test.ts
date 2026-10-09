jest.mock('posthog-js', () => ({
  __esModule: true,
  default: { capture: jest.fn(), init: jest.fn() },
}));

import { act, renderHook } from '@testing-library/react';
import {
  CARD_BACK_URL,
  CARD_DATA_URL,
  OFFLINE_CACHE_NAME,
  OFFLINE_DECKS_KEY,
  OfflineDeck,
  addOfflineDeck,
  deckUrls,
  downloadUrls,
  findOfflineDeck,
  makeDeckOffline,
  OFFLINE_REFRESH_CACHE_NAME,
  readOfflineDecks,
  refreshOfflineDecks,
  removeOfflineDeck,
  useOfflineDecks,
} from '../../../app/decks/practice/offlineDecks';
import { fingerprint } from '../../../app/decks/practice/savedGame';
import { DeckList } from '../../../types';

const row = (key: string, extra: Record<string, any> = {}) => ({
  collectorsinfo: key,
  originalName: `Card ${key}`,
  imagefile: `img-${key}`,
  ...extra,
});

const deckOf = (...rows: any[]): DeckList =>
  Object.fromEntries(rows.map((r) => [r.collectorsinfo, { row: r, count: 1 }]));

// A Cache Storage stand-in: a map from URL to a response-like object.
const mockCaches = () => {
  const store = new Map<string, any>();
  const cache = {
    match: jest.fn(async (url: string) => store.get(url)),
    put: jest.fn(async (url: string, response: any) => {
      store.set(url, response);
    }),
    delete: jest.fn(async (url: string) => store.delete(url)),
  };
  (global as any).caches = { open: jest.fn(async () => cache) };
  return { store, cache };
};

const response = (bytes: number, headers: Record<string, string> = {}) => ({
  ok: true,
  status: 200,
  headers: { get: (name: string) => ({ 'Content-Length': String(bytes), ...headers })[name] ?? null },
});

const record = (deck: DeckList, urls: string[], name = 'Deck'): OfflineDeck => ({
  fingerprint: fingerprint(deck),
  name,
  deck,
  urls,
  bytes: 0,
  dataVersion: '',
  savedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  delete (global as any).caches;
});

describe('deckUrls', () => {
  it('lists each front, each back, the card back and the data file, with no duplicates', () => {
    const deck = deckOf(
      row('1', { backimagefile: 'back-1' }),
      row('2', { backimagefile: '' }),
      row('3', { imagefile: 'img-2' }),
    );
    const urls = deckUrls(deck, []);
    expect(urls.sort()).toEqual(
      [
        '/cardimages/img-1.jpg',
        '/cardimages/back-1.jpg',
        '/cardimages/img-2.jpg',
        CARD_BACK_URL,
        CARD_DATA_URL,
      ].sort(),
    );
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('fills the back of a mission saved before #765 from the card data', () => {
    const deck = deckOf(row('m', { imagefile: 'mission-front' }));
    const data = [{ imagefile: 'mission-front', backimagefile: 'mission-back' }];
    expect(deckUrls(deck, data)).toContain('/cardimages/mission-back.jpg');
  });

  it('leaves out a card with no copies', () => {
    const deck: DeckList = { a: { row: row('a'), count: 0 } };
    expect(deckUrls(deck, [])).toEqual([CARD_BACK_URL, CARD_DATA_URL]);
  });
});

describe('the record of offline decks', () => {
  it('adds a deck and finds it by the fingerprint of an equal DeckList', () => {
    const deck = deckOf(row('1'), row('2'));
    addOfflineDeck(record(deck, ['/a']));
    expect(readOfflineDecks()).toHaveLength(1);
    // A copy with the keys in another order is the same deck.
    expect(findOfflineDeck(deckOf(row('2'), row('1')))?.name).toBe('Deck');
    expect(findOfflineDeck(deckOf(row('3')))).toBeUndefined();
  });

  it('replaces the record of a deck added again', () => {
    const deck = deckOf(row('1'));
    addOfflineDeck(record(deck, [], 'Old'));
    addOfflineDeck(record(deck, [], 'New'));
    expect(readOfflineDecks().map((d) => d.name)).toEqual(['New']);
  });

  it('reads a broken record as no decks', () => {
    localStorage.setItem(OFFLINE_DECKS_KEY, '{not json');
    expect(readOfflineDecks()).toEqual([]);
  });

  it('removes a deck and keeps in the cache the URLs another offline deck needs', async () => {
    const { store, cache } = mockCaches();
    ['/shared', '/only-a', '/only-b'].forEach((url) => store.set(url, response(1)));
    const a = deckOf(row('a'));
    const b = deckOf(row('b'));
    addOfflineDeck(record(a, ['/shared', '/only-a']));
    addOfflineDeck(record(b, ['/shared', '/only-b']));

    const kept = await removeOfflineDeck(a);

    expect(kept.map((d) => d.fingerprint)).toEqual([fingerprint(b)]);
    expect(findOfflineDeck(a)).toBeUndefined();
    expect(cache.delete).toHaveBeenCalledTimes(1);
    expect(Array.from(store.keys()).sort()).toEqual(['/only-b', '/shared']);
  });
});

describe('the download', () => {
  it('caches each URL and reports progress', async () => {
    const { store } = mockCaches();
    global.fetch = jest.fn(async () => response(100)) as any;
    const onProgress = jest.fn();

    const result = await downloadUrls(['/a', '/b', '/c'], onProgress);

    expect(result).toEqual({ bytes: 300, failed: [] });
    expect(store.size).toBe(3);
    expect(onProgress).toHaveBeenLastCalledWith({ done: 3, total: 3, bytes: 300 });
    expect(onProgress.mock.calls.map(([p]) => p.done)).toEqual([0, 1, 2, 3]);
  });

  it('skips a URL that is already cached', async () => {
    const { store } = mockCaches();
    store.set('/a', response(50));
    global.fetch = jest.fn(async () => response(100)) as any;

    const result = await downloadUrls(['/a', '/b']);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/b');
    expect(result.bytes).toBe(150);
  });

  it('leaves a deck not offline when a URL fails, and a retry fetches only that URL', async () => {
    const { store } = mockCaches();
    const deck = deckOf(row('1'), row('2'));
    const failing = '/cardimages/img-2.jpg';
    global.fetch = jest.fn(async (url: string) => {
      if (url === failing) throw new TypeError('Failed to fetch');
      return response(10, url === CARD_DATA_URL ? { ETag: '"v1"' } : {});
    }) as any;

    const first = await makeDeckOffline('My deck', deck, []);

    expect(first).toEqual({ offline: false, failed: [{ url: failing, name: 'Card 2' }] });
    expect(findOfflineDeck(deck)).toBeUndefined();
    expect(store.has(failing)).toBe(false);
    expect(store.size).toBe(3);

    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockImplementation(async () => response(10));
    const retry = await makeDeckOffline('My deck', deck, []);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(failing);
    expect(retry.offline).toBe(true);
    const saved = findOfflineDeck(deck);
    expect(saved).toMatchObject({ name: 'My deck', bytes: 40, dataVersion: '"v1"', deck });
    expect(saved?.urls).toHaveLength(4);
  });

  it('reports a response that is not ok as failed', async () => {
    mockCaches();
    global.fetch = jest.fn(async () => ({ ...response(0), ok: false, status: 404 })) as any;
    expect((await downloadUrls(['/a'])).failed).toEqual(['/a']);
  });

  it('reports every URL as failed when there is no Cache Storage', async () => {
    global.fetch = jest.fn() as any;
    expect(await downloadUrls(['/a'])).toEqual({ bytes: 0, failed: ['/a'] });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('useOfflineDecks', () => {
  it('makes a deck offline, then removes it', async () => {
    mockCaches();
    global.fetch = jest.fn(async () => response(5)) as any;
    const deck = deckOf(row('1'));
    const { result } = renderHook(() => useOfflineDecks([]));

    await act(async () => {
      await result.current.makeOffline('My deck', deck);
    });
    expect(result.current.decks).toHaveLength(1);
    expect(result.current.isOffline(deck)).toBe(true);
    expect(result.current.progress).toBeNull();

    await act(async () => {
      await result.current.remove(deck);
    });
    expect(result.current.decks).toEqual([]);
    expect(result.current.isOffline(deck)).toBe(false);
  });

  it('keeps the failed cards of the last download', async () => {
    mockCaches();
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as any;
    const { result } = renderHook(() => useOfflineDecks([]));

    await act(async () => {
      await result.current.makeOffline('My deck', deckOf(row('1')));
    });
    expect(result.current.failed.map((f) => f.name).sort()).toEqual(['Card 1', 'Card back', 'Card data']);
    expect(result.current.decks).toEqual([]);
  });
});

// Cache Storage with one cache per name, so a test can tell the offline cache from the cache a
// refresh downloads into.
const mockCacheStorage = () => {
  const stores = new Map<string, Map<string, any>>();
  const storeOf = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  const cacheOf = (name: string) => {
    const store = storeOf(name);
    return {
      match: jest.fn(async (url: string) => store.get(url)),
      put: jest.fn(async (url: string, r: any) => {
        store.set(url, r);
      }),
      delete: jest.fn(async (url: string) => store.delete(url)),
    };
  };
  (global as any).caches = {
    open: jest.fn(async (name: string) => cacheOf(name)),
    delete: jest.fn(async (name: string) => stores.delete(name)),
  };
  return { offline: storeOf(OFFLINE_CACHE_NAME), stores };
};

const fetchedUrls = () => (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method !== 'HEAD').map(([url]) => url);

describe('the refresh when the card data changes', () => {
  const deckA = deckOf(row('1'));
  const deckB = deckOf(row('2'));
  const urlsA = ['/cardimages/img-1.jpg', CARD_BACK_URL, CARD_DATA_URL];
  const urlsB = ['/cardimages/img-2.jpg', CARD_BACK_URL, CARD_DATA_URL];
  const allUrls = ['/cardimages/img-1.jpg', '/cardimages/img-2.jpg', CARD_BACK_URL, CARD_DATA_URL];

  // Two offline decks made with the card data `"v1"`, with their old copies cached.
  const setUp = () => {
    const caches = mockCacheStorage();
    allUrls.forEach((url) => caches.offline.set(url, { ...response(1), old: true }));
    addOfflineDeck({ ...record(deckA, urlsA, 'A'), dataVersion: '"v1"' });
    addOfflineDeck({ ...record(deckB, urlsB, 'B'), dataVersion: '"v1"' });
    return caches;
  };

  const server = (version: string, fail: (url: string) => boolean = () => false) =>
    jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') return response(0, { ETag: version });
      if (fail(url)) throw new TypeError('Failed to fetch');
      return { ...response(10, { ETag: version }), fresh: url };
    }) as any;

  it('re-downloads every URL of every offline deck and records the new version', async () => {
    const { offline, stores } = setUp();
    global.fetch = server('"v2"');
    const onProgress = jest.fn();

    const result = await refreshOfflineDecks(onProgress);

    expect(result.refreshed).toBe(true);
    expect(fetchedUrls().map((url: string) => url.split('?')[0]).sort()).toEqual([...allUrls].sort());
    // The query keeps the service worker from answering out of the offline cache.
    fetchedUrls().forEach((url: string) => expect(url).toContain('?v='));
    allUrls.forEach((url) => {
      expect(offline.get(url).old).toBeUndefined();
      expect(offline.get(url).fresh).toContain(url);
    });
    expect(readOfflineDecks().map((d) => [d.name, d.dataVersion, d.bytes])).toEqual([
      ['A', '"v2"', 30],
      ['B', '"v2"', 30],
    ]);
    expect(onProgress).toHaveBeenLastCalledWith({ done: 4, total: 4, bytes: 40 });
    expect(stores.has(OFFLINE_REFRESH_CACHE_NAME)).toBe(false);
  });

  it('downloads nothing when the version has not changed', async () => {
    const { offline } = setUp();
    global.fetch = server('"v1"');

    const result = await refreshOfflineDecks();

    expect(result).toEqual({ refreshed: false, reason: 'up-to-date' });
    expect(fetchedUrls()).toEqual([]);
    allUrls.forEach((url) => expect(offline.get(url).old).toBe(true));
  });

  it('downloads nothing when the server names no version or cannot be reached', async () => {
    setUp();
    global.fetch = jest.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as any;

    expect(await refreshOfflineDecks()).toEqual({ refreshed: false, reason: 'unknown-version' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the old copies and the old version when the refresh fails half way', async () => {
    const { offline, stores } = setUp();
    global.fetch = server('"v2"', (url) => url.startsWith('/cardimages/img-2.jpg'));

    const result = await refreshOfflineDecks();

    expect(result).toEqual({ refreshed: false, reason: 'failed', failed: ['/cardimages/img-2.jpg'] });
    allUrls.forEach((url) => expect(offline.get(url).old).toBe(true));
    expect(readOfflineDecks().map((d) => d.dataVersion)).toEqual(['"v1"', '"v1"']);
    expect(stores.has(OFFLINE_REFRESH_CACHE_NAME)).toBe(false);
  });

  it('does nothing with no offline decks', async () => {
    mockCacheStorage();
    global.fetch = jest.fn() as any;
    expect(await refreshOfflineDecks()).toEqual({ refreshed: false, reason: 'no-decks' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('runs on load in useOfflineDecks and shows the new version', async () => {
    setUp();
    global.fetch = server('"v2"');
    const { result } = renderHook(() => useOfflineDecks([]));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.decks.map((d) => d.dataVersion)).toEqual(['"v2"', '"v2"']);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.progress).toBeNull();
  });
});

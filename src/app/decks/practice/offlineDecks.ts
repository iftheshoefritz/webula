// The offline decks of the practice table (#1050, part 1 of #1047). A deck made available
// offline has its card images and the card data in one Cache Storage cache, and a record in
// localStorage that holds the deck itself, so an offline player can pick it with no Drive.
//
// The helpers here need no React. `useOfflineDecks` at the bottom wraps them for the page.

import { useCallback, useEffect, useRef, useState } from 'react';
import { DeckList } from '../../../types';
import { withBackImageFiles } from '../deckBuilderUtils';
import { fingerprint } from './savedGame';
import { CARD_DATA_URL, OFFLINE_CACHE_NAME } from './offlineCache';

export { CARD_DATA_URL, OFFLINE_CACHE_NAME };

export const OFFLINE_DECKS_KEY = 'practiceOfflineDecks';
export const CARD_BACK_URL = '/cardimages/cardback.jpg';
const DOWNLOAD_CONCURRENCY = 4;

export interface OfflineDeck {
  fingerprint: string;
  name: string;
  deck: DeckList;
  urls: string[];
  bytes: number;
  // The ETag or Last-Modified of the card data file the deck was made with, '' when unknown.
  dataVersion: string;
  savedAt: string;
}

export interface DownloadProgress {
  done: number;
  total: number;
  bytes: number;
}

export interface FailedUrl {
  url: string;
  name: string;
}

export type MakeOfflineResult =
  | { offline: true; record: OfflineDeck }
  | { offline: false; failed: FailedUrl[] };

const imageUrl = (imagefile: string): string => `/cardimages/${imagefile}.jpg`;

// Every URL the deck needs offline, with no duplicates: each front, each back (filled from
// `data` for a mission of a deck saved before #765), the card back and the card data file.
export function deckUrls(deck: DeckList, data: any[]): string[] {
  const rows = withBackImageFiles(
    Object.values(deck).filter((entry) => (entry?.count ?? 0) > 0).map((entry) => entry.row),
    data,
  );
  const urls = new Set<string>();
  rows.forEach((row) => {
    if (row?.imagefile) urls.add(imageUrl(row.imagefile));
    if (row?.backimagefile) urls.add(imageUrl(row.backimagefile));
  });
  urls.add(CARD_BACK_URL);
  urls.add(CARD_DATA_URL);
  return Array.from(urls);
}

// The card name for each URL of the deck, so a failed download can name the cards it misses.
const urlNames = (deck: DeckList, data: any[]): Map<string, string> => {
  const names = new Map<string, string>([
    [CARD_BACK_URL, 'Card back'],
    [CARD_DATA_URL, 'Card data'],
  ]);
  withBackImageFiles(Object.values(deck).map((entry) => entry.row), data).forEach((row) => {
    const name = row?.originalName ?? row?.name ?? row?.imagefile;
    if (row?.imagefile) names.set(imageUrl(row.imagefile), name);
    if (row?.backimagefile) names.set(imageUrl(row.backimagefile), `${name} (back)`);
  });
  return names;
};

// The record. Every localStorage access is in a try/catch, as the saved game's is (#976).
export function readOfflineDecks(): OfflineDeck[] {
  try {
    const raw = localStorage.getItem(OFFLINE_DECKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeOfflineDecks(decks: OfflineDeck[]): void {
  try {
    localStorage.setItem(OFFLINE_DECKS_KEY, JSON.stringify(decks));
  } catch {
    // A full or blocked localStorage keeps the old record.
  }
}

// Adds the deck, or replaces the record of a deck with the same fingerprint.
export function addOfflineDeck(record: OfflineDeck): OfflineDeck[] {
  const decks = [...readOfflineDecks().filter((d) => d.fingerprint !== record.fingerprint), record];
  writeOfflineDecks(decks);
  return decks;
}

export function findOfflineDeck(deck: DeckList): OfflineDeck | undefined {
  const key = fingerprint(deck);
  return readOfflineDecks().find((d) => d.fingerprint === key);
}

const openCache = async (): Promise<Cache | null> => {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(OFFLINE_CACHE_NAME);
  } catch {
    return null;
  }
};

// Drops the deck's record, then deletes from the cache only the URLs no other offline deck needs.
export async function removeOfflineDeck(deck: DeckList): Promise<OfflineDeck[]> {
  const key = fingerprint(deck);
  const all = readOfflineDecks();
  const removed = all.find((d) => d.fingerprint === key);
  const kept = all.filter((d) => d.fingerprint !== key);
  writeOfflineDecks(kept);
  if (!removed) return kept;
  const stillNeeded = new Set(kept.flatMap((d) => d.urls));
  const cache = await openCache();
  if (cache) {
    await Promise.all(
      removed.urls.filter((url) => !stillNeeded.has(url)).map((url) => cache.delete(url).catch(() => false)),
    );
  }
  return kept;
}

const responseBytes = async (response: Response): Promise<number> => {
  const length = Number(response.headers?.get('Content-Length'));
  if (Number.isFinite(length) && length > 0) return length;
  try {
    return (await response.clone().blob()).size;
  } catch {
    return 0;
  }
};

// Fetches each URL into `cache`, a few at a time. A URL already in the cache is not fetched again,
// so decks share bytes and a retry fetches only what is missing. A failed URL does not stop the
// rest; it is returned in `failed`. `sizes` holds the bytes of each URL that is now cached.
async function downloadInto(
  cache: Cache,
  urls: string[],
  onProgress?: (progress: DownloadProgress) => void,
  fetchUrl: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<{ bytes: number; failed: string[]; sizes: Map<string, number> }> {
  const failed: string[] = [];
  const sizes = new Map<string, number>();
  let bytes = 0;
  let done = 0;
  let next = 0;
  const report = () => onProgress?.({ done, total: urls.length, bytes });

  const fetchOne = async (url: string) => {
    try {
      // `bytes += await …` would read `bytes` before the await and lose the other workers' sums.
      const cached = await cache.match(url);
      if (cached) {
        const size = await responseBytes(cached);
        sizes.set(url, size);
        bytes += size;
        return;
      }
      const response = await fetchUrl(url);
      if (!response.ok) throw new Error(`${response.status}`);
      const size = await responseBytes(response);
      await cache.put(url, response);
      sizes.set(url, size);
      bytes += size;
    } catch {
      failed.push(url);
    }
  };

  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      await fetchOne(url);
      done += 1;
      report();
    }
  };

  report();
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, urls.length) }, worker));
  return { bytes, failed: urls.filter((url) => failed.includes(url)), sizes };
}

// Fetches each URL into the offline cache. `bytes` counts every URL of the list, cached before or
// now.
export async function downloadUrls(
  urls: string[],
  onProgress?: (progress: DownloadProgress) => void,
): Promise<{ bytes: number; failed: string[] }> {
  const cache = await openCache();
  if (!cache) return { bytes: 0, failed: [...urls] };
  const { bytes, failed } = await downloadInto(cache, urls, onProgress);
  return { bytes, failed };
}

// The version of the card data in a set of headers: the ETag, else the Last-Modified, else ''.
const versionOf = (headers: Headers | undefined): string =>
  headers?.get('ETag') ?? headers?.get('Last-Modified') ?? '';

const cachedDataVersion = async (): Promise<string> => {
  const cache = await openCache();
  const response = cache ? await cache.match(CARD_DATA_URL) : undefined;
  return versionOf(response?.headers);
};

// The version of the card data the server has now, '' when the server cannot be reached or names
// none. A HEAD request never matches the offline cache (`Cache.match` ignores every method but
// GET), so the service worker sends it on to the network.
export async function fetchLiveDataVersion(): Promise<string> {
  try {
    const response = await fetch(CARD_DATA_URL, { method: 'HEAD', cache: 'no-store' });
    return response.ok ? versionOf(response.headers) : '';
  } catch {
    return '';
  }
}

// The download of a refresh goes into this cache first, so the offline cache keeps the old copy
// until every new one is in (#1054).
export const OFFLINE_REFRESH_CACHE_NAME = `${OFFLINE_CACHE_NAME}-refresh`;

export type RefreshResult =
  | { refreshed: false; reason: 'no-decks' | 'unknown-version' | 'up-to-date' | 'no-cache' }
  | { refreshed: false; reason: 'failed'; failed: string[] }
  | { refreshed: true; decks: OfflineDeck[]; dataVersion: string };

// When the card data on the server differs from the one an offline deck was made with, downloads
// the data file and every URL of every offline deck again (#1054, part 5 of #1047). An image file
// is rewritten under the same name, so the new copy replaces the old one by URL.
//
// The new copies go into a separate cache, and only once every URL is in do they replace the old
// ones and the record takes the new version. A refresh that fails, or a player who goes offline in
// the middle of it, leaves the old copies and the old version in place, so the next online load
// tries again.
export async function refreshOfflineDecks(
  onProgress?: (progress: DownloadProgress) => void,
): Promise<RefreshResult> {
  const decks = readOfflineDecks();
  if (decks.length === 0) return { refreshed: false, reason: 'no-decks' };
  const live = await fetchLiveDataVersion();
  if (!live) return { refreshed: false, reason: 'unknown-version' };
  if (decks.every((d) => d.dataVersion === live)) return { refreshed: false, reason: 'up-to-date' };

  const cache = await openCache();
  if (!cache) return { refreshed: false, reason: 'no-cache' };
  let staging: Cache;
  try {
    await caches.delete(OFFLINE_REFRESH_CACHE_NAME);
    staging = await caches.open(OFFLINE_REFRESH_CACHE_NAME);
  } catch {
    return { refreshed: false, reason: 'no-cache' };
  }

  const urls = Array.from(new Set([CARD_DATA_URL, ...decks.flatMap((d) => d.urls)]));
  // The service worker answers a GET of a cached URL from the offline cache. A query it has never
  // seen does not match, so the worker sends the request to the network, and the response is
  // stored under the plain URL.
  const stamp = encodeURIComponent(live);
  const { failed, sizes } = await downloadInto(staging, urls, onProgress, (url) =>
    fetch(`${url}?v=${stamp}`, { cache: 'no-store' }),
  );
  if (failed.length > 0) {
    await caches.delete(OFFLINE_REFRESH_CACHE_NAME).catch(() => false);
    return { refreshed: false, reason: 'failed', failed };
  }

  try {
    for (const url of urls) {
      const response = await staging.match(url);
      if (response) await cache.put(url, response);
    }
  } catch {
    // A full cache keeps the old record, so the next online load copies again.
    await caches.delete(OFFLINE_REFRESH_CACHE_NAME).catch(() => false);
    return { refreshed: false, reason: 'failed', failed: [] };
  }
  await caches.delete(OFFLINE_REFRESH_CACHE_NAME).catch(() => false);

  // A deck added or removed while the refresh ran keeps its own record.
  const refreshed = new Set(urls);
  const updated = readOfflineDecks().map((d) =>
    d.urls.every((url) => refreshed.has(url))
      ? {
          ...d,
          dataVersion: live,
          bytes: d.urls.reduce((sum, url) => sum + (sizes.get(url) ?? 0), 0),
        }
      : d,
  );
  writeOfflineDecks(updated);
  return { refreshed: true, decks: updated, dataVersion: live };
}

// Downloads every URL of the deck and records the deck offline only when all of them are cached.
// Otherwise it returns the failed URLs with their card names, and calling it again fetches only
// those.
export async function makeDeckOffline(
  name: string,
  deck: DeckList,
  data: any[],
  onProgress?: (progress: DownloadProgress) => void,
): Promise<MakeOfflineResult> {
  const urls = deckUrls(deck, data);
  const { bytes, failed } = await downloadUrls(urls, onProgress);
  if (failed.length > 0) {
    const names = urlNames(deck, data);
    return { offline: false, failed: failed.map((url) => ({ url, name: names.get(url) ?? url })) };
  }
  const record: OfflineDeck = {
    fingerprint: fingerprint(deck),
    name,
    deck,
    urls,
    bytes,
    dataVersion: await cachedDataVersion(),
    savedAt: new Date().toISOString(),
  };
  addOfflineDeck(record);
  return { offline: true, record };
}

// The page's view of the offline decks: the record, the progress of a running download, and the
// cards that failed in the last one. Online, on load and when the network comes back, it refreshes
// the offline decks whose card data is out of date (#1054); `refreshing` is true while it does.
export function useOfflineDecks(data: any[]) {
  const [decks, setDecks] = useState<OfflineDeck[]>(() => readOfflineDecks());
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [failed, setFailed] = useState<FailedUrl[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // One download at a time: a refresh and a Make available offline share `progress`.
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    busyRef.current = true;
    try {
      const result = await refreshOfflineDecks((p) => {
        setRefreshing(true);
        setProgress(p);
      });
      if (result.refreshed) setDecks(result.decks);
    } finally {
      busyRef.current = false;
      setRefreshing(false);
      setProgress(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  const makeOffline = useCallback(
    async (name: string, deck: DeckList): Promise<MakeOfflineResult> => {
      busyRef.current = true;
      setFailed([]);
      setProgress({ done: 0, total: 0, bytes: 0 });
      try {
        const result = await makeDeckOffline(name, deck, data, setProgress);
        if (!result.offline) setFailed(result.failed);
        setDecks(readOfflineDecks());
        return result;
      } finally {
        busyRef.current = false;
        setProgress(null);
      }
    },
    [data],
  );

  const remove = useCallback(async (deck: DeckList) => {
    setDecks(await removeOfflineDeck(deck));
  }, []);

  const isOffline = useCallback(
    (deck: DeckList) => decks.some((d) => d.fingerprint === fingerprint(deck)),
    [decks],
  );

  return { decks, progress, refreshing, failed, makeOffline, remove, isOffline };
}

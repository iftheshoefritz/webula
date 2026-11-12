'use client';
// The playtest cards of a playtester (#1614), merged after the public cards on `/`, `/decks` and
// `/decks/reports`. The server pages hand over only the public cards, which show at once; the
// playtest cards come from `/api/playtest/cards` on the client, never through a server component,
// and join when they arrive. A 404 (not a playtester), a failed request or any other answer leaves
// the public cards alone, with no error and no log.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { CardData } from '../lib/parseCardData';
import { PLAYTEST_SET, setPlaytestImageVersion } from '../lib/cardImageUrl';
import { PLAYTEST_CARDS_URL } from '../app/decks/practice/offlineCache';

export interface PlaytestCards {
  rows: CardData[];
  // The version of the upload, for the image URLs; null until a 200 arrives.
  version: number | null;
  // Whether the request has settled (#1615): a 200, a 404 or a failure, or no request to make. A
  // deck resolved by name waits for it, so a playtest card it names is not dropped.
  settled: boolean;
}

const NO_PLAYTEST_CARDS: PlaytestCards = { rows: [], version: null, settled: true };
const PENDING_PLAYTEST_CARDS: PlaytestCards = { rows: [], version: null, settled: false };

const PlaytestCardsContext = createContext<PlaytestCards>(NO_PLAYTEST_CARDS);

// The rows of a `{ version, tsv }` answer, each with `set` `playtest` whatever the owner's `Set`
// column says. Version 0 with an empty TSV, before the first upload, is no rows. The parser, and
// d3 with it, loads only when a playtester's cards arrive.
export async function playtestRowsOf(tsv: string): Promise<CardData[]> {
  if (!tsv.trim()) return [];
  const { parseCardData } = await import('../lib/parseCardData');
  return parseCardData(tsv).data.map((row) => ({ ...row, set: PLAYTEST_SET }));
}

export async function fetchPlaytestCards(): Promise<PlaytestCards> {
  try {
    const response = await fetch(PLAYTEST_CARDS_URL);
    if (!response.ok) return NO_PLAYTEST_CARDS;
    const body = await response.json();
    if (typeof body?.version !== 'number' || typeof body?.tsv !== 'string') return NO_PLAYTEST_CARDS;
    return { rows: await playtestRowsOf(body.tsv), version: body.version, settled: true };
  } catch {
    return NO_PLAYTEST_CARDS;
  }
}

// Offline the session request fails, so a playtester reads as signed out. The request is made then
// too, and the service worker answers it from the offline cache of a deck made offline with
// playtest cards (#1615); with no cached copy it fails, which is no playtest cards.
const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const OFFLINE_KEY = '\u0000offline';

// Fetches once per signed-in user, and drops the cards on a sign-out or a switch of account.
export function PlaytestCardsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  // Read once: a page that loaded offline keeps what it fetched then.
  const [offline] = useState(browserOffline);
  const email =
    status === 'authenticated'
      ? (session?.user?.email ?? '')
      : status === 'unauthenticated' && offline
        ? OFFLINE_KEY
        : null;
  const [loaded, setLoaded] = useState<{ email: string; cards: PlaytestCards } | null>(null);

  useEffect(() => {
    if (email === null) return;
    let cancelled = false;
    fetchPlaytestCards().then((cards) => {
      if (cancelled) return;
      setPlaytestImageVersion(cards.version);
      setLoaded({ email, cards });
    });
    return () => { cancelled = true; };
  }, [email]);

  const value =
    loaded !== null && loaded.email === email
      ? loaded.cards
      : status === 'loading' || email !== null
        ? PENDING_PLAYTEST_CARDS
        : NO_PLAYTEST_CARDS;
  useEffect(() => {
    if (value === NO_PLAYTEST_CARDS || value === PENDING_PLAYTEST_CARDS) setPlaytestImageVersion(null);
  }, [value]);

  return <PlaytestCardsContext.Provider value={value}>{children}</PlaytestCardsContext.Provider>;
}

export function usePlaytestCards(): PlaytestCards {
  return useContext(PlaytestCardsContext);
}

// The public cards, then the playtest cards of a playtester. With none, the public array itself.
export function useWithPlaytestCards(publicData: CardData[]): CardData[] {
  const { rows } = usePlaytestCards();
  return useMemo(() => (rows.length === 0 ? publicData : [...publicData, ...rows]), [publicData, rows]);
}

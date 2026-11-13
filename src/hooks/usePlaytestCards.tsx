'use client';
// The playtest cards of a playtester (#1614), merged after the public cards on `/`, `/decks` and
// `/decks/reports`. The server pages hand over only the public cards, which show at once; the
// playtest cards come from `/api/playtest/cards` on the client, never through a server component,
// and join when they arrive. A 404 (not a playtester), a failed request or any other answer leaves
// the public cards alone, with no error and no log.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { CardData } from '../lib/parseCardData';
import { setPlaytestImageVersions } from '../lib/cardImageUrl';
import { PLAYTEST_CARDS_URL } from '../app/decks/practice/offlineCache';

// A playtest set in testing (#1644): the picker's option, and the version of its image URLs.
export interface PlaytestSetInfo {
  // The name as the owner wrote it in the `Set` column.
  label: string;
  // The name lowercased, the `set` of its rows.
  value: string;
  version: number;
}

export interface PlaytestCards {
  rows: CardData[];
  // The sets in testing, by name; none until a 200 arrives.
  sets: PlaytestSetInfo[];
  // Whether the request has settled (#1615): a 200, a 404 or a failure, or no request to make. A
  // deck resolved by name waits for it, so a playtest card it names is not dropped.
  settled: boolean;
}

const NO_PLAYTEST_CARDS: PlaytestCards = { rows: [], sets: [], settled: true };
const PENDING_PLAYTEST_CARDS: PlaytestCards = { rows: [], sets: [], settled: false };

const PlaytestCardsContext = createContext<PlaytestCards>(NO_PLAYTEST_CARDS);

// The rows of the TSV of one set, each with its own `set`, the owner's `Set` column lowercased
// (#1644). An empty TSV is no rows. The parser, and d3 with it, loads only when a playtester's
// cards arrive.
export async function playtestRowsOf(tsv: string): Promise<CardData[]> {
  if (!tsv.trim()) return [];
  const { parseCardData } = await import('../lib/parseCardData');
  return parseCardData(tsv).data;
}

// A set of a `{ sets: [{ name, version, tsv }] }` answer, as the cards route writes it.
const isSetAnswer = (set: unknown): set is { name: string; version: number; tsv: string } =>
  typeof (set as { name?: unknown })?.name === 'string' &&
  typeof (set as { version?: unknown })?.version === 'number' &&
  typeof (set as { tsv?: unknown })?.tsv === 'string';

// An answer of another shape, the `{ version, tsv }` of before #1644 in an offline cache too, is
// no cards.
export async function fetchPlaytestCards(): Promise<PlaytestCards> {
  try {
    const response = await fetch(PLAYTEST_CARDS_URL);
    if (!response.ok) return NO_PLAYTEST_CARDS;
    const body = await response.json();
    if (!Array.isArray(body?.sets) || !body.sets.every(isSetAnswer)) return NO_PLAYTEST_CARDS;
    const answers = body.sets as { name: string; version: number; tsv: string }[];
    const rows = (await Promise.all(answers.map((set) => playtestRowsOf(set.tsv)))).flat();
    const sets = answers
      .map(({ name, version }) => ({ label: name, value: name.toLowerCase(), version }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return { rows, sets, settled: true };
  } catch {
    return NO_PLAYTEST_CARDS;
  }
}

const versionsOf = (sets: PlaytestSetInfo[]) => new Map(sets.map((set) => [set.value, set.version]));

// Offline the session request fails, so a playtester reads as signed out. The request is made then
// too, and the service worker answers it from the offline cache of a deck made offline with
// playtest cards (#1615); with no cached copy it fails, which is no playtest cards.
const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const OFFLINE_KEY = '\u0000offline';

// Fetches once per signed-in user, and drops the cards on a switch of account.
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
      setPlaytestImageVersions(versionsOf(cards.sets));
      setLoaded({ email, cards });
    });
    return () => { cancelled = true; };
  }, [email]);

  // A session that reads as signed out after this page loaded the cards keeps them (#1625). Every
  // sign-out of the app (`signOut`) leaves the page, so the only way to get there in place is a
  // session refetch that failed: next-auth refetches on `visibilitychange`, and when an iPad wakes
  // before its network is back the fetch fails, next-auth takes that as signed out, and stops
  // refetching on later visibility changes. Dropping the cards then took the image version away,
  // and every playtest card of the restored game showed `CardMissing.jpg`. The image route still
  // checks the caller, so a user who really is signed out gets a 404 and `showCardMissing`.
  const keepAfterSignOut = loaded !== null && status === 'unauthenticated' && email === null;
  const value =
    loaded !== null && (loaded.email === email || keepAfterSignOut)
      ? loaded.cards
      : status === 'loading' || email !== null
        ? PENDING_PLAYTEST_CARDS
        : NO_PLAYTEST_CARDS;
  useEffect(() => {
    if (value === NO_PLAYTEST_CARDS || value === PENDING_PLAYTEST_CARDS) setPlaytestImageVersions(new Map());
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

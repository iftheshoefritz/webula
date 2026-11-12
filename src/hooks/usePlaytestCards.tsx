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

export interface PlaytestCards {
  rows: CardData[];
  // The version of the upload, for the image URLs; null until a 200 arrives.
  version: number | null;
}

const NO_PLAYTEST_CARDS: PlaytestCards = { rows: [], version: null };

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
    const response = await fetch('/api/playtest/cards');
    if (!response.ok) return NO_PLAYTEST_CARDS;
    const body = await response.json();
    if (typeof body?.version !== 'number' || typeof body?.tsv !== 'string') return NO_PLAYTEST_CARDS;
    return { rows: await playtestRowsOf(body.tsv), version: body.version };
  } catch {
    return NO_PLAYTEST_CARDS;
  }
}

// Fetches once per signed-in user, and drops the cards on a sign-out or a switch of account.
export function PlaytestCardsProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const email = status === 'authenticated' ? (session?.user?.email ?? '') : null;
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

  const value = loaded !== null && loaded.email === email ? loaded.cards : NO_PLAYTEST_CARDS;
  useEffect(() => {
    if (value === NO_PLAYTEST_CARDS) setPlaytestImageVersion(null);
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

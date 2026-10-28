// The server side of the Championship decks (#1327): the top-level `championship-decks/` folder, read
// from disk. Nothing under `public/` holds the decks, so a deck reaches a browser only through
// `/api/championship-decks`, and only when `visibleChampionshipDecks` lets the caller see it.
// `outputFileTracingIncludes` in `next.config.mjs` puts the folder into the routes' function bundle.

import { readFile } from 'fs/promises';
import { join } from 'path';
import { getToken } from 'next-auth/jwt';
import { visibleChampionshipDecks } from './championshipDecks';
import type { ChampionshipDeck } from './championshipDecks';

export const CHAMPIONSHIP_DECKS_DIR = join(process.cwd(), 'championship-decks');

export async function readChampionshipIndex(): Promise<ChampionshipDeck[]> {
  return JSON.parse(await readFile(join(CHAMPIONSHIP_DECKS_DIR, 'index.json'), 'utf-8'));
}

// The email of the signed-in caller, from the NextAuth JWT; null for a signed-out caller.
export async function callerEmail(req: Request): Promise<string | null> {
  try {
    const token = await getToken({ req: req as Parameters<typeof getToken>[0]['req'], secret: process.env.NEXTAUTH_SECRET });
    return typeof token?.email === 'string' ? token.email : null;
  } catch {
    return null;
  }
}

// The rows the caller may see.
export async function visibleChampionshipIndex(email: string | null): Promise<ChampionshipDeck[]> {
  return visibleChampionshipDecks(await readChampionshipIndex(), email);
}

// The text of a deck the caller may see; null for a file name that is not a visible row of the index.
// The name is looked up in the index, never joined into a path as it came.
export async function readVisibleChampionshipDeck(file: string, email: string | null): Promise<string | null> {
  const deck = (await visibleChampionshipIndex(email)).find((row) => row.file === file);
  if (!deck) return null;
  return readFile(join(CHAMPIONSHIP_DECKS_DIR, deck.file), 'utf-8');
}

// One dispatch for the decks of the public folders (#1323): is an id a public deck's, where is its
// text, and what title and trekcc.org page does it load with.

import { championshipDeckTitle, fetchChampionshipDeckText, findChampionshipDeck, isChampionshipDeckId } from './championshipDecks';
import type { ChampionshipDeck } from './championshipDecks';
import { beginnerDeckTitle, fetchBeginnerDeckText, findBeginnerDeck, isBeginnerDeckId } from './beginnerDecks';
import type { BeginnerDeck } from './beginnerDecks';

export const isPublicDeckId = (id: string) => isChampionshipDeckId(id) || isBeginnerDeckId(id);

// The text of a public deck, from its folder under `public/`.
export const fetchPublicDeckText = (id: string) =>
  isBeginnerDeckId(id) ? fetchBeginnerDeckText(id) : fetchChampionshipDeckText(id);

// The title and the trekcc.org decklist of the public deck an id names; undefined for an id that is
// not a public deck's, or a deck whose index has not loaded.
export function findPublicDeck(
  id: string,
  championshipDecks: ChampionshipDeck[],
  beginnerDecks: BeginnerDeck[],
): { title: string; source: string } | undefined {
  if (isChampionshipDeckId(id)) {
    const deck = findChampionshipDeck(championshipDecks, id);
    return deck && { title: championshipDeckTitle(deck), source: deck.source };
  }
  if (isBeginnerDeckId(id)) {
    const deck = findBeginnerDeck(beginnerDecks, id);
    return deck && { title: beginnerDeckTitle(deck), source: deck.source };
  }
  return undefined;
}

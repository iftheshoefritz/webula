// The Chula pile as cards of the card data (#1289), for the practice table's bot game. It imports
// nothing from the practice table: the table merges this deck into the player's.

import { DeckList } from '../../types';
import { COPIES_OF_EACH, DilemmaId, OPPONENT_DILEMMAS, collectorsKey } from './opponentPile';

const ID_BY_KEY = new Map<string, DilemmaId>(OPPONENT_DILEMMAS.map((d) => [collectorsKey(d.collectorsInfo), d.id]));

/**
 * The dilemma pile of the bot, `COPIES_OF_EACH` of each `OPPONENT_DILEMMAS` card, keyed and shaped
 * as `deckFromTsv` keys a deck, so `mergeDeckPiles` can take it. Each row is found by its collector's
 * info, not its title, since other versions share the title. A card missing from `data` is skipped.
 */
export function chulaPileDeck(data: ReadonlyArray<{ collectorsinfo: string }>): DeckList {
  const deck: DeckList = {};
  for (const d of OPPONENT_DILEMMAS) {
    const key = collectorsKey(d.collectorsInfo);
    const found = data.find((row) => row.collectorsinfo === key);
    if (!found) continue;
    deck[found.collectorsinfo] = {
      count: COPIES_OF_EACH,
      row: { ...found, count: COPIES_OF_EACH, pile: 'dilemmaPile' },
    };
  }
  return deck;
}

/** The `DilemmaId` of a card of the Chula pile, by its collector's info, or null for any other card. */
export function dilemmaIdOf(row: { collectorsinfo?: string } | null | undefined): DilemmaId | null {
  return (row?.collectorsinfo && ID_BY_KEY.get(row.collectorsinfo)) || null;
}

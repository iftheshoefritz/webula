// The Beginner Decks of trekcc.org by Lucas Thompson, in `public/beginner-decks/` (#1323): a
// read-only source of decks that the deck picker lists as a folder beside the Drive files. Each deck
// gets an id of its own, the `beginner:` prefix and the file name, so it never collides with a Drive
// id or a Championship deck's id.

import { isEarlyAccessUser } from './featureFlags';
import { fetchPublicDeckFile, publicDeckFileUrl, publicDeckIndex } from './publicDeckFolder';

export type BeginnerDeck = {
  deckId: number
  deckName: string
  player: string
  file: string
  // The trekcc.org decklist of the deck.
  source: string
  // The complexity level, 1 to 5.
  complexity: number
  style: string
  // The strategy article of the deck. The picker does not link it (#1325).
  article: string
  articleUrl: string
  // True when the deck's author gave permission for Webula to show it to every user, not only to
  // the users with early access.
  authorizedUse: boolean
}

const BEGINNER_ID_PREFIX = 'beginner:';
const BEGINNER_DECKS_PATH = '/beginner-decks';

export const beginnerDeckId = (deck: Pick<BeginnerDeck, 'file'>) => `${BEGINNER_ID_PREFIX}${deck.file}`;

export const isBeginnerDeckId = (id: string) => id.startsWith(BEGINNER_ID_PREFIX);

// The file name an id names; null for an id that is not a Beginner Deck's.
export const beginnerDeckFile = (id: string): string | null =>
  isBeginnerDeckId(id) ? id.slice(BEGINNER_ID_PREFIX.length) : null;

// The title a loaded Beginner Deck gets: `<deckName> - <player>`.
export const beginnerDeckTitle = (deck: Pick<BeginnerDeck, 'deckName' | 'player'>) =>
  `${deck.deckName} - ${deck.player}`;

// The secondary text of a deck's row in the picker: "Level 1 · Mission Solver/Speed".
export const beginnerDeckDetails = (deck: Pick<BeginnerDeck, 'complexity' | 'style'>) =>
  `Level ${deck.complexity} · ${deck.style}`;

export function findBeginnerDeck(decks: BeginnerDeck[], id: string) {
  const file = beginnerDeckFile(id);
  return file === null ? undefined : decks.find((deck) => deck.file === file);
}

// The decks a user sees: an early-access user sees every deck, any other user only the decks with
// `authorizedUse` (#1319).
export const visibleBeginnerDecks = (decks: BeginnerDeck[], email: string | null | undefined) =>
  isEarlyAccessUser(email) ? decks : decks.filter((deck) => deck.authorizedUse);

export const beginnerDeckUrl = (id: string) => publicDeckFileUrl(BEGINNER_DECKS_PATH, beginnerDeckFile(id) ?? '');

const index = publicDeckIndex<BeginnerDeck>(`${BEGINNER_DECKS_PATH}/index.json`, 'Beginner deck');

// The index, fetched once a session. A failed fetch is not cached, so the next call tries again.
export const fetchBeginnerDecks = () => index.fetch();

// Forgets the cached index; for the tests.
export const resetBeginnerDecksCache = () => index.reset();

export const fetchBeginnerDeckText = (id: string) => fetchPublicDeckFile(beginnerDeckUrl(id), 'Beginner deck');

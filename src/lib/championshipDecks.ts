// The 2026 Championship decks of the top-level `championship-decks/` folder (#1286, #1310): a
// read-only source of decks that the deck picker lists beside the Drive files. The folder is not
// under `public/`: `/api/championship-decks` serves its index and its files, each only to a user who
// may see it (#1327). Each deck gets an id of its own, the
// `championship:` prefix and the file name, so it never collides with a Drive id and a loader can
// tell the two apart.

import { isEarlyAccessUser } from './featureFlags';
import { fetchPublicDeckFile, publicDeckFileUrl, publicDeckIndex } from './publicDeckFolder';

export type ChampionshipDeck = {
  event: string
  tournamentId: number
  deckId: number
  deckName: string
  player: string
  file: string
  source: string
  // True when the deck's owner gave permission for Webula to show it to every user, not only
  // to the users with early access.
  authorizedUse: boolean
}

export type ChampionshipEvent = { event: string; decks: ChampionshipDeck[] }

const CHAMPIONSHIP_ID_PREFIX = 'championship:';
// The prefix of the ids before the rename (#1326). A deck report saved then (#1311) still holds it,
// so the id check accepts it and the file name extraction strips it.
const LEGACY_ID_PREFIX = 'tournament:';
const ID_PREFIXES = [CHAMPIONSHIP_ID_PREFIX, LEGACY_ID_PREFIX];
// The API route of the index; a deck's text is `<path>/<file name>`.
export const CHAMPIONSHIP_DECKS_PATH = '/api/championship-decks';

export const championshipDeckId = (deck: Pick<ChampionshipDeck, 'file'>) => `${CHAMPIONSHIP_ID_PREFIX}${deck.file}`;

export const isChampionshipDeckId = (id: string) => ID_PREFIXES.some((prefix) => id.startsWith(prefix));

// The file name an id names, under either prefix; null for an id that is not a Championship deck's.
export function championshipDeckFile(id: string): string | null {
  const prefix = ID_PREFIXES.find((p) => id.startsWith(p));
  return prefix === undefined ? null : id.slice(prefix.length);
}

// An id under the current prefix: an old `tournament:` id becomes the `championship:` id of its file,
// and any other id stays as it is.
export function currentChampionshipDeckId(id: string) {
  const file = championshipDeckFile(id);
  return file === null ? id : championshipDeckId({ file });
}

// The title a loaded Championship deck gets: `<deckName> - <player> - <event>`.
export const championshipDeckTitle = (deck: Pick<ChampionshipDeck, 'deckName' | 'player' | 'event'>) =>
  `${deck.deckName} - ${deck.player} - ${deck.event}`;

// The decks a user sees (#1327): an early-access user sees every deck, any other user, a signed-out
// user too, only the decks with `authorizedUse`. The API routes and the deck picker both use it.
export const visibleChampionshipDecks = (decks: ChampionshipDeck[], email: string | null | undefined) =>
  isEarlyAccessUser(email) ? decks : decks.filter((deck) => deck.authorizedUse);

// The decks grouped by event, the events and the decks of each in index order.
export function groupChampionshipDecks(decks: ChampionshipDeck[]): ChampionshipEvent[] {
  const events = new Map<string, ChampionshipDeck[]>();
  for (const deck of decks) {
    const group = events.get(deck.event);
    if (group) group.push(deck);
    else events.set(deck.event, [deck]);
  }
  return Array.from(events, ([event, eventDecks]) => ({ event, decks: eventDecks }));
}

// The deck an id names. It compares file names, so an old `tournament:` id finds its deck too.
export function findChampionshipDeck(decks: ChampionshipDeck[], id: string) {
  const file = championshipDeckFile(id);
  return file === null ? undefined : decks.find((deck) => deck.file === file);
}

// The URL of a deck's text.
export function championshipDeckUrl(id: string) {
  return publicDeckFileUrl(CHAMPIONSHIP_DECKS_PATH, championshipDeckFile(id) ?? '');
}

const index = publicDeckIndex<ChampionshipDeck>(CHAMPIONSHIP_DECKS_PATH, 'Championship deck');

// The rows the signed-in user may see, fetched once a session for each email, so a sign-in change
// never shows the list fetched before it. A failed fetch is not cached, so the next call tries again.
export const fetchChampionshipDecks = (email: string | null | undefined) => index.fetch(email ?? '');

// Forgets the cached index; for the tests.
export const resetChampionshipDecksCache = () => index.reset();

export const fetchChampionshipDeckText = (id: string) => fetchPublicDeckFile(championshipDeckUrl(id), 'Championship deck');

// The 2026 Championship decks of `public/championship-decks/` (#1286, #1310): a read-only source of
// decks that the deck picker lists beside the Drive files. Each deck gets an id of its own, the
// `championship:` prefix and the file name, so it never collides with a Drive id and a loader can
// tell the two apart.

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
const CHAMPIONSHIP_DECKS_PATH = '/championship-decks';

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

// The URL of a deck's text. The file names hold spaces and non-ASCII characters.
export function championshipDeckUrl(id: string) {
  return `${CHAMPIONSHIP_DECKS_PATH}/${encodeURIComponent(championshipDeckFile(id) ?? '')}`;
}

let indexRequest: Promise<ChampionshipDeck[]> | null = null;

// The index, fetched once a session. A failed fetch is not cached, so the next call tries again.
export function fetchChampionshipDecks(): Promise<ChampionshipDeck[]> {
  if (!indexRequest) {
    indexRequest = fetch(`${CHAMPIONSHIP_DECKS_PATH}/index.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Championship deck index: ${response.status}`);
        return response.json() as Promise<ChampionshipDeck[]>;
      })
      .catch((error) => {
        indexRequest = null;
        throw error;
      });
  }
  return indexRequest;
}

// Forgets the cached index; for the tests.
export function resetChampionshipDecksCache() {
  indexRequest = null;
}

export async function fetchChampionshipDeckText(id: string): Promise<string> {
  const response = await fetch(championshipDeckUrl(id));
  if (!response.ok) throw new Error(`Championship deck: ${response.status}`);
  return response.text();
}

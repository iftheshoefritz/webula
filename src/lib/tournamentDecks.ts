// The 2026 tournament decks of `public/tournament-decks/` (#1286, #1310): a read-only source of
// decks that the deck picker lists beside the Drive files. Each deck gets an id of its own, the
// `tournament:` prefix and the file name, so it never collides with a Drive id and a loader can
// tell the two apart.

export type TournamentDeck = {
  event: string
  tournamentId: number
  deckId: number
  deckName: string
  player: string
  file: string
  source: string
}

export type TournamentEvent = { event: string; decks: TournamentDeck[] }

const TOURNAMENT_ID_PREFIX = 'tournament:';
const TOURNAMENT_DECKS_PATH = '/tournament-decks';

export const tournamentDeckId = (deck: Pick<TournamentDeck, 'file'>) => `${TOURNAMENT_ID_PREFIX}${deck.file}`;

export const isTournamentDeckId = (id: string) => id.startsWith(TOURNAMENT_ID_PREFIX);

// The title a loaded tournament deck gets: `<deckName> - <player> - <event>`.
export const tournamentDeckTitle = (deck: Pick<TournamentDeck, 'deckName' | 'player' | 'event'>) =>
  `${deck.deckName} - ${deck.player} - ${deck.event}`;

// The decks grouped by event, the events and the decks of each in index order.
export function groupTournamentDecks(decks: TournamentDeck[]): TournamentEvent[] {
  const events = new Map<string, TournamentDeck[]>();
  for (const deck of decks) {
    const group = events.get(deck.event);
    if (group) group.push(deck);
    else events.set(deck.event, [deck]);
  }
  return Array.from(events, ([event, eventDecks]) => ({ event, decks: eventDecks }));
}

export const findTournamentDeck = (decks: TournamentDeck[], id: string) =>
  decks.find((deck) => tournamentDeckId(deck) === id);

// The URL of a deck's text. The file names hold spaces and non-ASCII characters.
export function tournamentDeckUrl(id: string) {
  return `${TOURNAMENT_DECKS_PATH}/${encodeURIComponent(id.slice(TOURNAMENT_ID_PREFIX.length))}`;
}

let indexRequest: Promise<TournamentDeck[]> | null = null;

// The index, fetched once a session. A failed fetch is not cached, so the next call tries again.
export function fetchTournamentDecks(): Promise<TournamentDeck[]> {
  if (!indexRequest) {
    indexRequest = fetch(`${TOURNAMENT_DECKS_PATH}/index.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Tournament deck index: ${response.status}`);
        return response.json() as Promise<TournamentDeck[]>;
      })
      .catch((error) => {
        indexRequest = null;
        throw error;
      });
  }
  return indexRequest;
}

// Forgets the cached index; for the tests.
export function resetTournamentDecksCache() {
  indexRequest = null;
}

export async function fetchTournamentDeckText(id: string): Promise<string> {
  const response = await fetch(tournamentDeckUrl(id));
  if (!response.ok) throw new Error(`Tournament deck: ${response.status}`);
  return response.text();
}

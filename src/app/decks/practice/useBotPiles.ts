import { useState } from 'react';
import type { BeginnerDeck } from '../../../lib/beginnerDecks';
import { championshipDeckId } from '../../../lib/championshipDecks';
import type { ChampionshipEvent } from '../../../lib/championshipDecks';
import { beginnerDeckId } from '../../../lib/beginnerDecks';
import { fetchPublicDeckText } from '../../../lib/publicDecks';
import { botPileChoices } from '../../../lib/dilemmaBot/botPiles';

// The texts of the folder decks fetched for the bot's pile chooser (#1520), once a session: the
// chooser needs each deck's text to know whether the registry covers it. A failed fetch is not kept,
// so the next open tries again.
const texts = new Map<string, string>();
const inFlight = new Set<string>();

// The choices of the bot's pile for the picker's chooser (#1520). `load` fetches the texts of the
// candidate decks, the rows the picker shows already, when the chooser opens; each deck joins the
// list once its text arrives and the registry covers it. Chula shows at once.
export function useBotPiles(beginnerDecks: BeginnerDeck[], championshipEvents: ChampionshipEvent[]) {
  // Counts the texts that arrived, so the list renders again as each one does.
  const [, setFetched] = useState(0);
  const [pending, setPending] = useState(0);
  const championshipDecks = championshipEvents.flatMap((e) => e.decks);

  const load = () => {
    const ids = [...beginnerDecks.map(beginnerDeckId), ...championshipDecks.map(championshipDeckId)]
      .filter((id) => !texts.has(id) && !inFlight.has(id));
    if (ids.length === 0) return;
    setPending((n) => n + ids.length);
    for (const id of ids) {
      inFlight.add(id);
      fetchPublicDeckText(id)
        .then((text) => {
          texts.set(id, text);
          setFetched((n) => n + 1);
        })
        .catch(() => {})
        .finally(() => {
          inFlight.delete(id);
          setPending((n) => n - 1);
        });
    }
  };

  const choices = botPileChoices(beginnerDecks, championshipDecks, texts);

  // The text of a chosen folder deck, from the cache.
  const textOf = (id: string): string | undefined => texts.get(id);

  return { choices, loading: pending > 0, load, textOf };
}

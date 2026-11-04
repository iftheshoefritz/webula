import { useState } from 'react';
import { BotPileChoice, botPileChoices } from '../../../lib/dilemmaBot/botPileChoice';
import { beginnerPickerFile, championshipPickerFile, fetchPublicDeckText } from '../../../lib/publicDecks';
import type { BeginnerDeck } from '../../../lib/beginnerDecks';
import type { ChampionshipEvent } from '../../../lib/championshipDecks';

// The bot piles of Play against the bot (#1520). The chooser lists a Beginner or Championship deck
// only when the pile bot's registry covers its dilemmas, and that needs the deck's text. `request`
// fetches the texts of the decks the player sees, once a session each, and each deck shows as its text
// arrives. A failed fetch hides that deck. Chula shows at once. The decks passed in are those
// `usePracticeDrive` already narrowed to the player, so this filters by coverage alone.
export function useBotPiles(beginnerDecks: BeginnerDeck[], championshipEvents: ChampionshipEvent[]) {
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(new Map());
  const [requested] = useState(() => new Set<string>());
  const [pending, setPending] = useState(0);

  const beginner = beginnerDecks.map(beginnerPickerFile);
  const championship = championshipEvents.flatMap((e) => e.decks).map(championshipPickerFile);
  const choices: BotPileChoice[] = botPileChoices(beginner, championship, texts);

  const request = () => {
    for (const { id } of [...beginner, ...championship]) {
      if (requested.has(id)) continue;
      requested.add(id);
      setPending((n) => n + 1);
      fetchPublicDeckText(id)
        .then((text) => setTexts((prev) => new Map(prev).set(id, text)))
        .catch(() => {
          // A failed fetch may be tried again on the next open.
          requested.delete(id);
        })
        .finally(() => setPending((n) => n - 1));
    }
  };

  return { choices, texts, loading: pending > 0, request };
}

import { cardTitleOf } from '../../lib/cardTitle';
import { isPlayEffectCard, PLAY_MODEL_TITLES } from '../../lib/playModels/coverage';
import { backlogOf, cardRows, shippedDecks } from './backlogData';

// The backlog of the "when you play" registry (#1801): the personnel and ship titles whose "When you play
// this …" text does more than change the cost, with no model in `PLAY_MODELS`, by the number of shipped
// decks whose `Deck:` section plays them. `PLAY_BACKLOG=1 yarn test playModelBacklog` prints the list; the
// test is silent otherwise.

describe('the "when you play" model backlog', () => {
  const cards = cardRows();
  const textOf = (name: string) => cards.find((c) => c.name === name)!;
  const modelled = new Set([...PLAY_MODEL_TITLES].map((t) => t.toLowerCase()));
  const backlog = backlogOf(
    cards.filter(isPlayEffectCard).map((c) => cardTitleOf(c.name)),
    shippedDecks(),
    (t) => modelled.has(t.toLowerCase())
  );

  it('finds Enabran Tain, and lists the shipped backlog without the modelled titles', () => {
    expect(isPlayEffectCard(textOf('Enabran Tain "Retired" Spymaster'))).toBe(true);
    const titles = backlog.map((b) => b.title);
    expect(titles.length).toBeGreaterThan(0);
    for (const t of PLAY_MODEL_TITLES) expect(titles).not.toContain(t);
    for (let i = 1; i < backlog.length; i++) expect(backlog[i - 1].decks).toBeGreaterThanOrEqual(backlog[i].decks);
    if (process.env.PLAY_BACKLOG) {
      console.log(
        `"When you play" titles with no play model, by the decks that play them (${backlog.length}):\n` +
          backlog.map((b) => `${String(b.decks).padStart(3)}  ${b.title}`).join('\n')
      );
    }
  });
});

import { COST_REGISTRY } from '../../lib/costModels/registry';
import { cardTitleOf } from '../../lib/cardTitle';
import { changesCost, CostCardRow, isCostAffecting } from '../../lib/costModels/coverage';
import { backlogOf, cardRows, deckTitles, shippedDecks } from './backlogData';

// The backlog of the cost registry (#1692, step 1 of #1609): the titles whose game text changes a
// cost, grants counters or plays a card at a changed cost, with no model in `COST_REGISTRY`, by the
// number of shipped decks whose `Deck:` section plays them. `COST_BACKLOG=1 yarn test costModelBacklog`
// prints the list; the test is silent otherwise.

type CardRow = CostCardRow;

/** The backlog: each cost-changing title with no model, with the number of decks that play it, most played first. */
function costModelBacklog(
  cards: CardRow[],
  decks: string[],
  registry: ReadonlyMap<string, unknown> = COST_REGISTRY
): { title: string; decks: number }[] {
  return backlogOf(
    cards.filter(isCostAffecting).map((c) => cardTitleOf(c.name)),
    decks,
    (t) => registry.has(t)
  );
}

describe('the cost model backlog', () => {
  const cards = cardRows();
  const textOf = (name: string) => cards.find((c) => c.name === name)!.gametext;

  it.each(['Seska Pragmatic Agent', 'Christopher Pike Bold Commander', 'Icheb Second Officer', 'Tacking Into the Wind', 'Goran', 'Surprise Party', 'Tricia Jenkins Relaxed Pilot'])(
    'finds %s',
    (name) => {
      expect(changesCost(textOf(name))).toBe(true);
    }
  );

  it.each(['Pavel A. Chekov Hapless Puppet', 'Exo III Seek Lost Scientist', 'Khar'])('finds the set cost of %s (#1737)', (name) => {
    expect(changesCost(textOf(name))).toBe(true);
  });

  it.each(['Uninvited', 'Julian Bashir Displaced Doctor'])('leaves out %s', (name) => {
    expect(changesCost(textOf(name))).toBe(false);
  });

  it('leaves out a sentence about a dilemma cost', () => {
    expect(changesCost('When you reveal a Persistent dilemma from your dilemma stack, it is cost -1.')).toBe(false);
  });

  it('reads only the Deck: section, a *VP version under its base title', () => {
    const deck = 'Missions:\n1\tAlpha\nDeck:\n2\tBeta *VP\n1\tGamma (FOW)\nDilemmas:\n1\tDelta\n';
    expect([...deckTitles(deck)]).toEqual(['Beta', 'Gamma']);
  });

  it('counts decks, most played first, and leaves out the titles with a model', () => {
    const rows: CardRow[] = [
      { name: 'Rare One', type: 'Personnel', gametext: 'She is cost -1.' },
      { name: 'Common One *VP', type: 'Event', gametext: 'You may spend an additional counter.' },
      { name: 'Modelled', type: 'Personnel', gametext: 'He is cost -2.' },
      { name: 'Plain', type: 'Personnel', gametext: 'Order - Draw a card.' },
    ];
    const decks = ['Deck:\n1\tRare One\n1\tCommon One\n1\tModelled\n', 'Deck:\n3\tCommon One *VP\n'];
    expect(costModelBacklog(rows, decks, new Map([['Modelled', {}]]))).toEqual([
      { title: 'Common One', decks: 2 },
      { title: 'Rare One', decks: 1 },
    ]);
  });

  it('lists the shipped backlog without the modelled titles', () => {
    const backlog = costModelBacklog(cards, shippedDecks());
    const titles = backlog.map((b) => b.title);
    expect(titles).toContain('A History of Collusion');
    // Modelled by #1762.
    expect(titles).not.toContain("Alexander Rozhenko K'mtar");
    expect(titles).not.toContain('The New Resistance');
    // Its exchange (#1765) and its Recall (#1764).
    expect(titles).not.toContain('Vidiian Organ Bank');
    expect(titles).not.toContain('Tacking Into the Wind');
    for (const t of COST_REGISTRY.keys()) expect(titles).not.toContain(t);
    if (process.env.COST_BACKLOG) {
      console.log(
        `Cost-changing titles with no cost model, by the decks that play them (${backlog.length}):\n` +
          backlog.map((b) => `${String(b.decks).padStart(3)}  ${b.title}`).join('\n')
      );
    }
  });
});

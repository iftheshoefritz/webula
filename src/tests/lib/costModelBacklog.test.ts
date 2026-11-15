import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { COST_REGISTRY } from '../../lib/costModels/registry';
import { cardTitleOf } from '../../lib/cardTitle';

// The backlog of the cost registry (#1692, step 1 of #1609): the titles whose game text changes a
// cost, grants counters or plays a card at a changed cost, with no model in `COST_REGISTRY`, by the
// number of shipped decks whose `Deck:` section plays them. `COST_BACKLOG=1 yarn test costModelBacklog`
// prints the list; the test is silent otherwise.

/** The patterns of a sentence that changes a cost or grants counters. */
const COST_PATTERNS: RegExp[] = [
  /\bcosts? [+\-−]\s?\d/i, // "she is cost -1", "play this personnel at cost +1", "costs -2", "this personnel's cost -1"
  /\badditional (\d+ |\w+ )?counters?\b/i, // "an additional counter", "5 additional counters"
];

/**
 * Whether a game text changes a cost: one of its sentences matches a pattern and is not about a
 * dilemma's cost, which the dilemma spend reads and the counters do not. A text that only reads a
 * cost, "a dilemma that costs 1 or less" or "who has a cost of 4 or more", matches no pattern.
 */
function changesCost(gametext: string): boolean {
  return gametext
    .split(/(?<=[.!?])\s+/)
    .some((s) => !/\bdilemma\b/i.test(s) && COST_PATTERNS.some((p) => p.test(s)));
}

type CardRow = { name: string; type: string; gametext: string };

function cardRows(): CardRow[] {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
  const col = (h: string) => head.indexOf(h);
  return rows.map((r) => ({ name: r[col('Name')], type: r[col('Type')], gametext: r[col('gametext')] ?? '' }));
}

/** The titles of a deck's `Deck:` section, its draw deck, by `cardTitleOf`. */
function deckTitles(text: string): Set<string> {
  const titles = new Set<string>();
  let inDeck = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S.*:\s*$/.test(line)) {
      inDeck = line.trim() === 'Deck:';
      continue;
    }
    const m = inDeck && line.match(/^\d+\t(.+)$/);
    if (m) titles.add(cardTitleOf(m[1]));
  }
  return titles;
}

function shippedDecks(): string[] {
  const dirs = [join(process.cwd(), 'public', 'beginner-decks'), join(process.cwd(), 'championship-decks')];
  return dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => readFileSync(join(dir, f), 'utf-8'))
  );
}

/** The backlog: each cost-changing title with no model, with the number of decks that play it, most played first. */
function costModelBacklog(
  cards: CardRow[],
  decks: string[],
  registry: ReadonlyMap<string, unknown> = COST_REGISTRY
): { title: string; decks: number }[] {
  const titles = new Set(
    cards.filter((c) => c.type.toLowerCase() !== 'dilemma' && changesCost(c.gametext)).map((c) => cardTitleOf(c.name))
  );
  const deckSets = decks.map(deckTitles);
  return [...titles]
    .filter((t) => !registry.has(t))
    .map((title) => ({ title, decks: deckSets.filter((s) => s.has(title)).length }))
    .sort((a, b) => b.decks - a.decks || a.title.localeCompare(b.title));
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
    expect(titles).toContain('Christening');
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

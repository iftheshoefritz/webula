import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { cardTitleOf } from '../../lib/cardTitle';
import type { CostCardRow } from '../../lib/costModels/coverage';

// The card data and the shipped decks the backlog tests read (#1692, #1801).

/** Every row of the card data: its name, type and game text. */
export function cardRows(): CostCardRow[] {
  const [head, ...rows] = readFileSync(join(process.cwd(), 'public', 'cards_with_processed_columns.txt'), 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
  const col = (h: string) => head.indexOf(h);
  return rows.map((r) => ({ name: r[col('Name')], type: r[col('Type')], gametext: r[col('gametext')] ?? '' }));
}

/** The titles of a deck's `Deck:` section, its draw deck, by `cardTitleOf`. */
export function deckTitles(text: string): Set<string> {
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

/** The text of every shipped deck: the Beginner Decks and the Championship decks. */
export function shippedDecks(): string[] {
  const dirs = [join(process.cwd(), 'public', 'beginner-decks'), join(process.cwd(), 'championship-decks')];
  return dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => readFileSync(join(dir, f), 'utf-8'))
  );
}

/** The titles `titles` lacks a model for, each with the number of `decks` that play it, most played first. */
export function backlogOf(
  titles: Iterable<string>,
  decks: string[],
  hasModel: (title: string) => boolean
): { title: string; decks: number }[] {
  const deckSets = decks.map(deckTitles);
  return [...new Set(titles)]
    .filter((t) => !hasModel(t))
    .map((title) => ({ title, decks: deckSets.filter((s) => s.has(title)).length }))
    .sort((a, b) => b.decks - a.decks || a.title.localeCompare(b.title));
}

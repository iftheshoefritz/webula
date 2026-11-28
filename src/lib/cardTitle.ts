// The title of a card less its version suffix, shared by the per-card registries: the dilemma models
// of the pile bot (#1320) and the range and span models of the practice table (#1635). A module of
// its own, so a registry reads it without loading another registry's models. The suffix rule lives
// in `cardTitleRule.js`, which the card data build runs with plain Node too (#1971).
import { cardTitleOf as titleOf } from './cardTitleRule.js';

/**
 * The title of the model that covers a deck line's card name: "Sylvia *VP" and "Sylvia" are one model,
 * and so are "In Development (SS)", "Timescape (Promo)" and "Stripped Down *AP" with their titles. A
 * name in quotes, as the card data names "Rapid Progress", loses them.
 */
export function cardTitleOf(name: string): string {
  return titleOf(name);
}

/**
 * The card title of a card data row, lowercased: the title a card names (#1974). "When you name a card, you do
 * so by card title only, not subtitle." (Glossary › naming cards, p. 18). It is the row's `title` (#1971), and
 * for a row with none, a practice game saved before #1971 or a test's invented card, `cardTitleOf` of its name.
 */
export function rowCardTitleOf(row: any): string {
  if (row?.title) return String(row.title).toLowerCase();
  return cardTitleOf(String(row?.originalName ?? row?.name ?? '')).toLowerCase();
}

/** The card title of a row in its printed case, for display: its `originalTitle`, with the same fallback. */
export function rowPrintedCardTitleOf(row: any): string {
  if (row?.originalTitle) return String(row.originalTitle);
  return cardTitleOf(String(row?.originalName ?? row?.name ?? ''));
}

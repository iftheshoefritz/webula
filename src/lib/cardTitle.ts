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

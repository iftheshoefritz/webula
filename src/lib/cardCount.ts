type CardRow = Record<string, any>;

/**
 * Strips a trailing `*VP` suffix, which marks an alternate-art variant
 * reprint that shares gameplay identity with its non-`*VP` counterpart.
 */
export function stripVariantSuffix(name: string): string {
  return name.replace(/\s+\*VP$/i, '');
}

/**
 * Counts search results, collapsing `*VP` variant reprints of the same card
 * into a single unique entry while still reporting the raw total.
 */
export function getCardCounts(cards: CardRow[]): { total: number; unique: number } {
  const uniqueNames = new Set(cards.map((c) => stripVariantSuffix(c.originalName)));
  return { total: cards.length, unique: uniqueNames.size };
}

/**
 * Formats a card count for display, e.g. "38 unique · 42 cards".
 */
export function formatCardCountLabel({ total, unique }: { total: number; unique: number }): string {
  return `${unique} unique · ${total} card${total !== 1 ? 's' : ''}`;
}

type CardRow = Record<string, any>;

/**
 * Strips a trailing reprint/variant suffix (`*VP`, `*A`, `*AP`, or `*VAP`),
 * which marks an alternate-art or promo reprint that shares gameplay
 * identity with its base counterpart.
 */
export function stripVariantSuffix(name: string): string {
  return name.replace(/\s+\*(VP|A|AP|VAP)$/i, '');
}

/**
 * Counts search results, collapsing variant/reprint versions of the same
 * card into a single unique entry while still reporting the raw total.
 */
export function getCardCounts(cards: CardRow[]): { total: number; unique: number } {
  const uniqueNames = new Set(cards.map((c) => stripVariantSuffix(c.originalName)));
  return { total: cards.length, unique: uniqueNames.size };
}

/**
 * Formats a card count for display, e.g. "38 cards, 42 versions".
 */
export function formatCardCountLabel({ total, unique }: { total: number; unique: number }): string {
  return `${unique} card${unique !== 1 ? 's' : ''}, ${total} version${total !== 1 ? 's' : ''}`;
}

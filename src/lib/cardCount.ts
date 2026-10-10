type CardRow = Record<string, any>;

/**
 * Strips a trailing version suffix (`*VP`, `*A`, `*AP`, or `*VAP`),
 * which marks an alternate-art or promo reprint that shares gameplay
 * identity with its base counterpart.
 */
export function stripVersionSuffix(name: string): string {
  return name.replace(/\s+\*(VP|A|AP|VAP)$/i, '');
}

/**
 * The name to show for a card: the printed name (`originalName`, with its
 * original letter case) less any version suffix, or `name` when the row has
 * no `originalName`. Use `name` itself only to match, sort or search.
 */
export function cardDisplayName(card: CardRow): string {
  return card.originalName ? stripVersionSuffix(card.originalName) : card.name;
}

/**
 * Counts search results, collapsing the versions (reprints) of the same
 * card into a single unique entry while still reporting the raw total.
 */
export function getCardCounts(cards: CardRow[]): { total: number; unique: number } {
  const uniqueNames = new Set(cards.map((c) => stripVersionSuffix(c.originalName)));
  return { total: cards.length, unique: uniqueNames.size };
}

/**
 * Formats a card count for display, e.g. "38 cards, 42 versions".
 */
export function formatCardCountLabel({ total, unique }: { total: number; unique: number }): string {
  return `${unique} card${unique !== 1 ? 's' : ''}, ${total} version${total !== 1 ? 's' : ''}`;
}

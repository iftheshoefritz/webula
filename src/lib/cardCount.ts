type CardRow = Record<string, any>;

/**
 * Strips a trailing version suffix (`*VP`, `*A`, `*AP`, or `*VAP`),
 * which marks an alternate-art or promo reprint that shares gameplay
 * identity with its base counterpart.
 */
export function stripVersionSuffix(name: string): string {
  return name.replace(/\s+\*(VP|A|AP|VAP)$/i, '');
}

/** The version suffix of a name (`*VP`, `*A`, `*AP`, `*VAP`), as written, or '' for none. */
export function versionSuffixOf(name: string): string {
  return name.match(/\*(VP|A|AP|VAP)$/i)?.[0] ?? '';
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
 * The title to show for a card's game identity: `originalTitle` (#1971), or, for a row without
 * it, such as a test fixture, the name less its version suffix. A title never holds a suffix, so
 * the versions of a card share it, and so do two personas or two missions with one title.
 */
export function cardTitleDisplay(card: CardRow): string {
  return card.originalTitle || stripVersionSuffix(card.originalName ?? card.name ?? '');
}

// The key of a game identity: the lowercase `title`, or the fallback of `cardTitleDisplay`.
function cardTitleKey(card: CardRow): string {
  return card.title || stripVersionSuffix(card.originalName ?? card.name ?? '');
}

/**
 * Counts search results: `unique` is the number of distinct titles, `total` the number of
 * printed rows. By the rules two cards with one title are the same card whatever their
 * subtitles (Building a Deck, p. 13), so the versions, the personas and the missions at one
 * location of a title count once. See "Version" in `docs/ubiquitous-language.md`.
 */
export function getCardCounts(cards: CardRow[]): { total: number; unique: number } {
  const uniqueTitles = new Set(cards.map(cardTitleKey));
  return { total: cards.length, unique: uniqueTitles.size };
}

/**
 * Formats a card count for display, e.g. "38 titles, 42 cards": the titles, then the rows.
 */
export function formatCardCountLabel({ total, unique }: { total: number; unique: number }): string {
  return `${unique} title${unique !== 1 ? 's' : ''}, ${total} card${total !== 1 ? 's' : ''}`;
}

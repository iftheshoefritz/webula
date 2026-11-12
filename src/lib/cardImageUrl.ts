// The URL of a card's image (#1614). A public card's image is a static file under `/cardimages/`.
// A playtest card's image comes from the gated route of #1612, which caches `immutable`, so its
// URL always carries the version of the current playtest upload: a playtest row kept in a saved
// deck outlives an upload, so the version is never read from the row.
import type { SyntheticEvent } from 'react';

export const CARD_MISSING_URL = '/cardimages/CardMissing.jpg';

// The `set` the playtest cards merge hook gives every row of the playtest response. The parse
// lowercases every column, so the comparison is lowercase.
export const PLAYTEST_SET = 'playtest';

type ImageRow = { imagefile?: string; backimagefile?: string };

// A row of the card data; `CardDef` declares no `set`, but every parsed row has one.
export function isPlaytestCard(row: object | null | undefined): boolean {
  return (row as { set?: unknown } | null | undefined)?.set === PLAYTEST_SET;
}

// The version of the playtest cards the page holds now, set by `PlaytestCardsProvider`; null
// before the cards response arrives, and for a user who is not a playtester.
let currentPlaytestVersion: number | null = null;

export function setPlaytestImageVersion(version: number | null): void {
  currentPlaytestVersion = version;
}

export function playtestImageVersion(): number | null {
  return currentPlaytestVersion;
}

// `side` 'back' is the back of a double-sided mission (#765). A playtest card with no version
// known yet gets `CardMissing.jpg`, never a URL with no `?v=`.
export function cardImageUrl(
  card: ImageRow,
  side: 'front' | 'back' = 'front',
  version: number | null = currentPlaytestVersion,
): string {
  const imagefile = side === 'back' ? card.backimagefile : card.imagefile;
  if (!isPlaytestCard(card)) return `/cardimages/${imagefile}.jpg`;
  if (version === null) return CARD_MISSING_URL;
  return `/api/playtest/images/${encodeURIComponent(imagefile ?? '')}.jpg?v=${version}`;
}

// The `onError` of a card image: an image that does not load, a playtest image above all (the
// user is no longer a playtester, a later upload removed it, the store is down), shows
// `CardMissing.jpg`. It does not loop when `CardMissing.jpg` itself fails.
export function showCardMissing(event: SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  if (img.getAttribute('src') === CARD_MISSING_URL) return;
  img.src = CARD_MISSING_URL;
}

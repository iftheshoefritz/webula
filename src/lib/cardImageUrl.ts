// The URL of a card's image (#1614). A public card's image is a static file under `/cardimages/`.
// A playtest card's image comes from the gated route of #1612, which caches `immutable`, so its
// URL always carries the version of its set's current upload (#1644): a playtest row kept in a
// saved deck outlives an upload, so the version is never read from the row.
import type { SyntheticEvent } from 'react';

export const CARD_MISSING_URL = '/cardimages/CardMissing.jpg';

// The `CollectorsInfo` prefix of every playtest card, lowercased by the parse (`PLAYTEST_PREFIX`).
const PLAYTEST_COLLECTORS_PREFIX = 'pt-';

type ImageRow = { imagefile?: string; backimagefile?: string; set?: unknown };

// A row of the card data, of any playtest set; `CardDef` declares no `collectorsinfo`, but every
// parsed row has one.
export function isPlaytestCard(row: object | null | undefined): boolean {
  const collectorsinfo = (row as { collectorsinfo?: unknown } | null | undefined)?.collectorsinfo;
  return typeof collectorsinfo === 'string' && collectorsinfo.toLowerCase().startsWith(PLAYTEST_COLLECTORS_PREFIX);
}

// The version of each playtest set in testing, by key (the `set` of its rows), set by
// `PlaytestCardsProvider`; empty before the cards response arrives, and for a user who is not a
// playtester.
let currentPlaytestVersions: ReadonlyMap<string, number> = new Map();

export function setPlaytestImageVersions(versions: ReadonlyMap<string, number>): void {
  currentPlaytestVersions = versions;
}

export function playtestImageVersions(): ReadonlyMap<string, number> {
  return currentPlaytestVersions;
}

// `side` 'back' is the back of a double-sided mission (#765). A playtest card whose set has no
// version known (not loaded yet, removed or replaced, or the `playtest` of a row saved before
// #1644) gets `CardMissing.jpg`, never a URL with no `?v=`.
export function cardImageUrl(
  card: ImageRow,
  side: 'front' | 'back' = 'front',
  versions: ReadonlyMap<string, number> = currentPlaytestVersions,
): string {
  const imagefile = side === 'back' ? card.backimagefile : card.imagefile;
  if (!isPlaytestCard(card)) return `/cardimages/${imagefile}.jpg`;
  const set = typeof card.set === 'string' ? card.set : '';
  const version = versions.get(set);
  if (version === undefined) return CARD_MISSING_URL;
  return `/api/playtest/images/${encodeURIComponent(set)}/${encodeURIComponent(imagefile ?? '')}.jpg?v=${version}`;
}

// The `onError` of a card image: an image that does not load, a playtest image above all (the
// user is no longer a playtester, a later upload removed it, the store is down), shows
// `CardMissing.jpg`. It does not loop when `CardMissing.jpg` itself fails.
export function showCardMissing(event: SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  if (img.getAttribute('src') === CARD_MISSING_URL) return;
  img.src = CARD_MISSING_URL;
}

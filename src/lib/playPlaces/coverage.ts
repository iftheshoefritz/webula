import { cardTitleOf } from '../cardTitle';
import { hasCardSpecificHqLocation, HQ_PLAYABILITY } from '../hqPlayability';
import { PLACE_MODEL_TITLES } from './index';
import { placeSentencesOf, type PlaceCardRow } from './parse';

// The coverage of the play-place model (#1855): each personnel, ship and mission whose text has "you may
// play", and whether the model reads it. The backlog test reads it over the whole card data.

/**
 * How the model reads a card's "you may play" texts: `parsed` by `parse.ts`, `registry` by
 * `PLACE_MODELS`, `headquarters` by the headquarters rules (`HQ_PLAYABILITY` and
 * `CARD_SPECIFIC_HQ_LOCATIONS`), `costOnly` a cost with no place (the cost registry's), `notAPlace` a play
 * from elsewhere or onto the opponent's cards, and `unread` a text that names a place the model does not
 * read. A card with one unread sentence is `unread`.
 */
export type PlaceCoverage = 'parsed' | 'registry' | 'headquarters' | 'costOnly' | 'notAPlace' | 'unread';

const str = (v: unknown): string => String(v ?? '');

/** Whether a card is a personnel, a ship or a mission with "you may play" in its text. */
export const isPlaceCard = (card: PlaceCardRow): boolean =>
  /^(personnel|ship|mission)$/i.test(str(card.type)) && /you may play/i.test(str(card.gametext));

const registryKeys = new Set([...PLACE_MODEL_TITLES].map((t) => t.toLowerCase()));

/** How the model reads one card's "you may play" texts. */
export function placeCoverageOf(card: PlaceCardRow): PlaceCoverage {
  const title = cardTitleOf(str(card.name)).toLowerCase();
  if (registryKeys.has(title)) return 'registry';
  if (hasCardSpecificHqLocation(str(card.name))) return 'headquarters';
  if (/^mission$/i.test(str(card.type)) && title in HQ_PLAYABILITY) return 'headquarters';
  const kinds = placeSentencesOf(str(card.gametext)).map((s) => s.class.kind);
  if (kinds.includes('unread')) return 'unread';
  if (kinds.includes('place')) return 'parsed';
  if (kinds.includes('costOnly')) return 'costOnly';
  return 'notAPlace';
}

/** The "you may play" titles of `cards`, each once by `cardTitleOf`, by their coverage, each sorted. */
export function placeCoverage(cards: PlaceCardRow[]): Record<PlaceCoverage, string[]> {
  const out: Record<PlaceCoverage, Set<string>> = {
    parsed: new Set(),
    registry: new Set(),
    headquarters: new Set(),
    costOnly: new Set(),
    notAPlace: new Set(),
    unread: new Set(),
  };
  for (const c of cards.filter(isPlaceCard)) out[placeCoverageOf(c)].add(cardTitleOf(str(c.name)));
  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return {
    parsed: sorted(out.parsed),
    registry: sorted(out.registry),
    headquarters: sorted(out.headquarters),
    costOnly: sorted(out.costOnly),
    notAPlace: sorted(out.notAPlace),
    unread: sorted(out.unread),
  };
}

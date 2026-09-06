// Mapping from lowercased card names (with stripVariantSuffix applied) to
// predicates that determine whether that card's own gametext grants
// playability aboard a ship elsewhere in the deck, e.g. "You may play this
// personnel aboard your [TOS] ship."
//
// Some of these cards have extra location/cost qualifiers in their gametext
// beyond the icon check (e.g. Spock Experienced Officer also requires a
// [TOS] personnel costing 4+ aboard that ship). Matching the precedent set
// by HQ_PLAYABILITY (src/lib/hqPlayability.ts), those extra clauses are
// dropped here — only the icon/affiliation condition is modeled.
//
// Card data is lowercased by useDataFetching, so all field comparisons are lowercase.

import { stripVariantSuffix } from './cardCount';

type CardRow = Record<string, any>;
type DeckPredicate = (card: CardRow, deckRows: CardRow[]) => boolean;

function hasShipWithIcon(deckRows: CardRow[], icon: string): boolean {
  return deckRows.some((row) => row.type === 'ship' && row.icons.includes(icon));
}

function hasShipWithoutIcons(deckRows: CardRow[], icons: string[]): boolean {
  return deckRows.some((row) => row.type === 'ship' && icons.every((icon) => !row.icons.includes(icon)));
}

const aboardShipWithIcon = (icon: string): DeckPredicate => (_card, deckRows) => hasShipWithIcon(deckRows, icon);

// Keys are lowercased card names with stripVariantSuffix applied (shared
// across *VP variants since gametext is identical).
export const DECK_PLAYABILITY: Record<string, DeckPredicate> = {
  // "You may play this personnel aboard your [Rom] ship."
  "telek r'mor astrophysical researcher": aboardShipWithIcon('[rom]'),
  'tomek displaced alien': aboardShipWithIcon('[rom]'),
  jera: aboardShipWithIcon('[rom]'),

  // "You may play this personnel aboard your [TOS] ship."
  'jadzia dax communications staffer': aboardShipWithIcon('[tos]'),
  "miles o'brien engineering staffer": aboardShipWithIcon('[tos]'),
  'benjamin sisko command staffer': aboardShipWithIcon('[tos]'),
  'julian bashir medical staffer': aboardShipWithIcon('[tos]'),
  'worf clandestine staffer': aboardShipWithIcon('[tos]'),
  'odo vigilant staffer': aboardShipWithIcon('[tos]'),
  'tuvok stolid ensign': aboardShipWithIcon('[tos]'),
  'spock experienced officer': aboardShipWithIcon('[tos]'),

  // "You may play this personnel aboard your [Car] ship."
  'kira nerys ambitious ally': aboardShipWithIcon('[car]'),

  // "You may play this personnel aboard your [DS9] ship."
  'benjamin sisko "jodmos, son of kobor"': aboardShipWithIcon('[ds9]'),
  'odo "kodrak the unenthused"': aboardShipWithIcon('[ds9]'),
  "miles o'brien \"pahash the grumpy\"": aboardShipWithIcon('[ds9]'),
  'worf mentoring "klingons"': aboardShipWithIcon('[ds9]'),

  // "You may play this personnel aboard your [Dom] ship."
  'quark opportunistic envoy': aboardShipWithIcon('[dom]'),
  'matthew dougherty "partner" in crime': aboardShipWithIcon('[dom]'),

  // "You may play this personnel aboard your [E] ship."
  'quark frontline observer': aboardShipWithIcon('[e]'),

  // "You may play this personnel aboard your [SF] ship."
  'sim sacrificial lamb': aboardShipWithIcon('[sf]'),

  // "You may play this personnel aboard your [Sta] ship."
  'daniels timeless guardian': aboardShipWithIcon('[sta]'),

  // "You may play this personnel aboard your non-[Bor][Voy] ship."
  "telek r'mor anachronistic visitor": (_card, deckRows) => hasShipWithoutIcons(deckRows, ['[bor]', '[voy]']),
};

export function deckPlayabilityMatches(card: CardRow, deckRows: CardRow[]): boolean {
  const baseName = stripVariantSuffix(card.name);
  const predicate = DECK_PLAYABILITY[baseName];
  return !!predicate && predicate(card, deckRows);
}

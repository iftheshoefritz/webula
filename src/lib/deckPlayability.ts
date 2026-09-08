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

// "[Bor]" here denotes Borg affiliation, not an icon (Borg ships never carry
// an icon in this game's data — see HQ_PLAYABILITY's "[Bor] cards" = Borg
// affiliation convention in hqPlayability.ts), so "non-[Bor][Voy] ship" means
// a ship with the [Voy] icon that is not Borg-affiliated.
function hasNonBorgShipWithIcon(deckRows: CardRow[], icon: string): boolean {
  return deckRows.some((row) => row.type === 'ship' && row.icons.includes(icon) && !row.affiliation.includes('borg'));
}

const aboardShipWithIcon = (icon: string): DeckPredicate => (_card, deckRows) => hasShipWithIcon(deckRows, icon);

// Maps affiliation abbreviations that can appear in gametext (e.g. "your
// [Rom] ship") to the full affiliation name stored in the Affiliation
// column. Per the convention documented at the top of hqPlayability.ts,
// these bracket tokens denote affiliation, not an icon — ships never carry
// an affiliation abbreviation in their Icons column. Covers every
// affiliation abbreviation known to appear in card gametext, including ones
// not yet exercised by any DECK_PLAYABILITY entry, so future cards work
// without another one-off fix.
const AFFILIATION_ABBREVIATIONS: Record<string, string> = {
  '[baj]': 'bajoran',
  '[bor]': 'borg',
  '[car]': 'cardassian',
  '[dom]': 'dominion',
  '[fed]': 'federation',
  '[fer]': 'ferengi',
  '[kli]': 'klingon',
  '[na]': 'non-aligned',
  '[rom]': 'romulan',
  '[sf]': 'starfleet',
  '[sta]': 'starfleet',
  '[vid]': 'vidiian',
};

function hasShipWithAffiliation(deckRows: CardRow[], abbreviation: string): boolean {
  const affiliation = AFFILIATION_ABBREVIATIONS[abbreviation];
  return deckRows.some((row) => row.type === 'ship' && row.affiliation.includes(affiliation));
}

const aboardShipWithAffiliation = (abbreviation: string): DeckPredicate => (_card, deckRows) =>
  hasShipWithAffiliation(deckRows, abbreviation);

// Some cards' gametext instead names a specific ship, e.g. "You may play
// this personnel aboard your {U.S.S. Voyager}." or "You may play this ship
// to the same mission as your {Enterprise}." Both phrasings reduce to the
// same underlying check: does the deck contain a ship whose name starts with
// the named ship? A prefix match (not equality/substring) is required
// because card names are "base ship name" + subtitle, and some ships share a
// lookalike prefix that must NOT match (e.g. {Enterprise} refers to the
// NX-01-era "Enterprise ..." ships, not "U.S.S. Enterprise ..." or
// "U.S.S. Enterprise-D/-E ..." ships — the distinguishing text comes right
// after the shared word, so a prefix check on the full lowercased name
// correctly excludes those).
function hasNamedShip(deckRows: CardRow[], namePrefix: string): boolean {
  return deckRows.some((row) => row.type === 'ship' && row.name.startsWith(namePrefix));
}

const withNamedShip = (namePrefix: string): DeckPredicate => (_card, deckRows) =>
  hasNamedShip(deckRows, namePrefix);

// Keys are lowercased card names with stripVariantSuffix applied (shared
// across *VP variants since gametext is identical).
export const DECK_PLAYABILITY: Record<string, DeckPredicate> = {
  // "You may play this personnel aboard your [Rom] ship."
  "telek r'mor astrophysical researcher": aboardShipWithAffiliation('[rom]'),
  'tomek displaced alien': aboardShipWithAffiliation('[rom]'),
  jera: aboardShipWithAffiliation('[rom]'),

  // "You may play this personnel at cost +2 aboard your [TOS] or [Rom] ship
  // to reveal an opponent's hand..." (the cost +2 and reveal-hand clauses
  // are dropped, matching the precedent for extra cost/location qualifiers
  // noted in the file header).
  'james t. kirk self-proclaimed enemy spy': (_card, deckRows) =>
    hasShipWithIcon(deckRows, '[tos]') || hasShipWithAffiliation(deckRows, '[rom]'),

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
  'kira nerys ambitious ally': aboardShipWithAffiliation('[car]'),

  // "You may play this personnel aboard your [DS9] ship."
  'benjamin sisko "jodmos, son of kobor"': aboardShipWithIcon('[ds9]'),
  'odo "kodrak the unenthused"': aboardShipWithIcon('[ds9]'),
  "miles o'brien \"pahash the grumpy\"": aboardShipWithIcon('[ds9]'),
  'worf mentoring "klingons"': aboardShipWithIcon('[ds9]'),

  // "You may play this personnel aboard your [Dom] ship."
  'quark opportunistic envoy': aboardShipWithAffiliation('[dom]'),
  'matthew dougherty "partner" in crime': aboardShipWithAffiliation('[dom]'),

  // "You may play this personnel aboard your [E] ship."
  'quark frontline observer': aboardShipWithIcon('[e]'),

  // "You may play this personnel aboard your [SF] ship."
  'sim sacrificial lamb': aboardShipWithAffiliation('[sf]'),

  // "You may play this personnel aboard your [Sta] ship."
  'daniels timeless guardian': aboardShipWithAffiliation('[sta]'),

  // "You may play this personnel aboard your non-[Bor][Voy] ship."
  "telek r'mor anachronistic visitor": (_card, deckRows) => hasNonBorgShipWithIcon(deckRows, '[voy]'),

  // "You may play this ship to the same mission as your {Enterprise}."
  'shuttlepod one reliable transport': withNamedShip('enterprise'),
  'shuttlepod two landing craft': withNamedShip('enterprise'),

  // "You may play this personnel aboard your {Starship Excelsior}."
  'hikaru sulu loyal captain': withNamedShip('starship excelsior'),

  // "You may play this personnel aboard your {U.S.S. Reliant}."
  'clark terrell reliant captain': withNamedShip('u.s.s. reliant'),

  // "You may play this personnel aboard your {U.S.S. Voyager}."
  'dr. lewis zimmerman diagnostic program alpha one one': withNamedShip('u.s.s. voyager'),
  'william t. riker surprised witness': withNamedShip('u.s.s. voyager'),

  // "...you may play this ship at {Caretaker's Array} or at the same
  // mission as your {U.S.S. Voyager}." (the Caretaker's Array/headquarters
  // clauses are dropped, matching the precedent for extra location
  // qualifiers noted in the file header).
  'drake voyager shuttle': withNamedShip('u.s.s. voyager'),
  'baxial salvage ship': withNamedShip('u.s.s. voyager'),
  'baxial salvage ship (fow)': withNamedShip('u.s.s. voyager'),
  'cochrane voyager shuttle': withNamedShip('u.s.s. voyager'),

  // "...you may play this ship at the same mission as your {U.S.S. Voyager}."
  'delta flyer innovative vessel': withNamedShip('u.s.s. voyager'),
  'delta flyer innovative vessel (fow)': withNamedShip('u.s.s. voyager'),
  'delta flyer rebuilt "hot rod"': withNamedShip('u.s.s. voyager'),

  // "You may play this personnel aboard your {U.S.S. Prometheus}."
  'e.m.h. mark ii newborn but filled with courage': withNamedShip('u.s.s. prometheus'),
};

export function deckPlayabilityMatches(card: CardRow, deckRows: CardRow[]): boolean {
  const baseName = stripVariantSuffix(card.name);
  const predicate = DECK_PLAYABILITY[baseName];
  return !!predicate && predicate(card, deckRows);
}

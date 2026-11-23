// The modifier rows of the ships and of the personnel that change ships (#1635, #1648, #1664, #1671, #1684): a
// ship's own Range, Weapons and Shields, a personnel aboard or anywhere the player commands, and a ship's rows of
// the personnel aboard it or at its mission. "Attributes" on a ship are Range, Weapons and Shields, so one
// sentence is one row of the three, with one shared change (`each`); a ship whose text gives its Range and its
// Weapons different changes carries one per quantity. A stopped personnel is still aboard.

import { commandsKeywordCard, distinctTitleCount, keywordCards, missions as viewMissions, type TableView } from '../../tableView';
import { type AmountContext, type AmountQuantity, each, type ModifierCard, type ModifierRow, row } from '../model';
import {
  crewPersonnel,
  hasAffiliation,
  hasIcon,
  hasKeyword,
  hasSkill,
  hasWholeIcon,
  hasWord,
  hereAt,
  isPersonnel,
  printedOf,
  rowIsNamed,
  speciesOf,
  vornCrewed,
} from '../words';
import { attributes } from './attributes';

const SHIP_ATTRIBUTES: readonly AmountQuantity[] = ['range', 'weapons', 'shields'];
/** A ship's attributes +`n`: its Range, its Weapons and its Shields. */
const shipAttributes = (n: number | ((c: AmountContext) => number)) => each(SHIP_ATTRIBUTES, n);
/** A ship's Weapons and Shields +`n`, its attributes but its Range. */
const weaponsAndShields = (n: number | ((c: AmountContext) => number)) => each(['weapons', 'shields'], n);

// The cards the player commands with the keyword `word`, by distinct title (#1683, `keywordCards`).
const titlesWith = (view: TableView, keyword: string): number => distinctTitleCount(keywordCards(view, { keyword }));

// "While you command a Maneuver event" (I.K.S. Chontay).
const MANEUVER_EVENT = commandsKeywordCard({ keyword: 'maneuver', type: 'event' });

// A ship's Range less `n` while more than `limit` personnel are aboard: the Shuttlepods, Ganges, Rio Grande.
const crowded = (ship: ModifierCard, limit: number, n: number) => (crewPersonnel(ship).length > limit ? -n : 0);

// "This ship is attributes +1 for each [DS9] personnel aboard (limit +5)." The icon is read whole, as for Nog.
const ganges = ({ source }: AmountContext) => Math.min(5, crewPersonnel(source).filter((p) => hasWholeIcon(p, '[ds9]')).length);

// "While you have a captive, this ship is attributes +2." A captive is a personnel in the brig.
const qelPohCaptive = ({ view }: AmountContext) => (view.brig.some((c) => c.type === 'personnel') ? 2 : 0);

// "While you command two missions that are worth 40 points or more, this ship is Range +2." Read as two missions
// each worth 40 or more. In a solo game the player commands every mission. (both I.K.S. Qel'Poh)
const qelPohRange = ({ view }: AmountContext) => (viewMissions(view).filter((m) => (Number(m.card?.row?.points) || 0) >= 40).length >= 2 ? 2 : 0);

// "This ship is Range -1 and Weapons +1 for each completed mission you command." (Vidiian Cruiser, Vidiian Interceptor)
const completed = ({ view }: AmountContext) => viewMissions(view, { completed: true }).length;
const vidiian = { range: (c: AmountContext) => -completed(c), weapons: completed };

export const SHIP_ROWS: ModifierRow[] = [
  // "While your [Fed] Medical personnel is aboard this ship, it is Range +5."
  row('U.S.S. Pasteur Medical Ship', 'self', 'self', {
    range: ({ source }) => (crewPersonnel(source).some((p) => hasAffiliation(p, 'federation') && hasSkill(p, 'medical')) ? 5 : 0),
  }),
  // "While you command more than five personnel aboard this ship, it is Range -2."
  row('Shuttlepod One Reliable Transport', 'self', 'self', { range: ({ source }) => crowded(source, 5, 2) }),
  row('Shuttlepod Two Landing Craft', 'self', 'self', { range: ({ source }) => crowded(source, 5, 2) }),
  // "While you command more than seven personnel aboard this ship, it is Range -3. This ship is attributes +1 for
  // each [DS9] personnel aboard (limit +5)."
  row('U.S.S. Ganges One of the First', 'self', 'self', { range: (c) => crowded(c.source, 7, 3) + ganges(c), ...weaponsAndShields(ganges) }),
  // "While you command more than seven personnel aboard this ship, it is range -3. … While your Engineer is
  // aboard, this ship is Range +1."
  row('U.S.S. Rio Grande Built to Last', 'self', 'self', {
    range: ({ source }) => crowded(source, 7, 3) + (crewPersonnel(source).some((p) => hasSkill(p, 'engineer')) ? 1 : 0),
  }),
  row('Vidiian Cruiser', 'self', 'self', vidiian),
  row('Vidiian Interceptor', 'self', 'self', vidiian),
  row("I.K.S. Qel'Poh H.M.S. Bounty", 'self', 'self', { range: qelPohRange }),
  row("I.K.S. Qel'Poh Clandestine Vessel", 'self', 'self', { range: (c) => qelPohRange(c) + qelPohCaptive(c), ...weaponsAndShields(qelPohCaptive) }),
  // "This ship is Range +1 for each [Rom] personnel aboard who has a cost of 4 or more (Limit +3)." and "This ship
  // is Weapons +1 and Shields +1 for each [Pa][Rom] personnel aboard (Limit +3)."
  row('Bird-of-Prey', 'self', 'self', {
    range: ({ source }) => Math.min(3, crewPersonnel(source).filter((p) => hasAffiliation(p, 'romulan') && printedOf(p, 'cost') >= 4).length),
    ...weaponsAndShields(({ source }) => Math.min(3, crewPersonnel(source).filter((p) => hasIcon(p, 'pa') && hasAffiliation(p, 'romulan')).length)),
  }),
  // "While an opponent does not command a ship at a Region: Neutral Zone mission, for each Region: Neutral Zone
  // mission you command, this ship is Range +1 (limit +3)." A solo table has no opponent ship.
  row('Pi Off Course', 'self', 'self', {
    range: ({ view }) => Math.min(3, viewMissions(view).filter((m) => String(m.card?.row?.keywords ?? '').toLowerCase().includes('region: neutral zone')).length),
  }),
  // "While this personnel is aboard your [Pa][TNG] ship, that ship is Range +1."
  row('Fredericks', 'aboard', 'itsShip', { range: ({ target }) => (hasIcon(target, 'pa') && hasIcon(target, 'tng') ? 1 : 0) }),
  // "While this personnel is aboard your [Fed] ship, it is Range +2."
  row('Thomas Riker Defiant Leader', 'aboard', 'itsShip', { range: ({ target }) => (hasAffiliation(target, 'federation') ? 2 : 0) }),
  // "While this personnel is aboard a [Baj] ship, it is Range +1."
  row('Benjamin Sisko Shipwright', 'aboard', 'itsShip', { range: ({ target }) => (hasAffiliation(target, 'bajoran') ? 1 : 0) }),
  // "While you have no cards in your hand, this ship is Range +2." Range only.
  row('I.S.S. Enterprise Terran Flagship', 'self', 'self', { range: ({ view }) => (view.hand.length === 0 ? 2 : 0) }),

  // The ship clauses of #1671.
  // "While you have a ship in your discard pile, this ship is attributes +2." Any number of ships there give +2 once.
  row('Groumall Inauspicious Command', 'self', 'self', shipAttributes(({ view }) => (view.discard.some((c) => c.type === 'ship') ? 2 : 0))),
  // "Each of your [SF] ships is attributes +1."
  row('A. G. Robinson Prototype Captain', 'commanded', 'shipsOnRows', shipAttributes(({ target }) => (hasAffiliation(target, 'starfleet') ? 1 : 0))),
  // "While your [TNG] personnel with a cost of 4 or more is present, the ship he is aboard is attributes +1."
  // Another personnel of the crew: Wesley is [TNG] with a cost of 4 himself.
  row(
    'Wesley Crusher Battleship Helmsman',
    'aboard',
    'itsShip',
    shipAttributes(({ source, target }) => (crewPersonnel(target).some((p) => p.id !== source.id && hasIcon(p, 'tng') && printedOf(p, 'cost') >= 4) ? 1 : 0))
  ),
  // "While she is aboard your {Columbia}, that ship is attributes +2."
  row('Erika Hernandez Comparable Captain', 'aboard', 'itsShip', shipAttributes(({ target }) => (rowIsNamed(target.row, 'Columbia') ? 2 : 0))),
  // "While he is aboard your {Galaxy-class ship}, it is Weapons +2 and Shields +2." Read from the ship's class.
  row('Geordi La Forge Resolute Presence', 'aboard', 'itsShip', weaponsAndShields(({ target }) => (hasWord(target.row?.class, 'galaxy') ? 2 : 0))),
  // "Weapons +1 for each Honor Klingon aboard (limit +3)." Klingon is the species, as `gains.ts` reads it.
  row('I.K.S. Rotarran Ship of Tears', 'self', 'self', {
    weapons: ({ source }) => Math.min(3, crewPersonnel(source).filter((p) => hasSkill(p, 'honor') && hasWord(p.row?.species, 'klingon')).length),
  }),
  // "While your [Car] Intelligence personnel is aboard, this ship is attributes +2."
  row(
    'Keldon Advanced',
    'self',
    'self',
    shipAttributes(({ source }) => (crewPersonnel(source).some((p) => hasAffiliation(p, 'cardassian') && hasSkill(p, 'intelligence')) ? 2 : 0))
  ),
  // "While you have a Transporters personnel aboard, this ship is attributes +1."
  row('Sarajevo Starfleet Vessel', 'self', 'self', shipAttributes(({ source }) => (crewPersonnel(source).some((p) => hasSkill(p, 'transporters')) ? 1 : 0))),
  // "Attributes +1 for each of the keywords Kai, Prylar and Vedek you have aboard." Each keyword once: two Vedeks
  // give +1.
  row(
    'Vedek Assembly Transport',
    'self',
    'self',
    shipAttributes(({ source }) => ['kai', 'prylar', 'vedek'].filter((word) => crewPersonnel(source).some((p) => hasKeyword(p, word))).length)
  ),
  // "While this personnel is aboard your [DS9] ship, it is attributes +1 for each [Fut] personnel aboard (limit
  // +4)." Nog, [Fut], counts himself. The icon of the ship is read whole.
  row(
    'Nog Defiant Captain',
    'aboard',
    'itsShip',
    shipAttributes(({ target }) => (hasWholeIcon(target, '[ds9]') ? Math.min(4, crewPersonnel(target).filter((p) => hasIcon(p, 'fut')).length) : 0))
  ),
  // "While this personnel is aboard your [Car] ship, that ship is attributes +1 for each of your different Capture
  // cards and each of your different Punishment cards." Each keyword counts its own titles, so a card with both
  // counts twice.
  row(
    'Jasad',
    'aboard',
    'itsShip',
    shipAttributes(({ view, target }) => (hasAffiliation(target, 'cardassian') ? titlesWith(view, 'capture') + titlesWith(view, 'punishment') : 0))
  ),
  // The single-deck ships of #1684.
  // "Attributes +1 for each of these species you have aboard it: Changeling, Jem'Hadar, Vorta." Each species once.
  row(
    'Dominion Battleship',
    'self',
    'self',
    shipAttributes(({ source }) => ['changeling', "jem'hadar", 'vorta'].filter((species) => crewPersonnel(source).some((p) => speciesOf(p) === species)).length)
  ),
  // "While you have three different species aboard this ship, it is attributes +2." A personnel with no species
  // adds none.
  row(
    'Enterprise Finally Ready to Swim',
    'self',
    'self',
    shipAttributes(({ source }) => (new Set(crewPersonnel(source).map(speciesOf).filter(Boolean)).size >= 3 ? 2 : 0))
  ),
  // "While you command a Maneuver event, this ship is attributes +1." In the core or placed on a mission or a ship.
  row('I.K.S. Chontay On the Hunt', 'self', 'self', shipAttributes(1), { condition: MANEUVER_EVENT }),
  // "While this ship is at a space mission, it is Weapons +2."
  row("I.K.S. Hegh'ta", 'self', 'self', { weapons: ({ slot }) => (slot?.type === 's' ? 2 : 0) }),
  // "While your three [Kli] Treachery personnel are aboard, this ship is attributes +2. While your three [Kli]
  // Treachery personnel are aboard, each of your Treachery personnel at this mission is attributes +1." At this
  // mission: the away team and the crews of the ships here, as #1664 reads it, the three aboard too.
  row('I.K.S. Vorn Ship of Traitors', 'self', 'self', shipAttributes(({ source }) => (vornCrewed(source) ? 2 : 0))),
  row(
    'I.K.S. Vorn Ship of Traitors',
    'shipRow',
    'any',
    attributes(({ view, source, slot, target }) => (isPersonnel(target) && hasSkill(target, 'treachery') && vornCrewed(source) && hereAt(view, slot!.index, target) ? 1 : 0))
  ),
  // "While you command three Bajoran Resistance personnel aboard this ship, it is attributes +2." The keyword
  // "Bajoran Resistance".
  row(
    "Te'nari Resistance Flagship",
    'self',
    'self',
    shipAttributes(({ source }) => (crewPersonnel(source).filter((p) => String(p.row?.keywords ?? '').toLowerCase().includes('bajoran resistance')).length >= 3 ? 2 : 0))
  ),
  // "This ship is attributes +1 for each of your Cadets aboard (limit +4)." Cadet is a keyword.
  row('U.S.S. Valiant Red Squad Training Ship', 'self', 'self', shipAttributes(({ source }) => Math.min(4, crewPersonnel(source).filter((p) => hasKeyword(p, 'cadet')).length))),
  // "While this ship is at a [Bor] mission, personnel aboard it are attributes +1."
  row(
    "Queen's Borg Sphere Contingency Vessel",
    'shipRow',
    'crew',
    attributes(({ slot, target }) => (isPersonnel(target) && hasWord(slot?.card?.row?.affiliation, 'bor') ? 1 : 0))
  ),
];

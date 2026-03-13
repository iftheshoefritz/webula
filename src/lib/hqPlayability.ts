// Mapping from lowercased HQ mission card names to predicates that determine
// which cards can be played at (report to) that headquarters.
//
// Card data is lowercased by useDataFetching, so all field comparisons are lowercase.
// Game rule summary:
//   "[Baj] cards"  = Bajoran affiliation
//   "[DS9] cards"  = DS9 series icon
//   "[NA] cards"   = Non-Aligned affiliation
//   "equipment"    = type === 'equipment'

type CardRow = Record<string, any>;
type HQPredicate = (card: CardRow) => boolean;

const isNA = (card: CardRow): boolean => card.affiliation.includes('non-aligned');
const isEquipment = (card: CardRow): boolean => card.type === 'equipment';
const isNonUnique = (card: CardRow): boolean => card.unique === 'n';

// HQ card names in display (mixed-case) form, used for the typeahead list.
export const HQ_NAMES: string[] = [
  'Athos IV Maquis Base',
  'Bajor Blessed of the Prophets',
  'Bajor Gift of the Prophets',
  'Bajor Terok Nor',
  'Caretaker\'s Array Equinox',
  'Caretaker\'s Array Voyager',
  'Cardassia Prime Bastion of Resistance',
  'Cardassia Prime Hardscrabble World',
  'Cardassia Prime Subjugated Planet',
  'Ceti Alpha V Khan',
  'Earth Cradle of the Federation',
  'Earth Home of Starfleet Command',
  'Earth Humanity\'s Home',
  'Earth Lush and Beautiful Home',
  'Ferenginar Financial Hub',
  'Founders\' Homeworld Contingent Refuge',
  'Founders\' Homeworld Home of the Great Link',
  'Grid 296 Holographic Training Facility',
  'Luna Orpheus Mining Facility',
  'Mouth of the Wormhole Deep Space 9',
  'Mouth of the Wormhole Terok Nor',
  'Orias III Hidden Base',
  'Prevent Historical Disruption Relativity',
  'Qo\'noS Heart of the Empire',
  'Quatal Prime Quiet Mining Colony',
  'Romulus Patient Stronghold',
  'Romulus Seat of Power',
  'Unicomplex Root of the Hive Mind',
  'Vidiia Locus of Infection',
];

// Keys are the lowercased versions of HQ_NAMES.
export const HQ_PLAYABILITY: Record<string, HQPredicate> = {
  // Maquis Headquarters (Athos IV Maquis Base)
  // "You may play [Maq] cards, [NA] cards, and equipment at this mission."
  'athos iv maquis base': (card) =>
    card.icons.includes('[maq]') || isNA(card) || isEquipment(card),

  // Bajoran Headquarters (Bajor Blessed of the Prophets)
  // "You may play [Baj] cards and equipment at this mission." (no NA)
  'bajor blessed of the prophets': (card) =>
    card.affiliation.includes('bajoran') || isEquipment(card),

  // Bajoran Headquarters (Bajor Gift of the Prophets)
  // "You may play [Baj] cards, [NA] cards, and equipment at this mission."
  'bajor gift of the prophets': (card) =>
    card.affiliation.includes('bajoran') || isNA(card) || isEquipment(card),

  // Alliance Headquarters (Bajor Terok Nor)
  // "You may play [AU][Baj] cards, [AU][Car] cards, [AU][Fer] cards,
  //  [AU][Kli] cards, [AU][Non] cards, and equipment at this mission."
  // Secondary gametext: grants [AU] to each non-unique [Car] and non-unique [Kli] personnel you own.
  'bajor terok nor': (card) =>
    (card.icons.includes('[au]') && (
      card.affiliation.includes('bajoran') ||
      card.affiliation.includes('cardassian') ||
      card.affiliation.includes('ferengi') ||
      card.affiliation.includes('klingon') ||
      card.affiliation.includes('non-aligned')
    )) ||
    (isNonUnique(card) && card.type === 'personnel' && card.affiliation.includes('cardassian')) ||
    (isNonUnique(card) && card.type === 'personnel' && card.affiliation.includes('klingon')) ||
    isEquipment(card),

  // Voyager no-HQ (Caretaker's Array Voyager)
  // "While this ship is at a [DQ] mission, you may play [Voy] personnel, [NA] personnel,
  //  and equipment aboard this ship."
  "caretaker's array voyager": (card) =>
    card.icons.includes('[voy]') || isNA(card) || isEquipment(card),

  // Equinox no-HQ (Caretaker's Array Equinox)
  // "While this ship is at a [DQ] mission, you may play [Voy] Treachery personnel,
  //  [NA] personnel, and equipment aboard this ship."
  "caretaker's array equinox": (card) =>
    (card.icons.includes('[voy]') && card.skills.includes('treachery')) ||
    (isNA(card) && card.type === 'personnel') ||
    isEquipment(card),

  // Cardassian Headquarters (Cardassia Prime Bastion of Resistance)
  // "You may play [Car] Dissidents, [NA] Dissidents, and [Car] ships, and equipment."
  'cardassia prime bastion of resistance': (card) =>
    (card.affiliation.includes('cardassian') && card.keywords.includes('dissident')) ||
    (isNA(card) && card.keywords.includes('dissident')) ||
    (card.affiliation.includes('cardassian') && card.type === 'ship') ||
    isEquipment(card),

  // Cardassian Headquarters (Cardassia Prime Hardscrabble World)
  // "You may play [Car] cards, [NA] cards, and equipment at this mission."
  'cardassia prime hardscrabble world': (card) =>
    card.affiliation.includes('cardassian') || isNA(card) || isEquipment(card),

  // Dominion Headquarters (Cardassia Prime Subjugated Planet)
  // "You may play [Dom] cards and equipment at this mission." (no NA)
  'cardassia prime subjugated planet': (card) =>
    card.affiliation.includes('dominion') || isEquipment(card),

  // Khan/To Rule in Hell no-HQ (Ceti Alpha V Khan)
  // "You may play [NA] Genetically Enhanced personnel and equipment at this mission."
  'ceti alpha v khan': (card) =>
    (isNA(card) && card.keywords.includes('genetically enhanced') && card.type === 'personnel') ||
    isEquipment(card),

  // Federation Headquarters (Earth Cradle of the Federation)
  // "You may play [TNG] cards, [E] cards, [NA] cards, and equipment at this mission."
  'earth cradle of the federation': (card) =>
    card.icons.includes('[tng]') || card.icons.includes('[e]') || isNA(card) || isEquipment(card),

  // Federation Headquarters (Earth Home of Starfleet Command)
  // "You may play [Fed][DS9] cards, [E] cards, [NA] cards, and equipment at this mission."
  'earth home of starfleet command': (card) =>
    (card.affiliation.includes('federation') && card.icons.includes('[ds9]')) ||
    card.icons.includes('[e]') || isNA(card) || isEquipment(card),

  // Starfleet Headquarters (Earth Humanity's Home)
  // "You may play [SF] cards, [NA] cards, and equipment at this mission."
  "earth humanity's home": (card) =>
    card.affiliation.includes('starfleet') || isNA(card) || isEquipment(card),

  // Federation Headquarters (Earth Lush and Beautiful Home)
  // "You may play [TOS] cards, [NA] cards, and equipment at this mission."
  'earth lush and beautiful home': (card) =>
    card.icons.includes('[tos]') || isNA(card) || isEquipment(card),

  // Ferengi Headquarters (Ferenginar Financial Hub)
  // "You may play [Fer] cards, [NA] cards, and equipment at this mission."
  'ferenginar financial hub': (card) =>
    card.affiliation.includes('ferengi') || isNA(card) || isEquipment(card),

  // Dominion Headquarters (Founders' Homeworld Contingent Refuge)
  // "You may play [Dom] cards and equipment at this mission." (no NA)
  "founders' homeworld contingent refuge": (card) =>
    card.affiliation.includes('dominion') || isEquipment(card),

  // Dominion Headquarters (Founders' Homeworld Home of the Great Link)
  // "You may play [Dom] cards, [NA] cards, and equipment at this mission."
  "founders' homeworld home of the great link": (card) =>
    card.affiliation.includes('dominion') || isNA(card) || isEquipment(card),

  // Photonic Headquarters (Grid 296 Holographic Training Facility)
  // "You may play Holograms, equipment, and [NA] ships at this mission."
  'grid 296 holographic training facility': (card) =>
    card.keywords.includes('hologram') ||
    isEquipment(card) ||
    (isNA(card) && card.type === 'ship'),

  // Terra Prime Headquarters (Luna Orpheus Mining Facility)
  // "You may play [SF] ships, [SF] Dissident personnel, [Non] Human personnel, and equipment."
  'luna orpheus mining facility': (card) =>
    (card.affiliation.includes('starfleet') && card.type === 'ship') ||
    (card.affiliation.includes('starfleet') && card.keywords.includes('dissident')) ||
    (isNA(card) && card.species && card.species.includes('human') && card.type === 'personnel') ||
    isEquipment(card),

  // Bajoran/Federation Headquarters (Mouth of the Wormhole Deep Space 9)
  // "You may play [DS9] cards, [NA] cards, and equipment at this mission."
  'mouth of the wormhole deep space 9': (card) =>
    card.icons.includes('[ds9]') || isNA(card) || isEquipment(card),

  // Cardassian/Dominion Headquarters (Mouth of the Wormhole Terok Nor)
  // "You may play [TN] cards, [NA] cards, and equipment at this mission."
  'mouth of the wormhole terok nor': (card) =>
    card.icons.includes('[tn]') || isNA(card) || isEquipment(card),

  // Tal Shiar/Obsidian Order Headquarters (Orias III Hidden Base)
  // "You may play [Car] Intelligence personnel, [Rom] Intelligence personnel,
  //  D'deridex-class ships, Keldon-class ships, and equipment at this mission."
  'orias iii hidden base': (card) =>
    (card.affiliation.includes('cardassian') && card.type === 'personnel' && card.skills.includes('intelligence')) ||
    (card.affiliation.includes('romulan') && card.type === 'personnel' && card.skills.includes('intelligence')) ||
    (card.type === 'ship' && card.class.includes("d'deridex class")) ||
    (card.type === 'ship' && card.class.includes('keldon class')) ||
    isEquipment(card),

  // Relativity no-HQ (Prevent Historical Disruption Relativity)
  // "You may play [Fut][Fed] personnel and equipment aboard this ship."
  // Temporal ships may also report to the mission.
  'prevent historical disruption relativity': (card) =>
    (card.icons.includes('[fut]') && card.affiliation.includes('federation') && card.type === 'personnel') ||
    (card.keywords.includes('temporal') && card.type === 'ship') ||
    isEquipment(card),

  // Klingon Headquarters (Qo'noS Heart of the Empire)
  // "You may play [Kli] cards, [NA] cards, and equipment at this mission."
  "qo'nos heart of the empire": (card) =>
    card.affiliation.includes('klingon') || isNA(card) || isEquipment(card),

  // Maquis Headquarters (Quatal Prime Quiet Mining Colony)
  // "You may play [Maq] cards and equipment at this mission." (no NA)
  'quatal prime quiet mining colony': (card) =>
    card.icons.includes('[maq]') || isEquipment(card),

  // Romulan Headquarters (Romulus Patient Stronghold)
  // "You may play [Rom] cards and equipment at this mission." (no NA)
  'romulus patient stronghold': (card) =>
    card.affiliation.includes('romulan') || isEquipment(card),

  // Romulan Headquarters (Romulus Seat of Power)
  // "You may play [Rom] cards, [NA] cards, and equipment at this mission."
  'romulus seat of power': (card) =>
    card.affiliation.includes('romulan') || isNA(card) || isEquipment(card),

  // Borg Headquarters (Unicomplex Root of the Hive Mind)
  // "You may play [Bor] cards and equipment at this mission." (no NA)
  'unicomplex root of the hive mind': (card) =>
    card.affiliation.includes('borg') || isEquipment(card),

  // Vidiian Headquarters (Vidiia Locus of Infection)
  // "You may play [Vid] cards, [NA] cards, and equipment at this mission."
  'vidiia locus of infection': (card) =>
    card.affiliation.includes('vidiian') || isNA(card) || isEquipment(card),
};
